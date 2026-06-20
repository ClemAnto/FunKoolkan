import { _decorator, Component, Node, Vec2, RigidBody2D, ERigidBody2DType, PolygonCollider2D, CircleCollider2D, CCFloat, CCInteger, Graphics, Color, Sprite, SpriteFrame, UITransform } from 'cc';
import { PERSPECTIVE_Y_SCALE } from '../config/Perspective';
import { FitScale } from '../ui/FitScale';
import { Stone } from './Stone';

const { ccclass, property, disallowMultiple, menu } = _decorator;

/**
 * Builds the static Box2D containment boundary for the arena (the rounded-rect rim the
 * runes bounce off, from the inside). Replaces the old Track funnel walls.
 *
 * Cocos has no edge/chain collider, so the boundary is composed of many thin static
 * wall quads (PolygonCollider2D) traced along the inner edge of the rim: 4 straight
 * sides + 4 rounded corners, each corner approximated by up to 3 chord segments.
 *
 * PERSPECTIVE: physics lives in an un-squashed space. The rim is authored in IMAGE space
 * (the 558x445 footprint you see) and its Y is DE-SQUASHED here (÷ PERSPECTIVE_Y_SCALE),
 * so a rune — whose sprite is mapped back with Y × PERSPECTIVE_Y_SCALE — bounces exactly
 * on the visible rim. Consequence: the debug-draw boundary looks ~2× taller than the
 * sprite. That is correct (physics space ≠ visual space).
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

    @property({ tooltip: 'Debug: spawn a fully-elastic ball at the arena centre with a random direction, to evaluate wall bounces (watch with physics debug draw on).' })
    spawnTestBall = false;
    @property({ type: CCFloat, tooltip: 'Test ball speed (units/s).' })
    testBallSpeed = 300;
    @property({ type: CCInteger, tooltip: 'How many test runes to spawn.' })
    testBallCount = 1;
    @property({ type: CCFloat, tooltip: 'Test ball radius (physics px).' })
    testBallRadius = 22;
    @property({ type: SpriteFrame, tooltip: 'Sprite drawn for the test ball (the "stone") in warriorsLayer. Assigned in the editor.' })
    stoneSprite: SpriteFrame | null = null;
    @property({ type: Node, tooltip: 'WarriorsLayer node where the stone sprite is placed (assigned in the editor).' })
    warriorsLayer: Node | null = null;

    private _walls: Node[] = [];

    start(): void {
        this.rebuild();
        if (this.spawnTestBall) {
            const n = Math.max(1, Math.round(this.testBallCount));
            for (let i = 0; i < n; i++) this._spawnTestBall(i, n);
        }
    }
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

        const pY = PERSPECTIVE_Y_SCALE || 1;
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

        // Physics walls: same boundary with Y DE-SQUASHED into physics space (÷ pY),
        // so runes (sprite mapped with Y × pY) bounce on the visible rim.
        const t = this.wallThickness;
        for (let i = 0; i < img.length; i++) {
            const p0 = new Vec2(img[i].x,                 img[i].y / pY);
            const p1 = new Vec2(img[(i + 1) % img.length].x, img[(i + 1) % img.length].y / pY);
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

        // Debug: trace the boundary in IMAGE space so it overlays the visible rim (tuning aid).
        if (this.showDebugOutline) this._drawOutline(img);
    }

    private _drawOutline(img: Vec2[]): void {
        if (img.length < 2) return;
        const node = new Node('BoundsDebug');
        node.layer = this.node.layer;
        node.setParent(this.node);
        node.setPosition(0, 0, 0);
        const g = node.addComponent(Graphics);
        g.lineWidth = 3;
        g.strokeColor = new Color(0, 255, 255, 220);
        g.moveTo(img[0].x, img[0].y);
        for (let i = 1; i < img.length; i++) g.lineTo(img[i].x, img[i].y);
        g.close();
        g.stroke();
        this._walls.push(node);
    }

    private _spawnTestBall(index: number, count: number): void {
        const H = this.footprintHeight > 0 ? this.footprintHeight : (FitScale.instance?.designSize.height ?? 445);
        const pY = PERSPECTIVE_Y_SCALE || 1;
        const cx = (index - (count - 1) / 2) * this.testBallRadius * 4;   // spread the runes horizontally
        const ball = new Node('TestBall_' + index);
        ball.layer = this.node.layer;
        ball.setParent(this.node);
        ball.setPosition(cx, (H / 2) / pY, 0);   // arena centre row, de-squashed into physics space
        const rb = ball.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Dynamic;
        rb.gravityScale = 0;
        rb.linearDamping = 0;
        rb.angularDamping = 0;
        rb.fixedRotation = true;
        rb.bullet = true;                        // CCD so a fast ball can't tunnel through thin walls
        const col = ball.addComponent(CircleCollider2D);
        col.radius = this.testBallRadius;
        col.restitution = 1;                     // elastic (mixed with walls -> max)
        col.friction = 0;
        col.apply();
        const a = Math.random() * Math.PI * 2;
        rb.linearVelocity = new Vec2(Math.cos(a) * this.testBallSpeed, Math.sin(a) * this.testBallSpeed);
        this._walls.push(ball);                  // tracked for cleanup

        // Linked view sprite in warriorsLayer (perspective-mapped by Stone) to see body↔sprite match.
        if (this.stoneSprite && this.warriorsLayer) {
            const view = new Node('StoneView_' + index);
            view.layer = this.warriorsLayer.layer;
            view.setParent(this.warriorsLayer);
            const sp = view.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;   // CUSTOM before spriteFrame, else UITransform is overwritten
            sp.spriteFrame = this.stoneSprite;
            view.getComponent(UITransform)!.setContentSize(this.testBallRadius * 2.4, this.testBallRadius * 2.4);
            const stone = ball.addComponent(Stone);
            stone.viewNode = view;
            stone.arena = this.node;
            this._walls.push(view);              // cleaned up with the ball
        }
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
