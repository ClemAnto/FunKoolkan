import { _decorator, Component, Sprite, UITransform, view, Size } from 'cc';
const { ccclass } = _decorator;

/** Scales the background sprite to cover the full screen (no distortion),
 *  keeping the bottom edge anchored to the canvas bottom.
 *  Requires the node to have anchor (0.5, 0) set in the scene. */
@ccclass('BgFill')
export class BgFill extends Component {
    start(): void { this.scheduleOnce(() => this.refit()); }

    /** Cover-fit the background to the screen. Public so a lazy-loaded background can re-fit once
     *  its spriteFrame is assigned (the start() pass runs before the texture is loaded). */
    refit(): void {
        const sp = this.node.getComponent(Sprite);
        if (!sp?.spriteFrame) return;
        const vs    = view.getVisibleSize();
        const orig  = sp.spriteFrame.originalSize;
        const scale = Math.max(vs.width / orig.width, vs.height / orig.height);
        const ut    = this.node.getComponent(UITransform)!;
        ut.anchorX  = 0.5;
        ut.anchorY  = 0;
        ut.setContentSize(new Size(orig.width * scale, orig.height * scale));
        this.node.setPosition(0, -vs.height / 2);
    }
}
