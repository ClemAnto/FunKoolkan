import { _decorator, Component, Node, RigidBody2D, ERigidBody2DType, BoxCollider2D, PolygonCollider2D, Size, Vec2, UITransform, view, Graphics, Color, UIOpacity, tween, Tween } from 'cc';
const { ccclass, property } = _decorator;

// ── Layout — recalculated at startup from actual screen size ─────────────────
export let LAYOUT_SCALE   = 1.0;   // TRACK_W / 384 — proportional scale factor for all game elements
export let TRACK_W        = 400;   // bottom width, aspect ratio 5:12
export let TRACK_BOTTOM_Y = -640;  // bottom of visible screen
export let TRACK_TOP_Y    =  320;  // TRACK_BOTTOM_Y + TRACK_H
export let TRACK_H        =  960;  // min(75% screen height, 12/5 × 95% screen width)
export let GAME_OVER_LINE_Y = -160; // midpoint of track height
export let GAME_OVER_AREA   =  0.5; // normalized [0..1] fraction of track height from bottom
export let FUNNEL_OFFSET  =   48;  // TRACK_W * funnelPercentage / 200
// Inner edges of the funnel walls — set by buildWalls(), match Box2D collider geometry exactly
export let WALL_LB = new Vec2(-200,  -480); // left  wall bottom inner
export let WALL_LT = new Vec2(-176,   480); // left  wall top    inner
export let WALL_RB = new Vec2( 200,  -480); // right wall bottom inner
export let WALL_RT = new Vec2( 176,   480); // right wall top    inner


const ASPECT_RATIO = 6/10;

let _funnelPct = 25; // persisted across initLayout() calls without explicit arg

// ── Dynamic game-over line ────────────────────────────────────────────────────
// The editor GameOverLine node is the immutable LOWEST quota (end-game position).
// The line starts the game raised above it and steps down as new species unlock;
// GameManager owns the policy and calls setGameOverLineRaisePx with the offset.
let _goBaseLineY = GAME_OVER_LINE_Y; // quota with zero raise (editor-authoritative)
let _goRaisePx   = 0;                // current raise above the base, canvas px

function _applyGoLine(): void {
    GAME_OVER_LINE_Y = Math.round(_goBaseLineY + _goRaisePx);
    GAME_OVER_AREA   = TRACK_H > 0 ? (GAME_OVER_LINE_Y - TRACK_BOTTOM_Y) / TRACK_H : 0.5;
}

export function setGameOverLineRaisePx(px: number): void {
    _goRaisePx = Math.max(0, px);
    _applyGoLine();
}

/** Inner funnel width at the line quota raised by `raisePx`, relative to the un-raised quota.
 *  The funnel narrows toward the top, so a raised line is proportionally shorter. */
export function funnelWidthRatioAt(raisePx: number): number {
    if (TRACK_H <= 0) return 1;
    const bottomW = WALL_RB.x - WALL_LB.x;
    const topW    = WALL_RT.x - WALL_LT.x;
    const widthAt = (t: number) => bottomW + (topW - bottomW) * Math.min(1, Math.max(0, t));
    const tBase   = (_goBaseLineY - TRACK_BOTTOM_Y) / TRACK_H;
    const base    = widthAt(tBase);
    return base > 0 ? widthAt(tBase + raisePx / TRACK_H) / base : 1;
}

/** Call once before any game objects are created (GameManager.start). */
export function initLayout(funnelPct?: number): void {
    if (funnelPct !== undefined) _funnelPct = funnelPct;
    const vs       = view.getVisibleSize();
    TRACK_BOTTOM_Y = -Math.round(vs.height / 2);

    TRACK_H  = Math.round(Math.min(vs.height * 0.75, (1 / ASPECT_RATIO) * 0.95 * vs.width));
    TRACK_W  = Math.round(TRACK_H * ASPECT_RATIO * 1.2);

    TRACK_TOP_Y      = TRACK_BOTTOM_Y + TRACK_H;
    _goBaseLineY     = Math.round((TRACK_BOTTOM_Y + TRACK_TOP_Y) / 2);
    _applyGoLine();
    LAYOUT_SCALE     = TRACK_W / 384;
    // topW = TRACK_W * (1 - funnelPct/100)  →  FO = TRACK_W * funnelPct / 200
    FUNNEL_OFFSET    = Math.round(TRACK_W * _funnelPct / 200);
}

@ccclass('Track')
export class Track extends Component {
    @property({ type: Node, tooltip: 'Arena sprite node (dependency assigned explicitly in the editor — never resolved by name).' })
    arenaSprite: Node | null = null;

    private readonly funnelPercentage   = 75;
    private readonly wallThickness      = 12;
    private readonly topWallThickness   = 40;
    showDebugLine = false;
    private _walls: Node[] = [];
    private _lineOpacity: UIOpacity | null = null;
    private _linePulseActive = false;
    private _spriteUIT: UITransform | null = null;

    start() {
        const vs = view.getVisibleSize();
        initLayout(this.funnelPercentage);

        const spriteNode = this.arenaSprite;
        this._spriteUIT = spriteNode?.getComponent(UITransform) ?? null;
        if (this._spriteUIT) {
            this._spriteUIT.node.on(UITransform.EventType.SIZE_CHANGED,    this.buildWalls, this);
            this._spriteUIT.node.on(Node.EventType.TRANSFORM_CHANGED,      this.buildWalls, this);
        }

        this.buildWalls();
    }

    onDestroy() {
        // A destroyed component is still a truthy reference but its .node is null, so
        // guard on isValid — otherwise scene teardown (e.g. game-over → Ranking) crashes
        // with "Cannot read properties of null (reading 'off')".
        const spriteNode = this._spriteUIT?.node;
        if (spriteNode?.isValid) {
            spriteNode.off(UITransform.EventType.SIZE_CHANGED,   this.buildWalls, this);
            spriteNode.off(Node.EventType.TRANSFORM_CHANGED,     this.buildWalls, this);
        }
        this._spriteUIT = null;
    }

    relayout(): void {
        initLayout(this.funnelPercentage);
        this.buildWalls();
    }

    setLinePulse(active: boolean): void {
        if (this._linePulseActive === active) return;
        this._linePulseActive = active;
        if (active && this.showDebugLine) this._startLinePulse(); else this._stopLinePulse();
    }

    private _startLinePulse(): void {
        if (!this._lineOpacity) return;
        const op = this._lineOpacity;
        Tween.stopAllByTarget(op);
        const loop = () => {
            if (!this._linePulseActive || !op.isValid) return;
            tween(op).to(0.35, { opacity: 30 }).to(0.35, { opacity: 255 }).call(loop).start();
        };
        loop();
    }

    private _stopLinePulse(): void {
        if (!this._lineOpacity) return;
        Tween.stopAllByTarget(this._lineOpacity);
        this._lineOpacity.opacity = 255;
    }

    private buildWalls(): void {
        if (this._lineOpacity) {
            Tween.stopAllByTarget(this._lineOpacity);
            this._lineOpacity = null;
        }
        for (const w of this._walls) w.destroy();
        this._walls = [];

        const spriteNode = this.arenaSprite;
        if (!spriteNode) { console.warn('[Track] TrackSprite not found'); return; }
        const uit = spriteNode.getComponent(UITransform);
        if (!uit)  { console.warn('[Track] TrackSprite has no UITransform'); return; }

        // sprite bounds in Track-local space (accounts for position, scale, anchor)
        const w   = uit.contentSize.width;
        const h   = uit.contentSize.height;
        const ax  = uit.anchorPoint.x;
        const ay  = uit.anchorPoint.y;
        const px  = spriteNode.position.x;
        const py  = spriteNode.position.y;
        const scx = spriteNode.scale.x;
        const scy = spriteNode.scale.y * 2;

        const left   = px + (-ax)       * w * scx;
        const right  = px + (1 - ax)    * w * scx;
        const bot    = py + (-ay)       * h * scy;
        const top    = py + (1 - ay)    * h * scy;
        const fullW  = right - left;
        const centerX = (left + right) / 2;

        // wall thickness = wallThickness% of sprite width
        const t    = this.wallThickness / 100 * fullW;
        const tTop = this.topWallThickness / 100 * fullW;
        // funnel top edge (centered, narrower)
        const topW  = this.funnelPercentage / 100 * fullW;
        const topL  = centerX - topW / 2;
        const topR  = centerX + topW / 2;

        // Export inner wall edges so trajectory simulation can match Box2D exactly
        WALL_LB.set(left  + t,      bot);
        WALL_LT.set(topL  + t,      top);
        WALL_RB.set(right - t,      bot);
        WALL_RT.set(topR  - t,      top);


        this.spawnBoxWall('WallBottom', centerX, bot + t    / 2, fullW, t,    0.0, 0.0);
        this.spawnBoxWall('WallTop',    centerX, top - tTop / 2, topW,  tTop, 0.0, 1.0);

        this.spawnFunnelWall('WallLeft', [
            new Vec2(left,      bot),
            new Vec2(left + t,  bot),
            new Vec2(topL + t,  top),
            new Vec2(topL,      top),
        ], 0.8, 0.05);

        this.spawnFunnelWall('WallRight', [
            new Vec2(right - t, bot),
            new Vec2(right,     bot),
            new Vec2(topR,      top),
            new Vec2(topR - t,  top),
        ], 0.8, 0.05);

        // If TrackSprite has a GameOverLine child, use its world Y as the authoritative BASE
        // threshold (lowest quota); the current dynamic raise is re-applied on top of it.
        const goEditorNode = spriteNode.getChildByName('GameOverLine');
        if (goEditorNode) {
            _goBaseLineY = Math.round(goEditorNode.worldPosition.y);
            _applyGoLine();
        }

        const lineNode = new Node('GameOverLine');
        lineNode.setParent(this.node);
        lineNode.active = this.showDebugLine;
        const g = lineNode.addComponent(Graphics);
        g.lineWidth   = 6;
        g.strokeColor = new Color(255, 0, 0, 153);
        const dashLen = 12, gapLen = 8, ly = GAME_OVER_LINE_Y;
        let lx = -TRACK_W / 2;
        while (lx < TRACK_W / 2) {
            g.moveTo(lx, ly);
            g.lineTo(Math.min(lx + dashLen, TRACK_W / 2), ly);
            lx += dashLen + gapLen;
        }
        g.stroke();
        this._lineOpacity = lineNode.addComponent(UIOpacity);
        if (this._linePulseActive && this.showDebugLine) this._startLinePulse();
        this._walls.push(lineNode);
    }

    private spawnFunnelWall(name: string, points: Vec2[], restitution: number, friction: number): void {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(0, 0);
        const rb   = node.addComponent(RigidBody2D);
        rb.type    = ERigidBody2DType.Static;
        const col  = node.addComponent(PolygonCollider2D);
        col.points = points;
        col.friction    = friction;
        col.restitution = restitution;
        this._walls.push(node);
    }

    private spawnBoxWall(name: string, x: number, y: number, w: number, h: number, restitution: number, friction: number): void {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(x, y);
        const rb   = node.addComponent(RigidBody2D);
        rb.type    = ERigidBody2DType.Static;
        const col  = node.addComponent(BoxCollider2D);
        col.size   = new Size(w, h);
        col.friction    = friction;
        col.restitution = restitution;
        this._walls.push(node);
    }
}
