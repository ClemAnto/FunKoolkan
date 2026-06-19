import { _decorator, Component, Node, UITransform, CCFloat } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, executeInEditMode, requireComponent, menu, disallowMultiple } = _decorator;

/**
 * Caps a node's UITransform contentSize, CSS `max-width` / `max-height` style:
 * the size is only ever shrunk to the limit, never grown. A limit of 0 (or less)
 * means "no limit" on that axis.
 *
 * Designed to sit ALONGSIDE a Widget: let the Widget stretch the node to 100% of its
 * container, then set e.g. maxWidth = 300 to cap it (like `width:100%; max-width:300px`).
 *
 * The clamp reacts to the node's SIZE_CHANGED event — NOT update() — because the Widget
 * aligns on EVENT_AFTER_UPDATE (after all component updates), so an update()-based clamp
 * would be overwritten every frame. SIZE_CHANGED fires synchronously when the Widget sets
 * the size, so the cap is applied right after, before rendering. Keep the node's anchor at
 * 0.5 (with a left+right stretch Widget) so it stays centred once capped.
 *
 * Runs in the editor too (executeInEditMode).
 */
@ccclass('MaxSize')
@requireComponent(UITransform)
@disallowMultiple
@executeInEditMode
@menu('UI/MaxSize')
export class MaxSize extends Component {
    @property({ type: CCFloat, tooltip: 'Maximum width in px. 0 or less = no limit.' })
    maxWidth = 0;
    @property({ type: CCFloat, tooltip: 'Maximum height in px. 0 or less = no limit.' })
    maxHeight = 0;

    private _ut: UITransform | null = null;

    onLoad(): void { this._ut = this.getComponent(UITransform); }

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this._clamp, this);
        this._clamp();
    }
    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this._clamp, this);
    }

    // Editor-only: re-apply every frame so Inspector tweaks (maxWidth/maxHeight) show live.
    // At runtime the SIZE_CHANGED listener handles it (update() here would lose to the Widget).
    update(): void { if (EDITOR) this._clamp(); }

    private _clamp(): void {
        const ut = this._ut ?? (this._ut = this.getComponent(UITransform));
        if (!ut) return;
        const { width, height } = ut.contentSize;
        let w = width, h = height;
        if (this.maxWidth  > 0 && w > this.maxWidth)  w = this.maxWidth;
        if (this.maxHeight > 0 && h > this.maxHeight) h = this.maxHeight;
        // Only write when over the limit — equal values fire no event, so this can't loop.
        if (w !== width || h !== height) ut.setContentSize(w, h);
    }
}
