import { _decorator, Component, Node, Vec2, RigidBody2D, CCFloat, Graphics, Color, director } from 'cc';
import { Pole } from './Pole';
import { projectX, projectY, sizeXFactor } from '../config/Perspective';

const { ccclass, property } = _decorator;

const _force = new Vec2();
const CONTACT_GAP = 3;        // surface-surface ground px: a stone counts as "touching" an anchor at/under this → bond
const MAX_BONDS = 4;          // a stone may bond to up to this many anchors at once (a mesh, not just a chain)
const SCOSSA_GAP = 3;         // surface-surface ground px at/under which two structures count as "touching" → discharge

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
        if (!this._pole) this._updateBonds();   // poles are passive anchors; stones bond + are reeled in
        if (Glue.debugAll) this._drawDebug(); else if (this._dbg?.isValid) this._dbg.clear();
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
                    const r = g._bonds[k].anchor._root;
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
                if (a._gapTo(b) <= SCOSSA_GAP) { Glue._discharge(a._root, b._root); return; }
            }
        }
    }

    /** SCOSSA placeholder: log the event + the number of stones involved, then destroy both structures. */
    private static _discharge(rootA: Glue, rootB: Glue): void {
        const doomed: Glue[] = [];
        for (let i = 0; i < Glue._all.length; i++) {
            const g = Glue._all[i];
            if (!g._pole && (g._root === rootA || g._root === rootB)) doomed.push(g);
        }
        const pa = rootA.node?.name ?? '?', pb = rootB.node?.name ?? '?';
        console.log(`[Glue] SCOSSA! poles '${pa}' <-> '${pb}' connected — ${doomed.length} stones involved → discharge`);
        for (let i = 0; i < doomed.length; i++) if (doomed[i].node?.isValid) doomed[i].node.destroy();
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
