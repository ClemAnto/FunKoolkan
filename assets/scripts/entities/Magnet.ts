import { _decorator, Component, Node, Vec2, Vec3, Mat4, CCFloat, Graphics, Color, RigidBody2D, ERigidBody2DType, CircleCollider2D } from 'cc';
import { unprojectX, unprojectY, physicsDepth, projectX, projectY, sizeXFactor } from '../config/Perspective';

const { ccclass, property } = _decorator;

// Reused scratch (allocation-free hot path: solve() runs every frame).
const _inv = new Mat4();
const _wp = new Vec3();
const _force = new Vec2();
const FORCE_FPS_REF = 60;   // per-frame forces scaled by (dt × this) so integration matches 60 fps

/**
 * Magnetic attractor + "petrify on contact" for the mana-circuit core. Deterministic (no force-hold
 * oscillation): a FREE stone is pulled toward its NEAREST valid magnet (a pole, or a magnetized
 * same-colour stone); the instant it touches (gap ≤ snapGap) it PETRIFIES — snaps exactly onto the
 * parent's contour, turns Static (immovable, frozen, jitter-free), records its parent in the tree, and
 * becomes insensitive to every other magnet. The magnetized stones form a TREE rooted at the poles.
 *
 *  - **Pole** (`isPole`, dawn/sunset): a fixed attractor (any colour) with a solid KINEMATIC body.
 *  - **Stone** (runtime): free → pulled toward the nearest valid magnet → petrified on contact.
 *  - **Repel** (`repel`): pushes FREE stones away within range, never attracts.
 *
 * Why this beats the previous force model (per the Box2D research): a continuous force that holds a
 * pair together oscillates at the contact boundary and never lets the island sleep → jitter + endless
 * connect/detach. Freezing the body on contact removes the dynamics entirely: no force on a magnetized
 * stone, no tug-of-war between two poles, no jitter. A pulled stone targets only ONE magnet (nearest).
 *
 * Solved in arena GROUND space (stone body = child of arena → node.position = ground; pole body =
 * its kinematic proxy under the arena). Driven by ArenaManager.update → solve(dtScale = dt × 60).
 */
@ccclass('Magnet')
export class Magnet extends Component {
    private static _all: Magnet[] = [];

    // ---- global tunables (ground px / force units) — set once by the coordinator (ArenaManager) ----
    static attractGap = 12;      // surface-surface ground px within which a free stone is grabbed (SHORT range — a few px)
    static attractForce = 600;   // pull strength (stronger as it nears contact, to reliably reach the snap)
    static snapGap = 3;          // surface-surface ground px counted as "edges touching" → petrify timer is eligible
    static petrifyDelay = 2;     // seconds a stone must stay in the magnetism zone, near-still, before petrifying
    static petrifyMaxSpeed = 8;  // ground units/s: at or below this a stone counts as "near-still" for the petrify timer
    static repelRange = 120;     // surface-surface ground px within which a repel magnet pushes free stones
    static repelForce = 800;     // repel push strength
    static debugLog = false;     // log petrify events + a periodic tree summary (diagnostics)
    static debugTree = false;    // draw the magnetized tree (each petrified stone → its parent) for debug
    private static _frame = 0;
    private static _idCounter = 0;
    private static _treeDbg: Graphics | null = null;   // shared overlay for the magnetized tree

    // ---- per-instance config ----
    // POLE: attach Magnet in the EDITOR and set these. STONE (runtime): Stone.spawn → Magnet.attach().
    @property({ tooltip: 'Pole: attracts ANY stone + owns a solid circular body. (Stones set this in code at spawn.)' })
    isPole = false;
    @property({ tooltip: 'Inverse magnet: PUSHES free stones away within range and never attracts.' })
    repel = false;
    @property({ type: Node, tooltip: 'POLE only — Arena container, to map the pole\'s projected view position to ground space.' })
    arena: Node | null = null;
    @property({ type: CCFloat, tooltip: 'Collider/attraction radius in GROUND px (pole body radius). Stones override it in code.' })
    radius = 60;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'POLE body restitution (low → stones stick instead of bouncing off).' })
    poleRestitution = 0;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'POLE body friction.' })
    poleFriction = 0.3;
    @property({ tooltip: 'POLE debug: draw the solid circle (projected onto the floor) at runtime.' })
    showDebugCircle = false;

    /** Colour it conducts (-1 = any). Poles stay -1; stones set their gem in code at spawn. */
    gemType = -1;
    /** A FREE stone's linearDamping (set in code at spawn; a magnetized stone is Static, so unused then). */
    flightDamping = 0.5;

    // ---- runtime state ----
    connected = false;                        // stone: magnetized (petrified into the tree) → acts as a same-colour magnet
    parent: Magnet | null = null;             // tree parent it petrified onto (a pole or a magnetized stone). null = free/root
    private _rb: RigidBody2D | null = null;
    private _gx = 0;                           // cached ground position, refreshed per solve
    private _gy = 0;
    private _proxy: Node | null = null;        // pole only: the kinematic circular body under the arena
    private _dbg: Graphics | null = null;      // pole only: debug circle overlay
    private _dbgId = 0;                         // diagnostics: stable per-magnet id for logs
    private _wasConnected = false;             // diagnostics: previous magnetized state, to log the petrify transition
    private _magnetT = 0;                       // seconds spent in the magnetism zone near-still (petrify timer)

    static attach(node: Node, opts: { isPole?: boolean; repel?: boolean; gemType?: number; radius: number; arena: Node | null; flightDamping?: number; restitution?: number; friction?: number }): Magnet {
        const m = node.getComponent(Magnet) ?? node.addComponent(Magnet);
        m.isPole = !!opts.isPole;
        m.repel = !!opts.repel;
        m.gemType = opts.isPole ? -1 : (opts.gemType ?? 0);
        m.radius = opts.radius;
        m.arena = opts.arena;
        if (opts.flightDamping !== undefined) m.flightDamping = opts.flightDamping;
        if (opts.restitution !== undefined) m.poleRestitution = opts.restitution;
        if (opts.friction !== undefined) m.poleFriction = opts.friction;
        return m;
    }

    onEnable(): void { this._dbgId = ++Magnet._idCounter; Magnet._all.push(this); }
    onDisable(): void {
        const i = Magnet._all.indexOf(this);
        if (i >= 0) Magnet._all.splice(i, 1);
        // orphan any children pointing at us (their tree root is gone → they go free on next solve check)
        for (const m of Magnet._all) if (m.parent === this) { m.parent = null; m.connected = false; }
        if (this._proxy?.isValid) this._proxy.destroy();
        this._proxy = null;
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }

    private _body(): RigidBody2D | null {
        if (!this._rb && this.node?.isValid) this._rb = this.node.getComponent(RigidBody2D);
        return this._rb;
    }

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
        this._ensureProxy();
        this._drawDebug();
    }

    /** Pole only: lazily create the circular KINEMATIC body under the arena and keep it pinned. */
    private _ensureProxy(): void {
        const arena = this.arena;
        if (!arena?.isValid || physicsDepth() <= 0) return;
        if (!this._proxy?.isValid) {
            const n = new Node('PoleBody');
            n.layer = arena.layer;
            n.setParent(arena);
            const rb = n.addComponent(RigidBody2D);
            rb.type = ERigidBody2DType.Kinematic;
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

    /** Surface-to-surface ground gap between two magnets (negative = overlapping). */
    private static _gap(a: Magnet, b: Magnet): number {
        const dx = b._gx - a._gx, dy = b._gy - a._gy;
        return Math.hypot(dx, dy) - a.radius - b.radius;
    }

    /** Pull a free stone toward `source` (stronger as it nears contact, to reliably reach the snap). */
    private static _pull(target: Magnet, source: Magnet, dtScale: number): void {
        const dx = source._gx - target._gx, dy = source._gy - target._gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-4) return;
        const rb = target._body();
        if (!rb) return;
        const gap = dist - target.radius - source.radius;
        const t = Math.max(0.15, 1 - gap / Magnet.attractGap);   // 1 near contact → small (floor) at the range edge
        const f = Magnet.attractForce * t * dtScale;
        rb.applyForceToCenter(_force.set(dx / dist * f, dy / dist * f), true);
    }

    /** Repulsion push on a free stone away from a repel magnet, stronger near contact. */
    private static _push(target: Magnet, source: Magnet, dtScale: number): void {
        const dx = target._gx - source._gx, dy = target._gy - source._gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-4) return;
        const gap = dist - target.radius - source.radius;
        if (gap > Magnet.repelRange) return;
        const rb = target._body();
        if (!rb) return;
        const t = Math.max(0, 1 - gap / Magnet.repelRange);
        const f = Magnet.repelForce * t * dtScale;
        rb.applyForceToCenter(_force.set(dx / dist * f, dy / dist * f), true);
    }

    /** Petrify this free stone onto `parent`: snap exactly onto the parent's contour, freeze it (Static),
     *  record the tree parent. From now it is immovable and insensitive to every other magnet. */
    private _petrify(parent: Magnet): void {
        let dx = this._gx - parent._gx, dy = this._gy - parent._gy;
        let d = Math.hypot(dx, dy);
        if (d < 1e-4) { dx = 0; dy = 1; d = 1; }            // degenerate (centres coincide) → rest above
        const rest = parent.radius + this.radius;
        const nx = parent._gx + (dx / d) * rest, ny = parent._gy + (dy / d) * rest;
        this.node.setPosition(nx, ny, 0);                    // snap exactly onto the contour
        this._gx = nx; this._gy = ny;
        const rb = this._body();
        if (rb) {
            rb.linearVelocity = new Vec2(0, 0);
            rb.angularVelocity = 0;
            rb.type = ERigidBody2DType.Static;               // petrified: immovable, frozen, no forces
        }
        this.parent = parent;
        this.connected = true;
    }

    /**
     * One global step: refresh positions, then for each FREE stone pull it toward its NEAREST valid
     * magnet and petrify it on contact; repel magnets push free stones. Magnetized (petrified) stones
     * are Static — never touched. Called by ArenaManager with dtScale = dt × 60.
     */
    static solve(dt: number): void {
        const all = Magnet._all;
        const n = all.length;
        if (n === 0) return;
        Magnet._frame++;
        const dtScale = dt * FORCE_FPS_REF;

        for (let i = 0; i < n; i++) all[i]._refreshGroundPos();

        // --- free stones: grabbed by the NEAREST valid magnet (pole any colour, or magnetized same colour) ---
        for (let i = 0; i < n; i++) {
            const s = all[i];
            if (s.isPole || s.repel || s.connected) continue;   // poles / repellers / already petrified
            let best: Magnet | null = null, bestGap = Infinity;
            for (let j = 0; j < n; j++) {
                const a = all[j];
                if (a === s || a.repel) continue;
                if (!(a.isPole || (a.connected && a.gemType === s.gemType))) continue;
                const g = Magnet._gap(s, a);
                if (g < bestGap) { bestGap = g; best = a; }
            }
            if (!best || bestGap > Magnet.attractGap) { s._magnetT = 0; continue; }
            if (bestGap > Magnet.snapGap) {
                // FAR (but in grab range): pull toward the nearest magnet. Its momentum carries it the
                // last few px onto the solid target (no force at contact → no press-jitter; cf. SuperSlide15).
                s._magnetT = 0;
                Magnet._pull(s, best, dtScale);
            } else {
                // EDGES TOUCHING: NO force — the stone rests against the solid pole/stone by collision.
                // Petrify once it has stayed here NEAR-STILL for petrifyDelay seconds, then snap exactly
                // onto the contour. (Counting, not gluing: a passing/bouncing stone can still leave.)
                const v = s._body()?.linearVelocity;
                const sp = v ? Math.hypot(v.x, v.y) : 0;
                if (sp <= Magnet.petrifyMaxSpeed) {
                    s._magnetT += dt;
                    if (s._magnetT >= Magnet.petrifyDelay) s._petrify(best);
                } else {
                    s._magnetT = 0;   // still moving → restart the timer
                }
            }
        }

        // --- repel magnets push nearby FREE stones away ---
        for (let i = 0; i < n; i++) {
            const r = all[i];
            if (!r.repel) continue;
            for (let j = 0; j < n; j++) {
                const s = all[j];
                if (s === r || s.isPole || s.repel || s.connected) continue;
                Magnet._push(s, r, dtScale);
            }
        }

        if (Magnet.debugLog) Magnet._logState();
        Magnet._drawTree();
    }

    /** Debug (debugTree): draw the magnetized tree — a line from each petrified stone to its parent
     *  (pole or stone) plus a node dot — on a shared overlay above the stone-layer sprites. */
    private static _drawTree(): void {
        const all = Magnet._all;
        let arena: Node | null = null;
        for (let i = 0; i < all.length; i++) if (all[i].isPole && all[i].arena?.isValid) { arena = all[i].arena; break; }
        const world = arena?.parent;
        if (!Magnet.debugTree || !arena?.isValid || !world?.isValid) {
            if (Magnet._treeDbg?.isValid) Magnet._treeDbg.clear();
            return;
        }
        if (!Magnet._treeDbg?.isValid) {
            const n = new Node('MagnetTreeDebug');
            n.layer = arena.layer;
            n.setParent(world);
            Magnet._treeDbg = n.addComponent(Graphics);
            Magnet._treeDbg.lineWidth = 4;
            Magnet._treeDbg.strokeColor = new Color(120, 230, 255, 235);
        }
        const dn = Magnet._treeDbg.node;
        dn.setSiblingIndex(world.children.length - 1);   // above the stone-layer sprites
        dn.setPosition(arena.position);                  // mirror the arena (position + scale)
        dn.setScale(arena.scale);
        const g = Magnet._treeDbg;
        g.clear();
        for (let i = 0; i < all.length; i++) {
            const m = all[i];
            if (m.isPole || m.repel || !m.connected || !m.parent) continue;
            const cx = projectX(m._gx, m._gy), cy = projectY(m._gy);
            const px = projectX(m.parent._gx, m.parent._gy), py = projectY(m.parent._gy);
            g.moveTo(px, py); g.lineTo(cx, cy);   // edge to its tree parent
            g.circle(cx, cy, 5);                  // node marker
        }
        g.stroke();
    }

    /** Diagnostics (debugLog): log each petrify (with its tree parent) and a periodic tree summary. */
    private static _logState(): void {
        const all = Magnet._all;
        let magnetized = 0;
        for (const m of all) {
            if (m.isPole || m.repel) continue;
            if (m.connected) magnetized++;
            if (m.connected !== m._wasConnected) {
                if (m.connected) console.log(`[Magnet] #${m._dbgId} PETRIFIED on #${m.parent?._dbgId ?? '?'} at (${m._gx.toFixed(1)}, ${m._gy.toFixed(1)})`);
                else console.log(`[Magnet] #${m._dbgId} freed`);
                m._wasConnected = m.connected;
            }
        }
        if (Magnet._frame % 60 === 0) console.log(`[Magnet] frame=${Magnet._frame} magnetized=${magnetized}/${all.length}`);
    }

    /** Pole only: draw the solid circle projected onto the floor (debug), above the stone-layer sprites. */
    private _drawDebug(): void {
        const arena = this.arena, world = arena?.parent;
        if (!this.showDebugCircle || !arena?.isValid || !world?.isValid) {
            if (this._dbg?.isValid) this._dbg.clear();
            return;
        }
        if (!this._dbg?.isValid) {
            const dnode = new Node('PoleDebug');
            dnode.layer = arena.layer;
            dnode.setParent(world);
            this._dbg = dnode.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(255, 220, 80, 235);
        }
        const dn = this._dbg.node;
        dn.setSiblingIndex(world.children.length - 1);   // keep above the stone-layer sprites
        dn.setPosition(arena.position);                  // mirror the arena (position + scale)
        dn.setScale(arena.scale);
        const g = this._dbg;
        const cx = projectX(this._gx, this._gy), cy = projectY(this._gy);
        const rx = this.radius * sizeXFactor(this._gy), ry = rx * 0.5;   // flat ground disc (footprint)
        g.clear();
        g.ellipse(cx, cy, rx, ry);
        g.moveTo(cx - rx, cy); g.lineTo(cx + rx, cy);   // cross to mark the centre
        g.moveTo(cx, cy - ry); g.lineTo(cx, cy + ry);
        g.stroke();
    }
}
