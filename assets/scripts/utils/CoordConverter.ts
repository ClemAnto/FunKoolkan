/**
 * Converts between Box2DLayer local space and WarriorsLayer local space.
 *
 * Coordinate chain (Y axis):
 *   physLocalY  ──×sy──►  warriorWorldY  (= box2dWorldY + physLocalY * sy)
 *   PerspectiveMapper: viewWorldY = warriorWorldY * sy + perWarriorYOffset
 *                                 = box2dWorldY * sy + physLocalY * sy² + yOffset
 *   viewLocalY (WarriorsLayer) = viewWorldY - warriorsLayerWorldY
 *                              = physLocalY * sy² + box2dWorldY * (sy - 1) + yOffset
 *
 * physToVisual / visualToPhys ignore the per-warrior yOffset (added by PerspectiveMapper).
 * For VFX placed in WarriorsLayer this gives the correct physics-centre position.
 *
 * box2dWorldY runtime value: the Canvas scene _lpos is saved in landscape mode (640,360),
 * but view.setDesignResolutionSize(720, 1280, FIXED_HEIGHT) repositions Canvas to worldY =
 * designHeight / 2 = 640 *after* start() runs (Widget layout pass).
 * Pass view.getDesignResolutionSize().height / 2 as box2dWorldY, not worldPosition.y.
 *
 * For sy=0.5, box2dWorldY=640:  physToVisual(y) = y * 0.25 - 320
 *                                visualToPhys(c) = (c + 320) * 4
 */
export class CoordConverter {
    readonly scaleY: number;
    private readonly offset: number;  // = box2dWorldY * (scaleY - 1)

    constructor(box2dScaleY: number, box2dWorldY: number) {
        this.scaleY = box2dScaleY;
        this.offset = box2dWorldY * (box2dScaleY - 1);
    }

    /** Physics local Y (Box2DLayer) → WarriorsLayer local Y, ignoring per-warrior yOffset. */
    physToVisual(y: number): number {
        return y * this.scaleY * this.scaleY + this.offset;
    }

    /** WarriorsLayer local Y → physics local Y (Box2DLayer). */
    visualToPhys(y: number): number {
        return this.scaleY > 0 ? (y - this.offset) / (this.scaleY * this.scaleY) : y;
    }
}
