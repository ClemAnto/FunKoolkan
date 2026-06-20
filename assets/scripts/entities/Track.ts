import { _decorator, Component, Node, Vec2, view } from 'cc';
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

/**
 * Legacy Track component. The funnel-wall building (buildWalls) was REMOVED — the arena
 * collision boundary is now owned by ArenaBounds. What remains only keeps the layout
 * constants (initLayout) and the small public API that GameManager still calls
 * (relayout / setLinePulse / showDebugLine / arenaSprite). To be retired fully when the
 * old gameplay is replaced.
 */
@ccclass('Track')
export class Track extends Component {
    @property({ type: Node, tooltip: 'Arena sprite node (dependency assigned explicitly in the editor — never resolved by name).' })
    arenaSprite: Node | null = null;

    private readonly funnelPercentage = 75;
    showDebugLine = false;

    /** Recomputes the exported layout constants (TRACK_W, LAYOUT_SCALE, …) other systems read. */
    relayout(): void {
        initLayout(this.funnelPercentage);
    }

    /** No-op: the old debug game-over line was removed together with the funnel walls. */
    setLinePulse(_active: boolean): void { /* intentionally empty */ }
}
