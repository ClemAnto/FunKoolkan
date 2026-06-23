import { _decorator, Component, Node, Vec2, RigidBody2D, ERigidBody2DType, PolygonCollider2D, CCFloat, CCInteger, Graphics, Color } from 'cc';
import { projectX, projectY, unprojectY, configurePerspective, physicsDepth } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';
import { FitScale } from '../ui/FitScale';

const { ccclass, property, disallowMultiple, menu } = _decorator;

/**
 * Builds the static Box2D containment boundary for the arena (the rounded-rect rim the
 * runes bounce off, from the inside). Replaces the old Track funnel walls.
 *
 * Cocos has no edge/chain collider, so the boundary is composed of many thin static
 * wall quads (PolygonCollider2D) traced along the inner edge of the rim: 4 straight
 * sides + 4 rounded corners, each corner approximated by up to 3 chord segments.
 *
 * PERSPECTIVE (model B): physics lives in a flat GROUND space. The rim is built DIRECTLY in
 * ground space (x in [-W/2, W/2], y in [0, D = physicsDepth() = H/sFar]) and the walls ARE those
 * ground points. Rendering PROJECTS the rim FORWARD (projectX/projectY) into the visible TRAPEZOID
 * — so a rune (also projected) bounces exactly on the visible rim. The debug overlay draws the
 * same projected rim, so it must land on the painted arena floor.
 *
 * Place this on the Arena node (or a child of it): the wall children inherit the uniform
 * FitScale, so circle colliders stay circular and the boundary adapts to the screen.
 * FitScale re-applies the colliders on resize, so this builds ONCE at start.
 *
 * NOT executeInEditMode on purpose: the wall nodes are runtime-only and must never be
 * serialized into the scene. Tune the @property values and re-run with physics debug on.
 */
@ccclass('ArenaBounds')
@disallowMultiple
@menu('Arena/ArenaBounds')
export class ArenaBounds extends Component {
    @property({ type: CCFloat, tooltip: 'Footprint width (px). 0 = read from the active FitScale design size.' })
    footprintWidth = 0;
    @property({ type: CCFloat, tooltip: 'Footprint height (px). 0 = read from the active FitScale design size.' })
    footprintHeight = 0;

    @property({ type: CCFloat, tooltip: 'Left margin, VISUAL px at the bottom edge (X is 1:1 at the near edge; converges upward).' })
    insetLeft = 24;
    @property({ type: CCFloat, tooltip: 'Right margin, VISUAL px at the bottom edge (X is 1:1 at the near edge; converges upward).' })
    insetRight = 24;
    @property({ type: CCFloat, tooltip: 'Top margin from the TOP screen edge, VISUAL px (mapped to ground via unprojectY). Increase to lower the top.' })
    insetTop = 24;
    @property({ type: CCFloat, tooltip: 'Bottom margin from the BOTTOM screen edge, VISUAL px (mapped to ground via unprojectY).' })
    insetBottom = 24;

    @property({ type: CCFloat, tooltip: 'Corner radius (ground-space px; the visible radius foreshortens with depth).' })
    cornerRadius = 48;
    @property({ type: CCInteger, slide: true, range: [1, 3, 1], tooltip: 'Straight segments approximating each rounded corner (max 3).' })
    cornerSegments = 3;
    @property({ type: CCFloat, tooltip: 'Wall thickness (physics px).' })
    wallThickness = 20;

    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Wall bounciness.' })
    restitution = 0.4;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Wall friction.' })
    friction = 0.1;

    @property({ tooltip: 'Draw the ground walls projected forward (traces the rim on the visible arena floor) for tuning. Debug only.' })
    showDebugOutline = false;

    private _walls: Node[] = [];
    private _boundaryImg: Vec2[] = [];
    private _boundaryPhys: Vec2[] = [];
    private _dbg: Graphics | null = null;   // outline overlay, shown reactively (per-instance flag OR global DebugDraw)

    /** CCW boundary loop in PHYSICS (de-squashed) local space — the exact polyline the wall
     *  colliders were built on. Empty until rebuild() has run. Consumers reflect off p[i]→p[i+1]
     *  (loop closes p[last]→p[0]). */
    get boundaryPhysics(): readonly Vec2[] { return this._boundaryPhys; }
    /** Same loop in IMAGE (== visible) space, for overlays. */
    get boundaryImage(): readonly Vec2[] { return this._boundaryImg; }

    start(): void { this.rebuild(); }
    onDestroy(): void { this._clear(); if (this._dbg?.isValid) this._dbg.node.destroy(); this._dbg = null; }

    /** Show/hide the rim outline reactively: the per-instance `showDebugOutline` OR the global DebugDraw
     *  switch (the HUD DEBUG button). The boundary is static, so this just redraws/clears the overlay. */
    update(): void {
        if (this.showDebugOutline || DebugDraw.enabled) this._drawOutline();
        else if (this._dbg?.isValid) this._dbg.clear();
    }

    private _clear(): void {
        for (const w of this._walls) if (w.isValid) w.destroy();
        this._walls = [];
    }

    /** (Re)build the static containment boundary as wall children of this node. */
    rebuild(): void {
        this._clear();

        const W = this.footprintWidth  > 0 ? this.footprintWidth  : (FitScale.instance?.designSize.width  ?? 0);
        const H = this.footprintHeight > 0 ? this.footprintHeight : (FitScale.instance?.designSize.height ?? 0);
        if (W <= 0 || H <= 0) { console.warn('[ArenaBounds] no footprint — set footprintWidth/Height or add a FitScale'); return; }

        configurePerspective(W, H);   // 1-point perspective keyed to this footprint
        const D = physicsDepth();
        // Inner rim rect in GROUND space (flat playfield; anchor bottom-centre: x in [-W/2,W/2],
        // y in [0,D]). Projected by the forward map it becomes the visible TRAPEZOID matching the
        // perspective floor; the physics walls ARE this rect directly (physics is flat ground space).
        const L = -W / 2 + this.insetLeft;
        const R =  W / 2 - this.insetRight;
        const B = unprojectY(this.insetBottom);    // VISUAL margin from the bottom screen edge → ground
        const T = unprojectY(H - this.insetTop);   // VISUAL margin from the top screen edge → ground
        if (R <= L || T <= B) { console.warn('[ArenaBounds] insets too large for the footprint'); return; }

        const r = Math.max(0, Math.min(this.cornerRadius, (R - L) / 2, (T - B) / 2));
        const n = Math.max(1, Math.min(3, Math.round(this.cornerSegments)));

        // Ordered inner-rim boundary points in GROUND space, CCW.
        const ground: Vec2[] = [];
        const arc = (cx: number, cy: number, a0: number, a1: number) => {
            for (let i = 0; i <= n; i++) {
                const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
                ground.push(new Vec2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
            }
        };
        arc(R - r, B + r, -90,   0);  // bottom-right (near) corner
        arc(R - r, T - r,   0,  90);  // top-right (far) corner
        arc(L + r, T - r,  90, 180);  // top-left (far) corner
        arc(L + r, B + r, 180, 270);  // bottom-left (near) corner

        // Walls = the ground rim directly. Expose it (ground) for the launcher trajectory, plus the
        // projected visible trapezoid (image) for overlays.
        this._boundaryPhys = ground.map(p => p.clone());
        this._boundaryImg  = ground.map(p => new Vec2(projectX(p.x, p.y), projectY(p.y)));

        const t = this.wallThickness;
        for (let i = 0; i < ground.length; i++) {
            const p0 = ground[i], p1 = ground[(i + 1) % ground.length];
            let dx = p1.x - p0.x, dy = p1.y - p0.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.001) continue;               // skip degenerate joins
            dx /= len; dy /= len;
            const nx = dy, ny = -dx;                 // outward normal of a CCW loop
            // CCW quad: the inner face (p0->p1) sits on the boundary, the wall extends outward.
            this._spawnWall(`Wall_${i}`, [
                new Vec2(p0.x + nx * t, p0.y + ny * t),
                new Vec2(p1.x + nx * t, p1.y + ny * t),
                new Vec2(p1.x, p1.y),
                new Vec2(p0.x, p0.y),
            ]);
        }
        // The debug outline is driven reactively by update() (per-instance flag OR the global DebugDraw).
    }

    /** Draw the real physics walls (ground space) projected FORWARD (projectX/projectY), so the
     *  cyan overlay must land exactly on the painted arena floor — a forward-projection sanity
     *  check. If the projection is mis-calibrated (wrong sFar), the overlay won't match the art.
     *  Uses a persistent child Graphics (created once) so it can be cleared/redrawn as the flag flips. */
    private _drawOutline(): void {
        const b = this._boundaryPhys;
        if (b.length < 2) { if (this._dbg?.isValid) this._dbg.clear(); return; }
        if (!this._dbg?.isValid) {
            const node = new Node('BoundsDebug');
            node.layer = this.node.layer;
            node.setParent(this.node);
            node.setPosition(0, 0, 0);
            this._dbg = node.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(0, 255, 255, 220);
        }
        const g = this._dbg;
        g.clear();
        g.moveTo(projectX(b[0].x, b[0].y), projectY(b[0].y));
        for (let i = 1; i < b.length; i++) g.lineTo(projectX(b[i].x, b[i].y), projectY(b[i].y));
        g.close();
        g.stroke();
    }

    private _spawnWall(name: string, points: Vec2[]): void {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(this.node);
        node.setPosition(0, 0, 0);
        const rb = node.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Static;
        const col = node.addComponent(PolygonCollider2D);
        col.points = points;
        col.friction = this.friction;
        col.restitution = this.restitution;
        this._walls.push(node);
    }
}
