/**
 * Global perspective configuration — the "tilted camera" look as a MILD 1-point taper.
 *
 * Physics is a FLAT top-down ground plane (Box2D: round, constant-radius bodies). Rendering
 * foreshortens depth (ground-Y) by a factor that VARIES with depth: gentler near the bottom
 * (camera-close), stronger toward the top (toward the horizon). The same factor drives BOTH
 * the vertical foreshortening of POSITION and the vertical squash of a body's SIZE, so a flat
 * disc on the ground always projects to an ellipse whose silhouette matches where the physics
 * circle actually is — vertical contacts stay visually coherent BY CONSTRUCTION (the size
 * factor equals the projection slope). This is the property the old constant-squash model
 * lost the moment size varied with depth.
 *
 *   depthFactor(yp) = projection slope at depth yp  (== vertical SIZE factor)
 *   projectY(yp)    = ∫ depthFactor = yp·(sNear + ½·k·yp)    ground-Y → screen-Y
 *   unprojectY(yv)  = inverse (solve the quadratic)           screen-Y → ground-Y
 *
 * X is passed 1:1 (no vanishing-point convergence — the "mild" hedge that keeps vertical
 * stacks coherent and avoids a per-stone divide; the cost is that stones foreshorten/flatten
 * toward the top rather than shrinking uniformly). Pure rendering transform, configured once
 * from the arena footprint height. FitScale stays a uniform scale ABOVE this.
 */

/** Vertical foreshortening at the NEAR (bottom) edge: screen-Y per ground-Y. */
export const PERSPECTIVE_SCALE_NEAR = 0.8;
/** Vertical foreshortening at the FAR (top) edge. Set FAR = NEAR · (far/near tile ratio
 *  measured off the floor art). Keeping NEAR+FAR ≈ 1.0 preserves the old average squash (0.5),
 *  so the physics playfield depth — and the radius/launch-speed tuning — stays unchanged.
 *  Spread (NEAR≫FAR) = stronger perspective; here 0.8/0.2 (4:1) for a pronounced foreshorten. */
export const PERSPECTIVE_SCALE_FAR = 0.2;

// Cached constants, configured once from the footprint height H (visual/image space).
let _H = 0;        // visual footprint height
let _Hphys = 0;    // physics playfield depth (ground-Y spans [0, _Hphys])
let _sb = PERSPECTIVE_SCALE_NEAR;
let _ds = PERSPECTIVE_SCALE_FAR - PERSPECTIVE_SCALE_NEAR;   // sFar - sNear (negative)
let _k = 0;        // _ds / _Hphys

/** Configure from the arena footprint height (visual px). Call once at startup and on resize. */
export function configurePerspective(footprintHeight: number): void {
    if (footprintHeight <= 0) return;
    _H = footprintHeight;
    _sb = PERSPECTIVE_SCALE_NEAR;
    _ds = PERSPECTIVE_SCALE_FAR - PERSPECTIVE_SCALE_NEAR;
    _Hphys = 2 * _H / (PERSPECTIVE_SCALE_NEAR + PERSPECTIVE_SCALE_FAR);   // makes projectY(_Hphys) === H
    _k = _ds / _Hphys;
}

/** Physics playfield depth — ground-Y range is [0, physicsHeight()]. 0 until configured. */
export function physicsHeight(): number { return _Hphys; }

/** Vertical foreshorten / SIZE factor at ground depth yp. Equals projectY'(yp). */
export function depthFactor(yp: number): number {
    if (_Hphys <= 0) return _sb;
    return _sb + _k * yp;     // = sNear + (sFar - sNear)·(yp / _Hphys)
}

/** Ground-Y (physics) → screen-Y (visual). Monotone on [0, _Hphys]. */
export function projectY(yp: number): number {
    return yp * (_sb + 0.5 * _k * yp);
}

/** Screen-Y (visual) → ground-Y (physics). Guarded against the discriminant going negative
 *  (a visual Y above the far rim clamps to the far rim instead of returning NaN). */
export function unprojectY(yv: number): number {
    if (Math.abs(_k) < 1e-9) return _sb !== 0 ? yv / _sb : yv;
    const disc = _sb * _sb + 2 * _k * yv;
    if (disc <= 0) return _Hphys;
    return (-_sb + Math.sqrt(disc)) / _k;
}

/** @deprecated Linear-squash alias kept only for the legacy, unused PerspectiveMapper. */
export const PERSPECTIVE_Y_SCALE = 0.5;
