import { _decorator, Component, Node } from 'cc';
import { TRACK_TOP_Y, TRACK_BOTTOM_Y } from './Track';
const { ccclass } = _decorator;

const SCALE_BOTTOM = 1.2;
const SCALE_TOP    = 1.0;
const VISUAL_SCALE = 1.0;

@ccclass('PerspectiveMapper')
export class PerspectiveMapper extends Component {
    viewNode!: Node;
    yOffset     = 0;
    bounceY     = 0;    // extra world-Y offset for hop animations (WRS etc.)
    animScale   = 1.0;
    breathScale = 1.0;
    squashX     = 1.0;  // horizontal-only squash for side-wall impact

    lateUpdate(): void {
        if (!this.viewNode?.isValid) return;
        const wp = this.node.worldPosition;
        const sy = this.node.parent?.scale.y ?? 1;
        this.viewNode.setWorldPosition(wp.x, wp.y * sy + this.yOffset + this.bounceY, wp.z);
        const span  = TRACK_TOP_Y - TRACK_BOTTOM_Y;
        const depth = span > 0 ? Math.max(0, Math.min(1, (wp.y - TRACK_BOTTOM_Y) / span)) : 0;
        const base  = (SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * depth) * VISUAL_SCALE * this.animScale * this.breathScale;
        this.viewNode.setScale(base * this.squashX, base, 1);
    }
}
