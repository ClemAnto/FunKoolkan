import { _decorator, Component, Node, Color, Vec3, SpriteFrame, UIOpacity, Sprite, UITransform, tween, Tween, gfx } from 'cc';

const { ccclass } = _decorator;

const FIXED_SCALE = 1.2;

const OUTER_COLOR = new Color(140,  40, 200, 255);  // deep violet
const INNER_COLOR = new Color(200, 100, 255, 255);  // bright lavender

const SPARK_PALETTE = [
    new Color(180,  60, 240, 220),
    new Color(220, 140, 255, 200),
    new Color(160,  80, 220, 180),
];

/**
 * Internal base for the launcher glow effects (WildRiverEffect / BrotherhoodEffect):
 * two additive-blend rings (fade-in → outer pulse) + scheduled sparkles + fade-out.
 * Implementation sharing only — each public effect keeps its own dedicated class
 * (project rule: one class per effect). Subclasses tune the protected fields and
 * keep their own static attach().
 */
@ccclass('GlowPulseEffect')
export abstract class GlowPulseEffect extends Component {
    protected _radius = 30;
    protected _sparkleFrame: SpriteFrame | null = null;
    protected _detaching = false;

    private _outerOp: UIOpacity | null = null;
    private _innerOp: UIOpacity | null = null;
    private _pulseTween:       Tween<Node>      | null = null;
    private _fadeInTweenOuter: Tween<UIOpacity> | null = null;
    private _fadeInTweenInner: Tween<UIOpacity> | null = null;

    // Tuning — overridden by subclasses
    protected readonly nodePrefix:      string = 'Glow';
    protected readonly pulseStep:       number = 0.65;  // seconds per half pulse on the outer ring
    protected readonly innerFadeTarget: number = 120;   // inner ring target opacity
    protected readonly sparkleInterval: number = 0.13;
    protected readonly fadeOutDur:      number = 0.6;

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;
        this._onDetach();
        this._fadeInTweenOuter?.stop();
        this._fadeInTweenInner?.stop();
        this._pulseTween?.stop();
        this._fadeInTweenOuter = null;
        this._fadeInTweenInner = null;
        this._pulseTween = null;
        this.unschedule(this._spawnSparkle);
        if (!this.node?.isValid) return;
        this._fadeOut();
    }

    /** Subclass hook, runs once at the start of detach() (e.g. cancel expire timer). */
    protected _onDetach(): void { /* default: nothing */ }

    // Tweens targeting UIOpacity/child nodes are NOT auto-stopped by the engine when
    // this node dies with its warrior (destroy without detach) — stop them here.
    onDestroy(): void {
        this._fadeInTweenOuter?.stop();
        this._fadeInTweenInner?.stop();
        this._pulseTween?.stop();
        this._fadeInTweenOuter = null;
        this._fadeInTweenInner = null;
        this._pulseTween = null;
        for (const op of [this._outerOp, this._innerOp]) {
            if (!op) continue;
            Tween.stopAllByTarget(op);
            if (op.node) Tween.stopAllByTarget(op.node);
        }
    }

    protected _startVFX(glowFrame: SpriteFrame | null): void {
        const r = this._radius;

        const makeRing = (name: string, size: number, color: Color): UIOpacity => {
            const n = new Node(name);
            n.setParent(this.node);
            n.addComponent(UITransform).setContentSize(size, size);
            const op = n.addComponent(UIOpacity);
            op.opacity = 0;
            if (glowFrame) {
                const sp = n.addComponent(Sprite);
                sp.sizeMode    = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = glowFrame;
                sp.color       = color;
                sp.getMaterialInstance(0)?.overridePipelineStates({
                    blendState: { targets: [{ blend: true,
                        blendSrc: gfx.BlendFactor.SRC_ALPHA,
                        blendDst: gfx.BlendFactor.ONE }] }
                });
            }
            return op;
        };

        const outerOp = makeRing(`${this.nodePrefix}Outer`, r * 3.4 * FIXED_SCALE, OUTER_COLOR);
        this._outerOp = outerOp;
        const innerOp = makeRing(`${this.nodePrefix}Inner`, r * 2.2 * FIXED_SCALE, INNER_COLOR);
        this._innerOp = innerOp;

        // Fade-in outer → then pulse
        const outerNode = outerOp.node;
        this._fadeInTweenOuter = tween(outerOp)
            .to(1.2, { opacity: 75 })
            .call(() => {
                this._fadeInTweenOuter = null;
                if (!this._detaching && outerNode.isValid) {
                    this._pulseTween = tween(outerNode)
                        .repeatForever(tween<Node>()
                            .to(this.pulseStep, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineInOut' })
                            .to(this.pulseStep, { scale: new Vec3(1.0,  1.0,  1) }, { easing: 'sineInOut' }))
                        .start() as unknown as Tween<Node>;
                }
            })
            .start();

        this._fadeInTweenInner = tween(innerOp)
            .to(0.9, { opacity: this.innerFadeTarget })
            .call(() => { this._fadeInTweenInner = null; })
            .start();

        this.schedule(this._spawnSparkle, this.sparkleInterval);
    }

    private _fadeOut(): void {
        const outerOp = this._outerOp;
        const innerOp = this._innerOp;
        const node    = this.node;
        const finish  = () => { if (node?.isValid) node.destroy(); };
        if (outerOp?.node?.isValid) tween(outerOp).to(this.fadeOutDur, { opacity: 0 }).start();
        if (innerOp?.node?.isValid) tween(innerOp).to(this.fadeOutDur, { opacity: 0 }).call(finish).start();
        else finish();
    }

    private _spawnSparkle(): void {
        const parent = this.node?.parent;
        if (!parent?.isValid) { this.unschedule(this._spawnSparkle); return; }

        const r     = this._radius;
        const angle = Math.random() * Math.PI * 2;
        const dist  = r * (0.55 + Math.random() * 0.75) * FIXED_SCALE;

        const spark = new Node(`${this.nodePrefix}Spark`);
        spark.setParent(parent);
        spark.setPosition(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        spark.angle = Math.random() * 360;
        const sc = 0.8 + Math.random() * 1.0;
        spark.setScale(sc, sc, 1);

        const col = SPARK_PALETTE[Math.floor(Math.random() * SPARK_PALETTE.length)];

        if (this._sparkleFrame) {
            const size = 32 + Math.random() * 28;
            spark.addComponent(UITransform).setContentSize(size, size);
            const sp = spark.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._sparkleFrame;
            sp.color       = col;
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
        }

        const op = spark.addComponent(UIOpacity);
        op.opacity = 0;

        const rise  = 14 + Math.random() * 22;
        const drift = (Math.random() - 0.5) * 10;
        const dur   = 0.38 + Math.random() * 0.22;
        tween(spark)
            .by(dur, { position: new Vec3(drift, rise, 0) }, { easing: 'quadOut' })
            .call(() => { if (spark.isValid) spark.destroy(); })
            .start();
        tween(op)
            .to(dur * 0.3, { opacity: 210 })
            .to(dur * 0.7, { opacity: 0   })
            .call(() => { if (spark.isValid) spark.destroy(); })
            .start();
    }
}
