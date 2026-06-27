import { _decorator, Component, Sprite, Color, Vec4, Material, Enum, tween, Tween } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, disallowMultiple, executeInEditMode, menu } = _decorator;

const RIM_MAX = 0.2;   // tightness=0 maps the rim reach to this UV fraction (≈20% of the sprite inward); tightness=1 → 0 (hugs the edge)

/** Sampling quality of the inner glow: more rings × directions = smoother rim, more texture taps. Default Low
 *  (performance first — the rim need not be pixel-precise). */
enum GlowQuality { Low, Medium, High, Ultra }
Enum(GlowQuality);

/**
 * Glow — a reusable FEATHERED INNER GLOW on a Sprite: a soft rim that lights up the INSIDE of the silhouette edge
 * and fades toward the centre. It drives the `glowColor` / `glowParams` of the shared SpriteFlash material (the
 * same one used for the white hit-flash). Because it works on pixels INSIDE the sprite, it never clips and needs
 * NO texture padding. One knob, `intensity` (0..1), like the flash amount; animate it from outside (tween / host)
 * to pulse or fade — the glow itself is static.
 *
 * Drop it on any node whose Sprite uses the SpriteFlash material. The art just needs the usual transparency
 * around its silhouette (any cut-out sprite has it); avoid a packed atlas for glowing sprites (UV offsets would
 * sample neighbours). Performance: only sprites with intensity > 0 do any sampling, and quality defaults to Low.
 */
@ccclass('Glow')
@disallowMultiple
@executeInEditMode
@menu('VFX/Glow')
export class Glow extends Component {
    @property({ tooltip: 'Inner-glow colour (the rim along the inside of the silhouette).' })
    color = new Color(255, 255, 255, 255);

    @property({ visible: false })
    private _intensity = 1;

    /** The single 0..1 knob driving the rim's strength. Animate THIS from outside to pulse / fade. */
    @property({ range: [0, 1, 0.01], slide: true, tooltip: 'Glow strength (0 = off, 1 = full). Animate from outside (tween / host) to pulse or fade.' })
    get intensity(): number { return this._intensity; }
    set intensity(v: number) { this._intensity = v < 0 ? 0 : v > 1 ? 1 : v; this._apply(); }

    @property({ range: [0, 1, 0.01], slide: true, tooltip: 'Rim tightness: 1 = a thin rim hugging the edge, 0 = a broad glow reaching further inward. Resolution-independent (same in editor and build).' })
    tightness = 0.7;

    @property({ range: [0.2, 4, 0.1], slide: true, tooltip: 'Falloff shape: 1 = linear fade, >1 tighter to the edge, <1 broader/softer.' })
    falloff = 1.2;

    @property({ type: Enum(GlowQuality), tooltip: 'Sampling quality: Low (2×6 taps) → Ultra (5×16). Low is the default — perf first; raise it only if the rim looks patchy.' })
    quality = GlowQuality.Low;

    private _mat: Material | null = null;
    private readonly _glowColor = new Color(255, 255, 255, 0);   // .a = amount (× 255), set from intensity
    private readonly _glowParams = new Vec4(0, 0, 1, 0);         // .xy = uv rim depth (fraction), .z = falloff, .w = quality

    onLoad(): void { this._apply(); }
    onEnable(): void { this._apply(); }
    start(): void { this._apply(); }   // re-apply after the Sprite has finished building its material instance
    // Editor: re-apply every tick → dragging color / tightness / quality / intensity updates the viewport live.
    // Runtime: keep retrying until the material AND the texture size are resolved (so the uv rim depth isn't
    // baked as 0 when the texture loads late → Play would otherwise differ from the editor). Then stop.
    update(): void { if (EDITOR || !this._mat) this._apply(); }

    /** Set the glow strength now (0..1). Alias of the `intensity` setter for code call-sites. */
    setIntensity(v: number): void { this.intensity = v; }

    /** Convenience: tween `intensity` to `v` over `seconds`. */
    fadeTo(v: number, seconds: number, easing: string = 'sineInOut'): void {
        Tween.stopAllByTarget(this);
        tween(this as { intensity: number }).to(seconds, { intensity: Math.max(0, Math.min(1, v)) }, { easing } as never).start();
    }

    /** Convenience: pulse `intensity` between `lo` and `hi` forever, one cycle per `period` seconds. */
    pulse(lo = 0.35, hi = 1, period = 1.4): void {
        Tween.stopAllByTarget(this);
        const half = Math.max(0.05, period * 0.5);
        this.intensity = lo;
        tween(this as { intensity: number })
            .to(half, { intensity: hi }, { easing: 'sineInOut' } as never)
            .to(half, { intensity: lo }, { easing: 'sineInOut' } as never)
            .union().repeatForever().start();
    }

    /** Stop any intensity animation started by fadeTo / pulse. */
    stopAnim(): void { Tween.stopAllByTarget(this); }

    /** Material instance of this node's Sprite, IF it carries the glow property (no-op otherwise — keeps a plain
     *  sprite from warning "illegal property name"). Gathered lazily; recompute if the sprite/material changes. */
    private _gatherMat(): void {
        if (this._mat && !EDITOR) return;   // runtime: cache once resolved; editor: re-resolve (material may be (re)assigned)
        const m = this.getComponent(Sprite)?.getMaterialInstance(0);
        this._mat = (m && m.passes?.[0]?.getHandle('glowColor', 0)) ? m : null;   // only the SpriteFlash/Glow material has it
    }

    private _apply(): void {
        this._gatherMat();
        if (!this._mat) return;
        // Rim reach is a UV fraction (resolution-independent) → editor and build match regardless of texture size.
        const reach = (1 - this.tightness) * RIM_MAX;
        this._glowParams.set(reach, reach, this.falloff, this.quality);
        this._glowColor.set(this.color.r, this.color.g, this.color.b, Math.round(255 * this._intensity));
        this._mat.setProperty('glowColor', this._glowColor);
        this._mat.setProperty('glowParams', this._glowParams);
    }

    onDestroy(): void { if (!EDITOR) Tween.stopAllByTarget(this); }
}
