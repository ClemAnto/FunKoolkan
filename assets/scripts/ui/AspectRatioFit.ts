import { _decorator, Component, Node, UITransform, Sprite, CCFloat } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, executeInEditMode, requireComponent, disallowMultiple, menu } = _decorator;

/**
 * Keeps a node's UITransform at a fixed aspect ratio: one dimension is derived from
 * the other, so the image never distorts. Pair it with a Widget that stretches only
 * the DRIVING axis (e.g. Left+Right for 100% width) — this component then sets the
 * other axis from it.
 *
 * `width:100%` keeping ratio = Widget(Left+Right) + AspectRatioFit(widthDrivesHeight).
 *
 * Aspect is W/H. Leave `aspect = 0` to read it automatically from the Sprite's frame
 * original size. Reacts to SIZE_CHANGED (not update()), because a Widget aligns after
 * component updates — see MaxSize for the same reasoning. Composes with MaxSize.
 *
 * For the Sprite: set Size Mode = CUSTOM (so size is driven here, not by the texture).
 */
@ccclass('AspectRatioFit')
@requireComponent(UITransform)
@disallowMultiple
@executeInEditMode
@menu('UI/AspectRatioFit')
export class AspectRatioFit extends Component {
    @property({ type: CCFloat, tooltip: 'Aspect ratio (width / height). 0 = auto from the Sprite frame original size.' })
    aspect = 0;
    @property({ tooltip: 'On: height is derived from width (use with a horizontal-stretch Widget). Off: width derived from height.' })
    widthDrivesHeight = true;

    private _ut: UITransform | null = null;

    onLoad(): void { this._ut = this.getComponent(UITransform); }

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this._fit, this);
        this._fit();
    }
    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this._fit, this);
    }

    // Editor-only: re-apply every frame so Inspector tweaks (aspect / drive axis) show live.
    // At runtime the SIZE_CHANGED listener handles it (update() here would lose to the Widget).
    update(): void { if (EDITOR) this._fit(); }

    /** Resolved aspect (W/H): explicit value, else the Sprite frame's original size. */
    private _ratio(): number {
        if (this.aspect > 0) return this.aspect;
        const sf = this.getComponent(Sprite)?.spriteFrame;
        const os = sf?.originalSize;
        if (os && os.height > 0) return os.width / os.height;
        return 0;
    }

    private _fit(): void {
        const ut = this._ut ?? (this._ut = this.getComponent(UITransform));
        if (!ut) return;
        const ratio = this._ratio();
        if (ratio <= 0) return;
        const { width, height } = ut.contentSize;
        if (this.widthDrivesHeight) {
            const h = width / ratio;
            if (Math.abs(h - height) > 0.01) ut.setContentSize(width, h);
        } else {
            const w = height * ratio;
            if (Math.abs(w - width) > 0.01) ut.setContentSize(w, height);
        }
    }
}
