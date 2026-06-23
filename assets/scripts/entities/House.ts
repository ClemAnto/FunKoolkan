import { _decorator, Component, Node, Vec3, Mat4, UITransform, Graphics, Color } from 'cc';
import { physicsDepth, projectX, projectY, sizeXFactor, sizeYFactor } from '../config/Perspective';
import { Stone } from './Stone';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Reused scratch (allocation-free: refreshed every frame).
const _inv = new Mat4();
const _wp = new Vec3();

/** One curling zone (HOUSE ring or TEE button): the editor node it tracks, and its footprint as an
 *  ELLIPSE in the arena's local ON-SCREEN (visual) space — centre (vx,vy) + semi-axes (rx,ry). The
 *  ellipse matches the drawn sprite exactly, so the sensitive area IS what you see. */
interface Zone {
    node: Node | null;
    vx: number; vy: number; rx: number; ry: number;
}

/**
 * The curling HOUSE — central scoring zone (a target ring with a TEE at its centre). Authored in the
 * EDITOR on the Arena node; the HOUSE/TEE sprites are assigned via `house`/`tee` and this only attaches
 * BEHAVIOUR to them.
 *
 * The sensitive area of each zone is its sprite's ELLIPSE in on-screen (arena-local) space — the exact
 * shape drawn. A stone counts as "in" a zone when its PROJECTED position overlaps that ellipse, so the
 * test matches the art 1:1 (NOT a flat ground circle that, once projected, reaches far outside the
 * drawing). The curling-scoring logic (a stone resting on the TEE converts every same-type stone in the
 * HOUSE into a projectile) will read these zones via the same overlap test. No Box2D collider — the zone
 * is geometric (detection + debug-draw only); physics stones are tested directly.
 */
@ccclass('House')
@disallowMultiple
@menu('Arena/House')
export class House extends Component {
    @property({ type: Node, tooltip: 'The HOUSE node (scoring ring). Its sprite footprint + position define the house area.' })
    house: Node | null = null;
    @property({ type: Node, tooltip: 'The TEE node (centre button). Its sprite footprint + position define the tee area.' })
    tee: Node | null = null;
    @property({ tooltip: 'Debug: draw the house + tee areas (tracing the sprites) on screen.' })
    showDebug = false;

    /** HOUSE area as an on-screen (arena-local) ellipse: centre (x,y) + semi-axes (rx,ry). For scoring. */
    get houseArea(): Readonly<{ x: number; y: number; rx: number; ry: number }> { return { x: this._house.vx, y: this._house.vy, rx: this._house.rx, ry: this._house.ry }; }
    /** TEE area as an on-screen ellipse. */
    get teeArea(): Readonly<{ x: number; y: number; rx: number; ry: number }> { return { x: this._tee.vx, y: this._tee.vy, rx: this._tee.rx, ry: this._tee.ry }; }

    private _house: Zone = { node: null, vx: 0, vy: 0, rx: 0, ry: 0 };
    private _tee: Zone = { node: null, vx: 0, vy: 0, rx: 0, ry: 0 };
    private _dbg: Graphics | null = null;
    private _warned = false;
    private _teeHit = false;   // debug: a stone is currently on the tee

    onDisable(): void {
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }

    update(): void {
        if (physicsDepth() <= 0) return;   // perspective not configured yet (ArenaBounds builds it on start)
        this._refresh(this._house, this.house);
        this._refresh(this._tee, this.tee);
        this._detect();
        this._drawDebug();
    }

    /** Debug aid: flag stones overlapping the HOUSE (each thickens its outline) and whether any stone
     *  overlaps the TEE (the tee outline thickens). Same overlap test the scoring logic will use. Runs
     *  only while a debug view is on; clears the per-stone flag otherwise. */
    private _detect(): void {
        const live = this.showDebug || Stone.debugDraw;
        let teeHit = false;
        const stones = Stone.all;
        for (let i = 0; i < stones.length; i++) {
            const st = stones[i];
            if (!live || !st.node?.isValid) { st.debugInHouse = false; continue; }
            const p = st.node.position;                          // ground space (body is a child of the arena)
            const svx = projectX(p.x, p.y), svy = projectY(p.y); // → arena-local visual (where the sprite renders)
            const srx = st.radius * sizeXFactor(p.y);            // stone's on-screen radius (horizontal)
            const sry = st.radius * sizeYFactor(p.y);            // ...and vertical (foreshortened by the ground tilt)
            st.debugInHouse = this._overlaps(this._house, svx, svy, srx, sry);
            if (this._overlaps(this._tee, svx, svy, srx, sry)) teeHit = true;
        }
        this._teeHit = live && teeHit;
    }

    /** Stones whose projected footprint overlaps the HOUSE ring. Fills `out` (cleared first). */
    collectStonesInHouse(out: Stone[]): void { this._collect(this._house, out); }
    /** Stones whose projected footprint overlaps the TEE. Fills `out` (cleared first). */
    collectStonesOnTee(out: Stone[]): void { this._collect(this._tee, out); }

    /** Shared query for the curling scoring: every live stone whose on-screen ellipse overlaps `zone`
     *  (same projected-position test as the debug detection). Zones are refreshed each frame in update(). */
    private _collect(zone: Zone, out: Stone[]): void {
        out.length = 0;
        if (zone.rx <= 0 || zone.ry <= 0) return;
        const stones = Stone.all;
        for (let i = 0; i < stones.length; i++) {
            const st = stones[i];
            if (!st.node?.isValid) continue;
            const p = st.node.position;                          // ground space
            const svx = projectX(p.x, p.y), svy = projectY(p.y); // → arena-local visual
            const srx = st.radius * sizeXFactor(p.y), sry = st.radius * sizeYFactor(p.y);
            if (this._overlaps(zone, svx, svy, srx, sry)) out.push(st);
        }
    }

    /** Whether a stone (on-screen centre + radii) overlaps the zone's ellipse — the stone is treated as
     *  a point and the ellipse inflated by the stone's on-screen radii (a good "touching" approximation). */
    private _overlaps(zone: Zone, svx: number, svy: number, srx: number, sry: number): boolean {
        if (zone.rx <= 0 || zone.ry <= 0) return false;
        const dx = svx - zone.vx, dy = svy - zone.vy;
        const ex = zone.rx + srx, ey = zone.ry + sry;
        return (dx * dx) / (ex * ex) + (dy * dy) / (ey * ey) <= 1;
    }

    /** Map an assigned node to its on-screen (arena-local) ellipse: centre + half-size of its sprite. */
    private _refresh(zone: Zone, node: Node | null): void {
        zone.node = node;
        if (!node?.isValid) { zone.rx = zone.ry = 0; return; }

        // Centre: node world position → arena-local — this IS its on-screen (visual) position.
        Mat4.invert(_inv, this.node.worldMatrix);
        Vec3.transformMat4(_wp, node.worldPosition, _inv);
        zone.vx = _wp.x; zone.vy = _wp.y;

        // Semi-axes: the sprite's footprint in arena-local units (world size ÷ arena world scale).
        const ui = node.getComponent(UITransform);
        if (!ui || ui.contentSize.width <= 0 || ui.contentSize.height <= 0) {
            if (!this._warned) { console.warn(`[House] '${node.name}' has no UITransform size — zone skipped`); this._warned = true; }
            zone.rx = zone.ry = 0;
            return;
        }
        const ws = node.worldScale, as = this.node.worldScale;
        zone.rx = ui.contentSize.width  * 0.5 * (ws.x / (as.x || 1));
        zone.ry = ui.contentSize.height * 0.5 * (ws.y / (as.y || 1));
    }

    /** Debug: trace each zone's ellipse (matching its sprite) + a centre cross. Drawn under the arena's
     *  PARENT (the world), kept LAST child and mirroring the arena transform, so arena-local coords map
     *  correctly and it renders ABOVE the stone-layer sprites. */
    private _drawDebug(): void {
        const arena = this.node, world = arena.parent;
        if (!this.showDebug || !world?.isValid) { if (this._dbg?.isValid) this._dbg.clear(); return; }
        if (!this._dbg?.isValid) {
            const dnode = new Node('HouseDebug');
            dnode.layer = arena.layer;
            dnode.setParent(world);
            this._dbg = dnode.addComponent(Graphics);
            this._dbg.lineWidth = 3;
        }
        const dn = this._dbg.node;
        dn.setSiblingIndex(world.children.length - 1);   // keep above the stone-layer sprites
        dn.setPosition(arena.position);                  // mirror the arena (position + scale)
        dn.setScale(arena.scale);
        this._dbg.clear();
        this._drawZone(this._dbg, this._house, new Color(120, 200, 255, 230), 3);                  // house = blue
        this._drawZone(this._dbg, this._tee, new Color(255, 120, 200, 235), this._teeHit ? 7 : 3); // tee = pink (thick while hit)
    }

    private _drawZone(g: Graphics, zone: Zone, color: Color, width: number): void {
        if (!zone.node?.isValid || zone.rx <= 0 || zone.ry <= 0) return;
        g.lineWidth = width;
        g.strokeColor = color;
        g.ellipse(zone.vx, zone.vy, zone.rx, zone.ry);
        g.moveTo(zone.vx - zone.rx, zone.vy); g.lineTo(zone.vx + zone.rx, zone.vy);   // cross to mark the centre
        g.moveTo(zone.vx, zone.vy - zone.ry); g.lineTo(zone.vx, zone.vy + zone.ry);
        g.stroke();
    }
}
