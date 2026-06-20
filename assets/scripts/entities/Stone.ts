import { _decorator, Component, Node, Vec3 } from 'cc';
import { PERSPECTIVE_Y_SCALE } from '../config/Perspective';

const { ccclass } = _decorator;
const _v = new Vec3();

/**
 * Links a moving Box2D body to its visual sprite (the "stone"/rune) in the warriorsLayer.
 *
 * The physics body lives in the arena's UN-squashed local space (Y de-squashed by
 * ArenaBounds). This component places the view sprite at the SAME X but with Y squashed
 * by PERSPECTIVE_Y_SCALE — i.e. onto the visible 45° arena floor — and matches the arena's
 * uniform fit-scale. So body ↔ sprite stay in correspondence while the body bounces.
 *
 * The body node must be a direct child of `arena` (its local position is arena-local).
 * The view node lives in a different layer (warriorsLayer), so it is driven in WORLD space.
 */
@ccclass('Stone')
export class Stone extends Component {
    /** The view sprite node (in warriorsLayer) mirroring this body. */
    viewNode: Node | null = null;
    /** The Arena container; its world transform maps physics → screen. */
    arena: Node | null = null;

    lateUpdate(): void {
        const view = this.viewNode, arena = this.arena;
        if (!view?.isValid || !arena?.isValid) return;
        const p = this.node.position;                  // arena-local position (de-squashed)
        _v.set(p.x, p.y * PERSPECTIVE_Y_SCALE, p.z);   // squash Y for the 45° view
        Vec3.transformMat4(_v, _v, arena.worldMatrix); // arena-local → world
        view.setWorldPosition(_v);
        const ws = arena.worldScale;                   // track the arena's uniform fit-scale
        view.setWorldScale(ws.x, ws.y, 1);
    }
}
