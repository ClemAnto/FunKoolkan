/**
 * Global projection config — maps the FLAT Box2D ground space to the screen. Two interchangeable MODELS,
 * both of which keep physics↔visual in EXACT correspondence (so aiming is accurate) and tile with zero
 * gap/overlap in BOTH axes (so the glued blob reads as solid). Flip PERSPECTIVE_MODEL to switch.
 *
 *   PERSPECTIVE (A): a true 1-point-perspective homography. X converges toward the centre line and objects
 *     shrink with depth (far = smaller); the visible playfield is a TRAPEZOID (wider at the near/bottom edge).
 *     Keeps the existing trapezoidal floor art. The vertical squash of a rune VARIES with depth (round near,
 *     flatter far) — unless you push the arena INTO the scene with PERSPECTIVE_NEAR_SCALE, which makes the
 *     near edge already foreshortened (less round, more squashed) and tunes the bottom squash WITHOUT
 *     touching the X trapezoid. Tiling stays exact and the floor stays filled at every setting.
 *
 *   TILT (B): a pure orthographic ~60° tilt — screenX = gx (no convergence), screenY = k·gy (k≈0.5, "halve
 *     the Y"). A plain affine map: trivially invertible, exact tiling, and a CONSTANT squash (every rune is
 *     the same 2:1 ellipse) → a uniform, readable "tilted table" look. There is NO depth shrink (near and far
 *     runes are the same size — convey depth via the floor art + DepthSort occlusion). The playfield is a
 *     RECTANGLE, so the floor art must be painted rectangular (NOT a trapezoid) when this model is active.
 *
 * Physics is ALWAYS the flat ground rect [−W/2, +W/2] × [0, D] (Box2D round, constant-radius bodies); only
 * the RENDER map differs. A disc-shaped object (rune, cube…) is placed with projectYCenter (its visual centre
 * = the midpoint of its projected vertical extent) and scaled vertically by vStackFactor (its on-screen height
 * = the projection of its ground DIAMETER). That pair tiles EXACTLY at every depth in BOTH models (telescoping:
 * the centre-gap of two touching discs == the sum of their two half-heights). Use projectX + sizeXFactor for X.
 */

export enum PerspectiveModel {
    /** A — 1-point perspective homography (depth shrink + converging trapezoid). Keeps the current floor art. */
    Perspective = 0,
    /** B — pure orthographic tilt (screenY = k·gy), no depth shrink, RECTANGULAR floor (needs rectangular art). */
    Tilt = 1,
    /** Debug — identity (ground == visible: no shrink, no tilt). For testing the raw physics. */
    Flat = 2,
}

/** ACTIVE MODEL — flip this ONE line to switch A↔B. Tilt (B) requires a RECTANGULAR floor art + bounds. */
export const PERSPECTIVE_MODEL: PerspectiveModel = PerspectiveModel.Perspective;

/** [Model A] Far(top)/near(bottom) edge-width ratio = the perspective strength. Set to the floor art's
 *  top-tile/bottom-tile width ratio. LOWER = stronger convergence (more shrink toward the top). */
export const PERSPECTIVE_FAR_SCALE = 0.5//0.58;

/** [Model A] Vertical depth-scale at the arena's NEAR (bottom) edge — the "arena offset" knob. The arena is
 *  visually inset from the absolute screen bottom; that gap is floor between the camera and the near edge, so
 *  the near edge already sits at some depth. 1.0 = no offset → the bottom disc is perfectly ROUND (the
 *  historical look). LOWER = arena pushed deeper → the bottom edge is already foreshortened (less round, more
 *  squashed). Must stay > PERSPECTIVE_FAR_SCALE (it can't be farther than the top edge); ≈ sqrt(FAR_SCALE)
 *  makes the squash uniform top↔bottom. For a STRONGER squash than that, also lower PERSPECTIVE_FAR_SCALE.
 *  X convergence is unaffected (the near edge keeps the full arena width → the floor trapezoid is unchanged). */
export const PERSPECTIVE_NEAR_SCALE = 0.7//0.78;

/** [Model B] Vertical foreshorten k: screenY = k·groundY. 0.5 = "halve the Y" (≈ a 60° camera). Lower = flatter. */
export const TILT_FORESHORTEN = 0.5;

// Cached constants, configured once from the footprint (visual px). 0 until configured.
let _model: PerspectiveModel = PERSPECTIVE_MODEL;
let _W = 0;        // ground width (== visible near-edge width in A; the full visible width in B/Flat)
let _H = 0;        // visible footprint height on screen (near rim → far rim)
let _D = 0;        // ground depth; physics Y spans [0, _D]
let _invD = 1;
// Model A (Perspective) only:
let _aX = 0;       // frustum coefficient = 1/sFar − 1 (drives the X convergence; the X near-scale stays 1)
let _sFar = 1;     // far(top)-edge depth scale
let _sNear = 1;    // near(bottom)-edge VERTICAL scale — the "arena offset" knob (1 = bottom at the camera
                   // nadir → round; <1 = arena pushed into the scene → bottom already foreshortened/squashed)
let _u0 = 0;       // frustum depth offset of the arena near edge (derived from _sNear); 0 when _sNear == 1
let _KY = 1;       // sizeYFactor == _KY · sY²  (vertical metric; collapses to pure s² when _sNear == 1)
let _denomY = 1;   // _sNear − _sFar  (projectY normaliser: maps sY  sNear→0, sFar→_H)
// Model B (Tilt) only:
let _k = 1;        // vertical foreshorten (screenY = k·gy)

/** Configure from the arena footprint (visual px). Call once at startup and on resize. */
export function configurePerspective(footprintWidth: number, footprintHeight: number): void {
    if (footprintWidth <= 0 || footprintHeight <= 0) return;
    _model = PERSPECTIVE_MODEL;
    _W = footprintWidth; _H = footprintHeight;
    if (_model === PerspectiveModel.Perspective) {
        _sFar = Math.min(0.95, Math.max(0.1, PERSPECTIVE_FAR_SCALE));
        _aX = 1 / _sFar - 1;
        // Near-edge vertical scale: clamp to (sFar, 1]. It can't drop below sFar — the arena's near edge
        // would then sit FARTHER than its far edge. A stronger bottom-squash than that needs a lower sFar.
        _sNear = Math.min(1, Math.max(_sFar + 0.02, PERSPECTIVE_NEAR_SCALE));
        _u0 = _aX > 0 ? (1 / _sNear - 1) / _aX : 0;   // frustum offset that yields scale _sNear at the near edge
        _D = _H / _sFar;            // ground depth; near-edge vertical slope == 1 (the X reference)
        _denomY = _sNear - _sFar;
        _KY = _denomY > 1e-6 ? (_sFar * _aX * (1 - _u0)) / _denomY : 1;   // == 1 when _sNear == 1
        _k = 1;
    } else if (_model === PerspectiveModel.Tilt) {
        _k = Math.min(1, Math.max(0.05, TILT_FORESHORTEN));
        _D = _H / _k;               // screenY = k·gy maps [0,_D] → [0,_H]
        _sFar = 1; _aX = 0; _sNear = 1; _u0 = 0; _KY = 1; _denomY = 1;
    } else {                        // Flat: identity
        _sFar = 1; _aX = 0; _sNear = 1; _u0 = 0; _KY = 1; _denomY = 1; _D = _H; _k = 1;
    }
    _invD = _D > 0 ? 1 / _D : 1;
}

/** Ground depth — physics Y spans [0, physicsDepth()]. 0 until configured. */
export function physicsDepth(): number { return _D; }
/** Ground width (== visible near-edge width). */
export function physicsWidth(): number { return _W; }

/** Depth scale s(yp) ∈ (0,1] driving the HORIZONTAL (X) shrink/convergence. 1 = no shrink (Tilt/Flat). */
export function depthScale(yp: number): number {
    if (_model !== PerspectiveModel.Perspective || _D <= 0) return 1;
    let u = yp * _invD;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    return 1 / (1 + _aX * u);
}

/** [Model A] Vertical (Y) depth scale at ground depth `yp` — like depthScale but referenced to the OFFSET
 *  near edge (_u0), so the bottom edge can already be foreshortened. Equals depthScale when _sNear == 1.
 *  Drives projectY and the vertical squash. */
function _sYof(yp: number): number {
    let t = yp * _invD;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const U = _u0 + (1 - _u0) * t;
    return 1 / (1 + _aX * U);
}

/** Forward map ground → visual (a POINT). */
export function projectX(xp: number, yp: number): number { return xp * depthScale(yp); }
export function projectY(yp: number): number {
    if (_model === PerspectiveModel.Perspective) return (_H * (_sNear - _sYof(yp))) / _denomY;
    if (_model === PerspectiveModel.Tilt) return _k * yp;
    return yp;   // Flat
}

/** Sprite HORIZONTAL scale factor (on-screen X radius = groundRadius · this). */
export function sizeXFactor(yp: number): number { return depthScale(yp); }

/** Local floor TILT at depth yp (on-screen Y radius per unit ground radius) for a SMALL floor disc — detection
 *  ellipses, VFX, debug. Perspective → _KY·sY² (the local vertical metric, with the near-edge offset baked in);
 *  Tilt → k; Flat → 1. For a RUNE that must tile against its neighbours, prefer the radius-aware vStackFactor
 *  (which is exact, not a local approximation). */
export function sizeYFactor(yp: number): number {
    if (_model === PerspectiveModel.Perspective) { const sY = _sYof(yp); return _KY * sY * sY; }
    if (_model === PerspectiveModel.Tilt) return _k;
    return 1;   // Flat
}

/** Ratio of on-screen vertical-to-horizontal scale of a floor disc at depth yp (= sizeYFactor/sizeXFactor): the
 *  local ground "tilt aspect". Perspective → _KY·sY²/sX (== s only when _sNear == 1), Tilt → k, Flat → 1. For
 *  flat ground ellipses / the drag-cone metric where only the ASPECT (not the absolute size) matters. */
export function floorTilt(yp: number): number {
    const sx = sizeXFactor(yp);
    return sx > 0 ? sizeYFactor(yp) / sx : sizeYFactor(yp);
}

/** EXACT vertical scale for a rune of ground radius `r` at depth `yp`: its on-screen HEIGHT == the projection of
 *  its ground DIAMETER (2r). Vertically-stacked runes then TILE and TOUCH at every depth (centre-distance and
 *  sprite height share the SAME vertical metric, projectY). Tilt → k, Flat → 1. Use this (not sizeYFactor) for
 *  the rune view's Y scale so what you see matches the physics. */
export function vStackFactor(yp: number, r: number): number {
    if (r <= 0) return sizeYFactor(yp);
    const d = (projectY(yp + r) - projectY(yp - r)) / (2 * r);   // projected vertical extent of the ground diameter, per unit
    return d > 0 ? d : sizeYFactor(yp);
}

/** Visual Y CENTRE of a rune (ground radius `r`) at depth `yp`: the MIDPOINT of its projected vertical extent,
 *  NOT projectY(yp). projectY is non-linear (in Perspective), so the projected near/far edges aren't symmetric
 *  about projectY(yp); using the midpoint (with vStackFactor for the height) makes vertically-stacked runes tile
 *  EXACTLY at every depth. Tilt/Flat (projectY linear) → projectY(yp) (no shift). */
export function projectYCenter(yp: number, r: number): number {
    if (r <= 0) return projectY(yp);
    return (projectY(yp + r) + projectY(yp - r)) / 2;
}

// Inverse map visual → ground (scalar, allocation-free; used per shot/aim, not per frame).
// Recover the ground depth fraction t∈[0,1] from a visual Y, clamped to the playfield band so a visual Y
// above the far rim / below the near rim clamps instead of going wild.
function _tAtVisualY(yv: number): number {   // Model A only
    let sY = _sNear - (yv * _denomY) / _H;            // invert projectY
    if (sY < _sFar) sY = _sFar; else if (sY > _sNear) sY = _sNear;
    const U = (1 / sY - 1) / _aX;                     // frustum depth at that vertical scale
    const t = _u0 < 1 ? (U - _u0) / (1 - _u0) : 0;    // back out the arena fraction
    return t < 0 ? 0 : (t > 1 ? 1 : t);
}
export function unprojectX(xv: number, yv: number): number {
    if (_model === PerspectiveModel.Perspective) {
        const sX = 1 / (1 + _aX * _tAtVisualY(yv));   // X near-scale stays 1 (no offset on X)
        return xv / sX;
    }
    return xv;   // Tilt/Flat: no X convergence
}
export function unprojectY(yv: number): number {
    if (_model === PerspectiveModel.Perspective) {
        if (_D <= 0 || _aX === 0) return yv;
        return _tAtVisualY(yv) * _D;
    }
    if (_model === PerspectiveModel.Tilt) return _k > 0 ? yv / _k : yv;
    return yv;   // Flat
}
