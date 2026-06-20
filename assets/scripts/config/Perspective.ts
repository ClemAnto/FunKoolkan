/**
 * Global perspective configuration — MODEL B: true 1-point perspective (X converges to the
 * vertical centre line, Y is non-linear, objects shrink with depth in BOTH axes).
 *
 * Physics is a FLAT ground rect [−W/2, +W/2] × [0, D] (Box2D round, constant-radius bodies).
 * Rendering is a projective homography that maps that rect to the visible TRAPEZOID (wider at
 * the bottom/near edge, narrower at the top/far edge) — matching a perspective floor. Because
 * it is a homography, straight ground lines stay straight on screen, and the preview trajectory
 * (simulated in flat ground space) projects to exactly where the launched stone goes.
 *
 *   s(yp)        = depth scale ∈ [sFar, 1]   (1 near/bottom, sFar far/top)
 *   projectX     = xp · s            (X converges toward centre — the real shrink)
 *   projectY     = Yhor · (1 − s)    (non-linear vertical pile toward the horizon)
 *   sizeX        = s                 (sprite horizontal scale)
 *   sizeY        = s · vy            (sprite vertical scale; vy in [s,1] via Y_FORESHORTEN)
 *
 * Trade-off (vs model C): vertical stone-stone contact reads as a slight OVERLAP (the upper rune
 * sinks into the lower), ~0–7px, one-signed and growing monotonically with depth — never an
 * actual gap, never sign-flipping (sizeY compresses the projected centres slower than the radii).
 * Accepted for the stronger, art-matching perspective.
 * Pure rendering transform; physics stays flat. Configured once from the arena footprint.
 */

/** Far(top)/near(bottom) edge-width ratio = the perspective strength. Set to the floor art's
 *  top-tile/bottom-tile width ratio. LOWER = stronger convergence (more shrink toward the top). */
export const PERSPECTIVE_FAR_SCALE = 0.58;

/** Extra VERTICAL foreshorten of the runes, 0..1. 0 = no extra squash (runes just shrink with X,
 *  staying round); 1 = full ground-tilt (vertical scale = s², runes go flat). Lower this to
 *  "reduce the Y perspective". */
export const PERSPECTIVE_Y_FORESHORTEN = 0.5;

// Cached constants, configured once from the footprint (visual px). 0 until configured.
let _W = 0;        // ground width (== visible bottom-edge width)
let _H = 0;        // visible footprint height (near rim → far rim on screen)
let _D = 0;        // ground depth (physics Y spans [0, _D])
let _a = 0;        // = 1/sFar − 1
let _Yhor = 0;     // horizon distance (also the Lspan); projectY maps [0,_D] → [0,_H]
let _invD = 0;
let _sFar = PERSPECTIVE_FAR_SCALE;

/** Configure from the arena footprint (visual px). Call once at startup and on resize. */
export function configurePerspective(footprintWidth: number, footprintHeight: number): void {
    if (footprintWidth <= 0 || footprintHeight <= 0) return;
    _W = footprintWidth; _H = footprintHeight;
    _sFar = Math.min(0.95, Math.max(0.1, PERSPECTIVE_FAR_SCALE));
    _a = 1 / _sFar - 1;
    _Yhor = _H / (1 - _sFar);          // projectY(_D) === _H
    _D = _H / _sFar;                   // ground depth; makes near-edge vertical slope == 1
    _invD = 1 / _D;
}

/** Ground depth — physics Y spans [0, physicsDepth()]. 0 until configured. */
export function physicsDepth(): number { return _D; }
/** Ground width (== visible bottom-edge width). */
export function physicsWidth(): number { return _W; }

/** Depth scale s(yp) ∈ [sFar, 1]: 1 at the near (bottom) edge, sFar at the far (top) edge. */
export function depthScale(yp: number): number {
    if (_D <= 0) return 1;
    let u = yp * _invD;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    return 1 / (1 + _a * u);
}

/** Forward map ground → visual. */
export function projectX(xp: number, yp: number): number { return xp * depthScale(yp); }
export function projectY(yp: number): number { return _Yhor * (1 - depthScale(yp)); }

/** Sprite scale factors (silhouette of the projected ground circle). */
export function sizeXFactor(yp: number): number { return depthScale(yp); }
export function sizeYFactor(yp: number): number {
    const s = depthScale(yp);
    return s * (1 - PERSPECTIVE_Y_FORESHORTEN * (1 - s));   // Y_FORESHORTEN: 1 → s², 0 → s
}

// Inverse map visual → ground (scalar, allocation-free; used per shot/aim, not per frame).
// Guarded so a visual Y above the far rim / below the near rim clamps instead of going wild.
function sAtVisualY(yv: number): number {
    let s = _Yhor > 0 ? 1 - yv / _Yhor : 1;
    if (s < _sFar) s = _sFar; else if (s > 1) s = 1;
    return s;
}
export function unprojectX(xv: number, yv: number): number { return xv / sAtVisualY(yv); }
export function unprojectY(yv: number): number {
    if (_D <= 0 || _a === 0) return yv;
    const s = sAtVisualY(yv);
    return ((1 / s - 1) / _a) * _D;
}

/** @deprecated Linear-squash alias kept only for the legacy, unused-by-runes PerspectiveMapper. */
export const PERSPECTIVE_Y_SCALE = 0.5;
