import { _decorator, Component, Node, Vec2, Vec3, Mat4, CCFloat, RigidBody2D, ERigidBody2DType, CircleCollider2D } from 'cc';
import { unprojectX, unprojectY, physicsDepth } from '../config/Perspective';

const { ccclass, property } = _decorator;

// Reused scratch (allocation-free hot path: solve() runs every frame).
const _inv = new Mat4();
const _wp = new Vec3();
const _force = new Vec2();

/**
 * Magnetic attractor for the mana-circuit core. Two flavours of the SAME behaviour:
 *
 *  - **Pole** (`isPole`, e.g. dawn/sunset): a fixed attractor that pulls ANY stone, always active. It
 *    also owns a circular KINEMATIC physics body in ground space (like a stone, but immovable) so
 *    stones physically rest against it — the body is created lazily and re-pinned on resize.
 *  - **Stone**: attached to a launched stone's body; becomes a magnet ONLY once it is *connected*
 *    (transitively touching a pole through a same-colour chain), and then attracts SAME-colour
 *    stones only. This is what grows monochromatic bridges out from each pole.
 *
 * Everything is solved in the arena's flat GROUND space (the same space the stone bodies and the
 * launch velocity live in). A stone body is a direct child of the arena, so its ground position is
 * just `node.position`; a pole lives in the (projected) stone layer, so its world position is mapped
 * back through the arena transform and de-projected (unprojectX/Y) to ground.
 *
 * Forces are applied to the stones' RigidBody2D via applyForceToCenter, normalised to 60 fps by the
 * caller (dtScale = dt × 60). The pull is ONE-SIDED (only when the surfaces are separated, never a
 * push past contact) and ramps hard near contact (×(1 + t²·hold)) so attached stones hardly part —
 * connected stones also get extra linear damping so clusters settle instead of jittering.
 */
@ccclass('Magnet')
export class Magnet extends Component {
    // ---- registry (every live magnet; the scene controller drives Magnet.solve once per frame) ----
    private static _all: Magnet[] = [];

    // ---- global tunables (ground px / force units) — set once by the coordinator (ArenaManager) ----
    static attractGap = 100;     // surface-surface ground px within which attraction acts
    static contactGap = 16;      // surface-surface ground px counted as "connected/touching" (chain conductivity)
    static force = 600;          // base pull force
    static hold = 14;            // contact-hold ramp: pull = force×(1 + t²·hold), t→1 at contact
    static settleDamping = 6;    // linearDamping applied to a connected stone (settles clusters)

    // ---- per-instance config ----
    // POLE: attach Magnet to the dawn/sunset node in the EDITOR and set these in the Inspector.
    // STONE (runtime): Stone.spawn calls Magnet.attach() which sets them in code.
    @property({ tooltip: 'Pole: attracts ANY stone + owns a solid circular body. (Stones set this in code at spawn.)' })
    isPole = false;
    @property({ type: Node, tooltip: 'POLE only — Arena container, to map the pole\'s projected view position to ground space.' })
    arena: Node | null = null;
    @property({ type: CCFloat, tooltip: 'Collider/attraction radius in GROUND px (pole body radius). Stones override it in code.' })
    radius = 60;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'POLE body restitution (low → stones stick instead of bouncing off).' })
    poleRestitution = 0;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'POLE body friction.' })
    poleFriction = 0.3;

    /** Colour it conducts (-1 = any). Poles stay -1; stones set their gem in code at spawn. */
    gemType = -1;
    /** A stone's linearDamping while NOT connected (set in code at spawn; restored when it detaches). */
    flightDamping = 0.5;

    // ---- runtime state ----
    connected = false;           // stone: part of a pole-rooted same-colour chain (a pole is always "connected")
    private _rb: RigidBody2D | null = null;
    private _gx = 0;             // cached ground position, refreshed per solve
    private _gy = 0;
    private _proxy: Node | null = null;   // pole only: the kinematic circular body under the arena

    /** Get-or-add a Magnet on a node and configure it — used for STONES at spawn (runtime). Poles
     *  instead carry a Magnet attached in the EDITOR (configured via its @property fields). */
    static attach(node: Node, opts: { isPole?: boolean; gemType?: number; radius: number; arena: Node | null; flightDamping?: number; restitution?: number; friction?: number }): Magnet {
        const m = node.getComponent(Magnet) ?? node.addComponent(Magnet);
        m.isPole = !!opts.isPole;
        m.gemType = opts.isPole ? -1 : (opts.gemType ?? 0);
        m.radius = opts.radius;
        m.arena = opts.arena;
        if (opts.flightDamping !== undefined) m.flightDamping = opts.flightDamping;
        if (opts.restitution !== undefined) m.poleRestitution = opts.restitution;
        if (opts.friction !== undefined) m.poleFriction = opts.friction;
        return m;
    }

    onEnable(): void { Magnet._all.push(this); }
    onDisable(): void {
        const i = Magnet._all.indexOf(this);
        if (i >= 0) Magnet._all.splice(i, 1);
        if (this._proxy?.isValid) this._proxy.destroy();
        this._proxy = null;
    }

    /** Pole only: lazily create the circular KINEMATIC body under the arena (same ground space as the
     *  stone bodies) so stones physically rest against the pole, then keep it pinned to the pole's
     *  ground position (re-pins on resize when the projection — hence the ground point — shifts). */
    private _ensureProxy(): void {
        const arena = this.arena;
        if (!arena?.isValid || physicsDepth() <= 0) return;   // wait until the perspective is configured
        if (!this._proxy?.isValid) {
            const n = new Node('PoleBody');
            n.layer = arena.layer;
            n.setParent(arena);
            const rb = n.addComponent(RigidBody2D);
            rb.type = ERigidBody2DType.Kinematic;   // immovable guardian: blocks stones, never pushed
            rb.gravityScale = 0;
            rb.enabledContactListener = true;
            const col = n.addComponent(CircleCollider2D);
            col.radius = this.radius;
            col.restitution = this.poleRestitution;
            col.friction = this.poleFriction;
            col.apply();
            this._proxy = n;
        }
        const p = this._proxy.position;
        if (Math.abs(p.x - this._gx) > 0.5 || Math.abs(p.y - this._gy) > 0.5) {
            this._proxy.setPosition(this._gx, this._gy, 0);
        }
    }

    private _body(): RigidBody2D | null {
        if (!this._rb && this.node?.isValid) this._rb = this.node.getComponent(RigidBody2D);
        return this._rb;
    }

    /** Refresh the cached GROUND position. A stone body is arena-local (already ground); a pole is a
     *  projected view node, so map world → arena-local → de-project. */
    private _refreshGroundPos(): void {
        if (!this.isPole) {
            const p = this.node.position;
            this._gx = p.x; this._gy = p.y;
            return;
        }
        const arena = this.arena;
        if (!arena?.isValid) { const p = this.node.worldPosition; this._gx = p.x; this._gy = p.y; return; }
        Mat4.invert(_inv, arena.worldMatrix);
        Vec3.transformMat4(_wp, this.node.worldPosition, _inv);   // world → arena-local projected (xv, yv)
        this._gx = unprojectX(_wp.x, _wp.y);
        this._gy = unprojectY(_wp.y);
        this._ensureProxy();   // keep the solid pole body pinned under the arena
    }

    /** Surface-to-surface ground distance between two magnets (negative = overlapping). */
    private static _gap(a: Magnet, b: Magnet): number {
        const dx = b._gx - a._gx, dy = b._gy - a._gy;
        return Math.hypot(dx, dy) - a.radius - b.radius;
    }

    /** Pull `target` toward `source` if their surfaces are separated but within range. One-sided
     *  (no push past contact), ramped hard near contact so the bond holds. */
    private static _pull(target: Magnet, source: Magnet, dtScale: number): void {
        const dx = source._gx - target._gx, dy = source._gy - target._gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-4) return;
        const gap = dist - target.radius - source.radius;
        if (gap <= 0 || gap > Magnet.attractGap) return;   // only when separated, within range
        const rb = target._body();
        if (!rb) return;
        const t = 1 - gap / Magnet.attractGap;              // 0 at the range edge → 1 at contact
        const f = Magnet.force * (1 + t * t * Magnet.hold) * dtScale;
        rb.applyForceToCenter(_force.set(dx / dist * f, dy / dist * f), true);
    }

    /**
     * One global step: refresh positions, recompute connectivity (BFS from the poles, expanding only
     * through same-colour contacts), then apply pole + connected-stone attraction. Called once per
     * frame by the scene controller with dtScale = dt × 60.
     */
    static solve(dtScale: number): void {
        const all = Magnet._all;
        const n = all.length;
        if (n === 0) return;

        for (let i = 0; i < n; i++) all[i]._refreshGroundPos();

        // --- connectivity: a stone is connected if it touches a pole (any colour) or a connected
        //     stone of its own colour. Poles are the BFS seeds' sources. ---
        for (let i = 0; i < n; i++) if (!all[i].isPole) all[i].connected = false;

        const queue: Magnet[] = [];
        for (let i = 0; i < n; i++) {
            const s = all[i];
            if (s.isPole) continue;
            for (let j = 0; j < n; j++) {
                const p = all[j];
                if (!p.isPole) continue;
                if (Magnet._gap(s, p) <= Magnet.contactGap) { s.connected = true; queue.push(s); break; }
            }
        }
        for (let h = 0; h < queue.length; h++) {
            const s = queue[h];
            for (let j = 0; j < n; j++) {
                const t = all[j];
                if (t.isPole || t.connected || t.gemType !== s.gemType) continue;
                if (Magnet._gap(s, t) <= Magnet.contactGap) { t.connected = true; queue.push(t); }
            }
        }

        // --- forces + settle damping ---
        for (let i = 0; i < n; i++) {
            const s = all[i];
            if (s.isPole) continue;
            const rb = s._body();
            if (rb) rb.linearDamping = s.connected ? Magnet.settleDamping : s.flightDamping;
            for (let j = 0; j < n; j++) {                 // poles attract ANY stone in range
                const p = all[j];
                if (p.isPole) Magnet._pull(s, p, dtScale);
            }
        }
        for (let i = 0; i < n; i++) {                     // connected stones attract SAME-colour stones
            const m = all[i];
            if (m.isPole || !m.connected) continue;
            for (let j = 0; j < n; j++) {
                const s = all[j];
                if (s.isPole || s === m || s.gemType !== m.gemType) continue;
                Magnet._pull(s, m, dtScale);
            }
        }
    }
}
