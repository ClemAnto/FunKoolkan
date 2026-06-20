import { _decorator, Component, UITransform, view, CCFloat, Collider2D, Size } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, executeInEditMode, requireComponent, disallowMultiple, menu } = _decorator;

/**
 * Responsive fit for the ARENA container — the single source of truth for how the
 * playfield adapts to any screen. Sets a UNIFORM scale (so Box2D circle colliders
 * stay circular) and pins the node bottom-centre to the screen.
 *
 *   scale = min( maxWidthFraction  · screenW / designW,
 *                maxHeightFraction · screenH / designH )
 *
 * with maxHeightFraction switching by orientation: full height on portrait, capped
 * (e.g. 0.6) on landscape. So portrait fills the width; landscape fills the width up
 * to the height cap — always preserving the aspect ratio.
 *
 * Owns BOTH scale and position (instead of leaning on a Widget) so there is no
 * Widget-vs-scale ordering ambiguity: this is the ONE component that places the arena.
 * Everything parented under the arena (Box2D borders, sprite layer) inherits this
 * transform — "tutto segue l'arena" comes for free.
 *
 * The perspective squash (elliptical base, Y at 50%) is NOT done here: it lives only
 * in the physics→sprite mapping (see PerspectiveMapper). This fit-scale is uniform and
 * stays above that, so the two never get mixed up.
 *
 * Scene requirements:
 *  - anchor = (0.5, 0)  → bottom-centre pivot; the arena grows upward.
 *  - the parent chain up to a screen-centred, unscaled World is at local (0,0), scale 1
 *    (World = full-screen stretch Widget, anchor 0.5/0.5).
 *  - keep UITransform.contentSize at the DESIGN footprint and never change it at runtime
 *    (it is the rect the physics borders are authored from).
 *
 * executeInEditMode: the fit is live in the editor as you change the preview resolution.
 */
@ccclass('FitScale')
@requireComponent(UITransform)
@disallowMultiple
@executeInEditMode
@menu('Arena/FitScale')
export class FitScale extends Component {
    @property({ type: CCFloat, tooltip: 'Design width (px). 0 = read from UITransform at load.' })
    designWidth = 0;
    @property({ type: CCFloat, tooltip: 'Design height (px). 0 = read from UITransform at load.' })
    designHeight = 0;

    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Max fraction of screen WIDTH the arena may take (1 = full width).' })
    maxWidthFraction = 1;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Max fraction of screen HEIGHT on PORTRAIT screens.' })
    maxHeightFractionPortrait = 1;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Max fraction of screen HEIGHT on LANDSCAPE screens.' })
    maxHeightFractionLandscape = 0.6;

    @property({ type: CCFloat, tooltip: 'Minimum gap (screen px) kept between every arena edge and the screen edge. The arena is fitted into the screen minus this margin on each side, and the bottom pin is raised by it.' })
    screenMargin = 0;

    @property({ tooltip: 'Pin the arena bottom edge to the screen bottom (anchor must be 0.5, 0). Off = vertically centred.' })
    anchorToBottom = true;
    @property({ tooltip: 'Re-apply Box2D colliders under this node when the scale changes (resize), so the physics resync to the new lossy-scale.' })
    reapplyCollidersOnResize = true;

    /** Active arena, so physics / PerspectiveMapper can read the live design rect and scale. */
    static instance: FitScale | null = null;

    private _design = new Size();
    private _lastW = -1;
    private _lastH = -1;

    onLoad(): void {
        const ut = this.getComponent(UITransform)!;
        this._design.set(
            this.designWidth  > 0 ? this.designWidth  : ut.contentSize.width,
            this.designHeight > 0 ? this.designHeight : ut.contentSize.height,
        );
    }

    onEnable(): void {
        FitScale.instance = this;
        this._refit(true);
    }
    onDisable(): void {
        if (FitScale.instance === this) FitScale.instance = null;
    }

    // No reliable cross-version screen-resize event, so poll the visible size and refit only
    // when it actually changes (a two-number compare per frame). In editor we force every
    // frame so Inspector tweaks (margin, fractions) preview live.
    update(): void { this._refit(EDITOR); }

    /** Current uniform fit-scale. */
    get fitScale(): number { return this.node.scale.x; }
    /** Design footprint (px) — the rect physics borders and the mapper treat as the arena. */
    get designSize(): Readonly<Size> { return this._design; }

    private _refit(force = false): void {
        const vs = view.getVisibleSize();
        const w = vs.width, h = vs.height;
        if (!force && w === this._lastW && h === this._lastH) return;
        this._lastW = w; this._lastH = h;

        const dw = this._design.width, dh = this._design.height;
        if (dw <= 0 || dh <= 0) return;

        // Usable area = screen minus the margin on each side; the arena is fitted into it
        // so every edge keeps at least `screenMargin` px of gap.
        const m = Math.max(0, this.screenMargin);
        const availW = Math.max(1, w - 2 * m);
        const availH = Math.max(1, h - 2 * m);

        const maxHFrac = w >= h ? this.maxHeightFractionLandscape : this.maxHeightFractionPortrait;
        const s = Math.min(this.maxWidthFraction * availW / dw, maxHFrac * availH / dh);
        if (s > 0) this.node.setScale(s, s, 1);
        // Bottom-anchored: raise the bottom edge by the margin too.
        this.node.setPosition(0, this.anchorToBottom ? -h / 2 + m : 0, 0);

        // On a real resize the lossy-scale changed: rebuild the Box2D fixtures so the
        // static borders match the new world scale. Runtime only — never in editor.
        if (!EDITOR && this.reapplyCollidersOnResize) {
            const cols = this.node.getComponentsInChildren(Collider2D);
            for (const c of cols) c.apply();
        }
    }
}
