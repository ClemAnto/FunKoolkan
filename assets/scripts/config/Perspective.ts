/**
 * Global perspective configuration — the single knob for the "45° camera" look.
 *
 * The arena is viewed from a tilted camera: circular physics bodies sit on the ground
 * plane and are drawn with an ELLIPTICAL base. X movement maps 1:1 to the sprites,
 * while Y (depth) movement is foreshortened — and that foreshortening is governed
 * entirely by this one constant. It must NOT come from any node scale: FitScale puts a
 * UNIFORM scale on the arena, so the perspective lives here, above the layout.
 */

/** Camera elevation above the ground plane, in degrees.
 *  90 = pure top-down (no foreshortening), 0 = pure side view (fully flat). */
export const PERSPECTIVE_ANGLE_DEG = 30;

/** Vertical foreshortening factor: screen-Y per ground-Y.
 *  A ground circle of radius r projects to an ellipse with vertical semi-axis
 *  r · sin(angle); the same factor compresses depth movement of the sprites.
 *  sin(30°) = 0.5. Raise the angle toward 90° for a more top-down look. */
export const PERSPECTIVE_Y_SCALE = Math.sin(PERSPECTIVE_ANGLE_DEG * Math.PI / 180);
