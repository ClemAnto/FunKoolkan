import { _decorator, Component, Node, Vec2, RigidBody2D, ERigidBody2DType, PolygonCollider2D, CCFloat, CCInteger, Graphics, Color } from 'cc';
import { projectY, unprojectY, configurePerspective } from '../config/Perspective';
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
 * PERSPECTIVE: physics lives in a flat GROUND space. The rim is authored in IMAGE space
 * (the 558x445 footprint you see) and its Y is DE-PROJECTED here (unprojectY), so a rune —
 * whose sprite is mapped back with projectY — bounces exactly on the visible rim. Consequence:
 * the debug-draw boundary (image space) does not match the taller ground-space walls; that is
 * correct (physics space ≠ visual space).
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

    @property({ type: CCFloat, tooltip: 'Inner rim inset from the LEFT footprint edge (px, image space).' })
    insetLeft = 24;
    @property({ type: CCFloat, tooltip: 'Inner rim inset from the RIGHT footprint edge (px, image space).' })
    insetRight = 24;
    @property({ type: CCFloat, tooltip: 'Inner rim inset from the TOP footprint edge (px, image space).' })
    insetTop = 24;
    @property({ type: CCFloat, tooltip: 'Inner rim inset from the BOTTOM footprint edge (px, image space).' })
    insetBottom = 24;

    @property({ type: CCFloat, tooltip: 'Corner radius (px, image space).' })
    cornerRadius = 48;
    @property({ type: CCInteger, slide: true, range: [1, 3, 1], tooltip: 'Straight segments approximating each rounded corner (max 3).' })
    cornerSegments = 3;
    @property({ type: CCFloat, tooltip: 'Wall thickness (physics px).' })
    wallThickness = 20;

    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Wall bounciness.' })
    restitution = 0.4;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Wall friction.' })
    friction = 0.1;

    @property({ tooltip: 'Draw the boundary outline in IMAGE space (traces the rim on the visible arena) for tuning. Debug only.' })
    showDebugOutline = false;

    private _walls: Node[] = [];
    private _boundaryImg: Vec2[] = [];
    private _boundaryPhys: Vec2[] = [];

    /** CCW boundary loop in PHYSICS (de-squashed) local space — the exact polyline the wall
     *  colliders were built on. Empty until rebuild() has run. Consumers reflect off p[i]→p[i+1]
     *  (loop closes p[last]→p[0]). */
    get boundaryPhysics(): readonly Vec2[] { return this._boundaryPhys; }
    /** Same loop in IMAGE (== visible) space, for overlays. */
    get boundaryImage(): readonly Vec2[] { return this._boundaryImg; }

    start(): void { this.rebuild(); }
    onDestroy(): void { this._clear(); }

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

        configurePerspective(H);   // ground-Y depth map keyed to this footprint height
        // Inner rim rect in IMAGE space (arena-local, anchor bottom-centre: x in [-W/2, W/2], y in [0, H]).
        const L = -W / 2 + this.insetLeft;
        const R =  W / 2 - this.insetRight;
        const B = this.insetBottom;
        const T = H - this.insetTop;
        if (R <= L || T <= B) { console.warn('[ArenaBounds] insets too large for the footprint'); return; }

        const r = Math.max(0, Math.min(this.cornerRadius, (R - L) / 2, (T - B) / 2));
        const n = Math.max(1, Math.min(3, Math.round(this.cornerSegments)));

        // Ordered inner-rim boundary points in IMAGE space, CCW.
        const img: Vec2[] = [];
        const arc = (cx: number, cy: number, a0: number, a1: number) => {
            for (let i = 0; i <= n; i++) {
                const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
                img.push(new Vec2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
            }
        };
        arc(R - r, B + r, -90,   0);  // bottom-right corner
        arc(R - r, T - r,   0,  90);  // top-right corner
        arc(L + r, T - r,  90, 180);  // top-left corner
        arc(L + r, B + r, 180, 270);  // bottom-left corner

        // Expose the boundary loop (image + de-projected ground space) for the launcher's trajectory.
        this._boundaryImg  = img.map(p => p.clone());
        this._boundaryPhys = img.map(p => new Vec2(p.x, unprojectY(p.y)));

        // Physics walls: same boundary with Y DE-PROJECTED into ground space (unprojectY),
        // so runes (drawn back via projectY) bounce exactly on the visible rim.
        const t = this.wallThickness;
        for (let i = 0; i < img.length; i++) {
            const p0 = new Vec2(img[i].x,                 unprojectY(img[i].y));
            const p1 = new Vec2(img[(i + 1) % img.length].x, unprojectY(img[(i + 1) % img.length].y));
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

        // Debug: trace the ACTUAL physics walls (ground space) projected back to visual.
        if (this.showDebugOutline) this._drawOutline();
    }

    /** Draw the real physics boundary (ground space) projected back through projectY, so the
     *  cyan overlay must land exactly on the painted rim. If the de-projection (unprojectY) were
     *  wrong, projectY(unprojectY(rim)) ≠ rim and the mismatch would be visible — a far better
     *  tuning aid than drawing the raw image rim (which can never reveal a de-projection bug). */
    private _drawOutline(): void {
        const b = this._boundaryPhys;
        if (b.length < 2) return;
        const node = new Node('BoundsDebug');
        node.layer = this.node.layer;
        node.setParent(this.node);
        node.setPosition(0, 0, 0);
        const g = node.addComponent(Graphics);
        g.lineWidth = 3;
        g.strokeColor = new Color(0, 255, 255, 220);
        g.moveTo(b[0].x, projectY(b[0].y));
        for (let i = 1; i < b.length; i++) g.lineTo(b[i].x, projectY(b[i].y));
        g.close();
        g.stroke();
        this._walls.push(node);
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
