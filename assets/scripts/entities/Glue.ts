import { _decorator, Component, Node, Vec2, RigidBody2D, CCFloat, Graphics, Color, director } from 'cc';
import { Pole } from './Pole';
import { Stone } from './Stone';
import { StoneExplosion } from './StoneExplosion';
import { projectX, projectY, sizeXFactor } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';
import { GameMode } from '../config/GameMode';

const { ccclass, property } = _decorator;

const _force = new Vec2();
const CONTACT_GAP = 3;        // surface-surface ground px: a stone counts as "touching" an anchor at/under this → bond
const MAX_BONDS = 4;          // a stone may bond to up to this many anchors at once (a mesh, not just a chain)
const SCOSSA_GAP = 3;         // surface-surface ground px at/under which two structures count as "touching" → discharge
// Sticky-prototype COMPACTION MAGNET (SuperSlide15 model: gentle pull at a distance, ZERO at contact → no jitter).
// A rune is drawn toward any near, not-yet-touching rune so the whole blob huddles itself tight (edges meet);
// the instant they touch the magnet stops and a bond forms. Tunable feel.
const STICKY_MAGNET_REACH = 1.5;   // magnet reaches this × the rune's radius (edge-to-edge) toward a neighbour
const STICKY_MAGNET_FORCE = 150;   // peak pull (when nearly touching), easing to 0 at the reach edge; same force
                                   // scale as a bond spring (cohesion×distance ≈ hundreds). 0 = magnet off. MAIN KNOB.
const STICKY_BOND_MIN = 0.9;       // bond rest length = this × (r+r): <1 pulls the pair slightly TIGHTER than
                                   // collider-touching (lets the solver close the visual gap from the anisotropic perspective)

/** One elastic bond: an anchor + the stone's ORIGINAL offset from it (the rest position) + the break length. */
interface Bond { anchor: Glue; ox: number; oy: number; maxLen: number; }

/**
 * The GLUE (sticky) behaviour — DELIBERATELY separate from `Pole` and composable with it: put `Glue` on a
 * pole node in the editor to make that pole sticky (Pole + Glue), and `Stone.spawn` adds one to each stone
 * at runtime. A pole/stone can be solid-only (`Pole`) or also sticky (`+Glue`).
 *
 * ELASTIC POSITIONAL bonds (no magnetism, no weld, no speed threshold). The frame a free stone TOUCHES a
 * matching-colour anchor, a bond is formed that REMEMBERS the stone's position relative to that anchor. A
 * stone can bond to SEVERAL anchors at once (up to MAX_BONDS) → the structure is a spring MESH, not a chain.
 * Each bond is a spring that pulls the stone back to its original spot (restores both distance AND angle →
 * it resists sliding/rotating and returns to the rest shape — shape memory). The solid bodies stop deeper
 * penetration; a bond SNAPS if stretched past `maxStretch` × the touching length (a fast/heavy stone tears
 * free and carries on). All centre-to-centre forces — no Cocos joint — so none of the weld anchor/teleport
 * pitfalls. A stone with ≥1 bond is itself an anchor (the structure grows); lose all bonds → free again.
 */
@ccclass('Glue')
export class Glue extends Component {
    private static _all: Glue[] = [];
    static debugAll = false;
    private static _solvedFrame = -1;

    @property({ type: CCFloat, tooltip: 'Cohesion: how strongly the glue pulls a stuck stone back to its ORIGINAL spot (resists sliding & rotating). Higher = firmer/stiffer.' })
    cohesion = 30;
    @property({ type: CCFloat, tooltip: 'The glue SNAPS when stretched past this × the resting (touching) length. 1.5 = breaks at 150%.' })
    maxStretch = 1.5;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Firmness once stuck: 0 = springy/wobbly, 1 = almost static (heavy damping). The whole structure inherits the pole\'s value.' })
    firmness = 0.85;
    @property({ tooltip: 'Debug: draw the sticky surface, the bonds and the break radius.' })
    showDebug = false;

    // ---- runtime state (not editor props) ----
    gemType = -1;            // colour it bonds with (-1 = any; poles stay -1, stones set their gem at spawn)
    radius = 24;             // this glue's body radius in ground px (poles read it from Pole; stones set it)
    isAnchor = false;        // true once it has ≥1 bond (or always, for a pole) → matching stones can stick to it
    private _pole: Pole | null = null;
    private _rb: RigidBody2D | null = null;
    private _bonds: Bond[] = [];
    private _root: Glue | null = null;   // the pole this glued stone traces back to (recomputed each frame in _solve)
    private _freeDamping = -1;           // the stone's normal free-flight linearDamping (restored if it comes loose)
    private _dbg: Graphics | null = null;

    onLoad(): void {
        this._pole = this.getComponent(Pole);
        if (this._pole) { this.isAnchor = true; this.gemType = -1; this.radius = this._pole.radius; }
        else if (GameMode.stickyPrototype) this.isAnchor = true;   // every rune is a permanent sticky anchor (universal gluing)
    }
    onEnable(): void { Glue._all.push(this); if (this.showDebug) Glue.debugAll = true; }
    onDisable(): void {
        const i = Glue._all.indexOf(this);
        if (i >= 0) Glue._all.splice(i, 1);
        this._bonds.length = 0;
        if (!this._pole) this.isAnchor = false;
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }

    /** This glue's physics body: the pole's kinematic body, or the stone body's own. */
    private _body(): RigidBody2D | null {
        if (this._pole) return this._pole.bodyRb;
        if (!this._rb) this._rb = this.getComponent(RigidBody2D);
        return this._rb;
    }
    private _gx(): number { return this._pole ? this._pole.groundX : this.node.position.x; }
    private _gy(): number { return this._pole ? this._pole.groundY : this.node.position.y; }
    private _gapTo(a: Glue): number { return Math.hypot(a._gx() - this._gx(), a._gy() - this._gy()) - this.radius - a.radius; }
    private _bondedTo(a: Glue): boolean { for (const b of this._bonds) if (b.anchor === a) return true; return false; }

    update(): void {
        if (!this._pole) {                       // poles are passive anchors; stones bond + are reeled in
            if (GameMode.stickyPrototype) this._updateBondsSticky();
            else this._updateBonds();
        }
        if (Glue.debugAll || DebugDraw.enabled) this._drawDebug(); else if (this._dbg?.isValid) this._dbg.clear();
    }

    /** STICKY PROTOTYPE (GameMode.stickyPrototype): every rune is a permanent anchor and sticks to ANY rune it
     *  touches — TYPE-AGNOSTIC — so the whole field fuses into one soft blob. No pole rooting and no
     *  auto-discharge: the OVERPOWER shot (see Overpower.ts) detonates same-colour clusters instead.
     *
     *  Two cooperating forces, in ONE pass over the anchors:
     *   - COMPACTION MAGNET: a gentle pull toward each NEAR, not-yet-touching rune (force eases to 0 right at
     *     contact → no jitter) so the blob keeps huddling itself tight, closing the gaps between runes.
     *   - BONDS: the instant two runes touch, a spring bond forms that holds them at touching (rest shape +
     *     angle), snapping past maxStretch. */
    private _updateBondsSticky(): void {
        const rb = this._body();
        if (!rb) return;
        if (this._freeDamping < 0) this._freeDamping = rb.linearDamping;

        const magnetReach = this.radius * STICKY_MAGNET_REACH;
        let mfx = 0, mfy = 0;   // compaction-magnet force toward near runes (the blob hugging itself together)
        for (let i = 0; i < Glue._all.length; i++) {
            const a = Glue._all[i];
            if (a === this || !a.isAnchor) continue;
            const gap = this._gapTo(a);
            if (gap <= CONTACT_GAP) {
                // touching → bond (up to MAX_BONDS); no magnet here (avoids the contact jitter)
                if (this._bonds.length < MAX_BONDS && !this._bondedTo(a)) {
                    const dx0 = this._gx() - a._gx(), dy0 = this._gy() - a._gy(), len0 = Math.hypot(dx0, dy0) || 1;
                    const minLen = (this.radius + a.radius) * STICKY_BOND_MIN;   // rest = touching (× factor: a touch tighter)
                    this._bonds.push({ anchor: a, ox: dx0 / len0 * minLen, oy: dy0 / len0 * minLen,
                                       maxLen: minLen * Math.max(1.05, this.maxStretch) });
                }
            } else if (STICKY_MAGNET_FORCE > 0 && gap <= magnetReach && !this._bondedTo(a)) {
                // near but not yet touching → gentle pull (stronger as it nears) so the blob compacts itself
                const dx = a._gx() - this._gx(), dy = a._gy() - this._gy(), d = Math.hypot(dx, dy) || 1;
                const k = STICKY_MAGNET_FORCE * (1 - gap / magnetReach);
                mfx += dx / d * k; mfy += dy / d * k;
            }
        }

        // each bond is a spring toward the spot the stone HAD relative to that anchor; drop dead/snapped bonds
        let fx = mfx, fy = mfy;
        for (let i = this._bonds.length - 1; i >= 0; i--) {
            const b = this._bonds[i];
            if (!b.anchor.isValid || !b.anchor.isAnchor) { this._bonds.splice(i, 1); continue; }
            const ax = b.anchor._gx(), ay = b.anchor._gy();
            if (Math.hypot(ax - this._gx(), ay - this._gy()) > b.maxLen) { this._bonds.splice(i, 1); continue; }   // snapped
            fx += this.cohesion * (ax + b.ox - this._gx());
            fy += this.cohesion * (ay + b.oy - this._gy());
        }

        rb.linearDamping = this._bonds.length > 0 ? this._bondedDamping() : this._freeDamping;   // stiff while stuck, free in flight
        if (fx !== 0 || fy !== 0) rb.applyForceToCenter(_force.set(fx, fy), true);
        // isAnchor stays true (set at spawn) → this rune is always a sticky target, even with zero bonds
    }

    private _updateBonds(): void {
        const rb = this._body();
        if (!rb) return;
        if (this._freeDamping < 0) this._freeDamping = rb.linearDamping;
        const wasAnchor = this.isAnchor;

        // 1. bond to every matching anchor we are touching and not yet bonded to (up to MAX_BONDS)
        if (this._bonds.length < MAX_BONDS) {
            for (let i = 0; i < Glue._all.length; i++) {
                const a = Glue._all[i];
                if (a === this || !a.isAnchor || this._bondedTo(a)) continue;
                if (!(a.gemType === -1 || a.gemType === this.gemType)) continue;
                if (this._gapTo(a) <= CONTACT_GAP) {
                    const dx0 = this._gx() - a._gx(), dy0 = this._gy() - a._gy(), len0 = Math.hypot(dx0, dy0) || 1;
                    const minLen = this.radius + a.radius;   // rest = touching, at the angle of first contact
                    this._bonds.push({ anchor: a, ox: dx0 / len0 * minLen, oy: dy0 / len0 * minLen,
                                       maxLen: minLen * Math.max(1.05, a.maxStretch) });
                    if (this._bonds.length >= MAX_BONDS) break;
                }
            }
        }

        // the moment we first join the structure, inherit the pole's tuning (so the whole mesh feels the same)
        if (this._bonds.length > 0 && !wasAnchor) {
            const a0 = this._bonds[0].anchor;
            this.cohesion = a0.cohesion; this.maxStretch = a0.maxStretch; this.firmness = a0.firmness;
            rb.linearDamping = this._bondedDamping();
        }

        // 2. each bond is a spring toward the spot the stone HAD relative to that anchor (restores position +
        //    angle); drop bonds whose anchor is gone or that are stretched past breaking.
        let fx = 0, fy = 0;
        for (let i = this._bonds.length - 1; i >= 0; i--) {
            const b = this._bonds[i];
            if (!b.anchor.isValid || !b.anchor.isAnchor) { this._bonds.splice(i, 1); continue; }
            const ax = b.anchor._gx(), ay = b.anchor._gy();
            if (Math.hypot(ax - this._gx(), ay - this._gy()) > b.maxLen) { this._bonds.splice(i, 1); continue; }   // snapped
            fx += this.cohesion * (ax + b.ox - this._gx());
            fy += this.cohesion * (ay + b.oy - this._gy());
        }

        this.isAnchor = this._bonds.length > 0;
        if (!this.isAnchor && wasAnchor && this._freeDamping >= 0) rb.linearDamping = this._freeDamping;   // came loose → flies on
        if (this.isAnchor) rb.applyForceToCenter(_force.set(fx, fy), true);
    }

    private _bondedDamping(): number { return 0.5 + this.firmness * 14; }   // 0.5 (springy) → 14.5 (almost static)

    /** Once per frame (guarded), regardless of how many glues call it. */
    lateUpdate(): void {
        if (GameMode.stickyPrototype) return;   // sticky prototype: no pole-circuit solve / auto-discharge (Overpower handles detonation)
        const f = director.getTotalFrames();
        if (f === Glue._solvedFrame) return;
        Glue._solvedFrame = f;
        Glue._solve();
    }

    /** Trace every glued stone back to its pole, then: (1) release any group that lost its path to a pole
     *  (orphans come unstuck at once); (2) fire the SCOSSA when two structures rooted at DIFFERENT poles
     *  connect — a same-colour bond bridge OR a physical touch of any colour. */
    private static _solve(): void {
        const all = Glue._all;
        for (let i = 0; i < all.length; i++) all[i]._root = all[i]._pole ? all[i] : null;   // poles root themselves

        // propagate the root pole through the bond mesh; a stone reaching TWO poles closes the circuit
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < all.length; i++) {
                const g = all[i];
                if (g._pole) continue;
                for (let k = 0; k < g._bonds.length; k++) {
                    const anchor = g._bonds[k].anchor;
                    if (!anchor.isValid) continue;   // bond to a just-destroyed stone → ignore (dropped next _updateBonds)
                    const r = anchor._root;
                    if (!r) continue;
                    if (!g._root) { g._root = r; changed = true; }
                    else if (g._root !== r) { Glue._discharge(g._root, r); return; }
                }
            }
        }

        // a glued stone with no root lost its path to the pole → release the whole orphan group immediately
        for (let i = 0; i < all.length; i++) {
            const g = all[i];
            if (!g._pole && g.isAnchor && !g._root) g._releaseAll();
        }

        // two structures from DIFFERENT poles physically touching (any colour) → discharge
        for (let i = 0; i < all.length; i++) {
            const a = all[i];
            if (a._pole || !a._root) continue;
            for (let j = i + 1; j < all.length; j++) {
                const b = all[j];
                if (b._pole || !b._root || b._root === a._root) continue;
                if (a._gapTo(b) <= SCOSSA_GAP) { Glue._discharge(a._root, b._root, a, b); return; }
            }
        }
    }

    /** SCOSSA: destroy ONLY the stones forming the CONNECTION (the path) between the two poles — not the
     *  whole structures. BFS the bond graph (plus the optional physical-contact link) for a path rootA→rootB
     *  and blow up the stones on it; any branches left orphaned are freed by the next _solve. */
    private static _discharge(rootA: Glue, rootB: Glue, linkA: Glue | null = null, linkB: Glue | null = null): void {
        const all = Glue._all;
        const tmp: Glue[] = [];
        const neighbours = (g: Glue): Glue[] => {
            tmp.length = 0;
            for (let k = 0; k < g._bonds.length; k++) { const a = g._bonds[k].anchor; if (a.isValid) tmp.push(a); }   // its anchors
            for (let i = 0; i < all.length; i++) { const h = all[i]; for (let k = 0; k < h._bonds.length; k++) if (h._bonds[k].anchor === g) { tmp.push(h); break; } }   // its bonded children
            if (linkA && linkB) { if (g === linkA) tmp.push(linkB); else if (g === linkB) tmp.push(linkA); }            // the physical contact bridge
            return tmp;
        };
        // BFS rootA → rootB, remembering parents to rebuild the path
        const prev = new Map<Glue, Glue | null>();
        prev.set(rootA, null);
        const queue: Glue[] = [rootA];
        while (queue.length) {
            const cur = queue.shift()!;
            if (cur === rootB) break;
            const ns = neighbours(cur);
            for (let i = 0; i < ns.length; i++) { const nb = ns[i]; if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); } }
        }
        // keep only the STONES on the path (the poles survive)
        const doomed: Glue[] = [];
        if (prev.has(rootB)) for (let n: Glue | null = rootB; n; n = prev.get(n) ?? null) if (!n._pole) doomed.push(n);
        const pa = rootA.node?.name ?? '?', pb = rootB.node?.name ?? '?';
        console.log(`[Glue] SCOSSA! '${pa}' <-> '${pb}' — ${doomed.length} connecting stones destroyed`);
        for (let i = 0; i < doomed.length; i++) {
            const g = doomed[i], view = g.getComponent(Stone)?.viewNode;
            if (view?.isValid) StoneExplosion.play(view.parent, view.worldPosition, view.worldScale);
            if (g.node?.isValid) g.node.destroy();
        }
    }

    /** Come fully unstuck: drop all bonds, go free, restore the free-flight drag. */
    private _releaseAll(): void {
        this._bonds.length = 0;
        this.isAnchor = false;
        const rb = this._body();
        if (rb && this._freeDamping >= 0) rb.linearDamping = this._freeDamping;
    }

    /** Debug: the sticky surface (anchor), each bond line + break radius. Drawn under the arena's PARENT
     *  (the world), kept LAST child and mirroring the arena transform, so it renders ABOVE the sprites. */
    private _drawDebug(): void {
        const arena = this._pole?.arena ?? this.node.parent;
        const world = arena?.parent;
        if (!arena?.isValid || !world?.isValid) { if (this._dbg?.isValid) this._dbg.clear(); return; }
        if (!this._dbg?.isValid) {
            const n = new Node('GlueDebug');
            n.layer = arena.layer;
            n.setParent(world);
            this._dbg = n.addComponent(Graphics);
            this._dbg.lineWidth = 3;
        }
        const dn = this._dbg.node;
        dn.setSiblingIndex(world.children.length - 1);
        dn.setPosition(arena.position);
        dn.setScale(arena.scale);
        const g = this._dbg;
        g.clear();
        const cx = projectX(this._gx(), this._gy()), cy = projectY(this._gy());
        if (this.isAnchor) {
            const rx = (this.radius + CONTACT_GAP) * sizeXFactor(this._gy());
            g.strokeColor = new Color(255, 210, 90, 150);
            g.ellipse(cx, cy, rx, rx * 0.5); g.stroke();
        }
        for (const b of this._bonds) {
            const px = projectX(b.anchor._gx(), b.anchor._gy()), py = projectY(b.anchor._gy());
            g.strokeColor = new Color(120, 230, 255, 235);
            g.moveTo(px, py); g.lineTo(cx, cy); g.stroke();
            const brk = b.maxLen * sizeXFactor(b.anchor._gy());
            g.strokeColor = new Color(255, 90, 90, 90);
            g.ellipse(px, py, brk, brk * 0.5); g.stroke();
        }
        if (this.isAnchor) { g.fillColor = new Color(120, 230, 255, 235); g.circle(cx, cy, 5); g.fill(); }
    }
}
