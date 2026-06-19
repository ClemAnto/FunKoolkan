import { _decorator, Component, Node, Color, Vec3, SpriteFrame, UIOpacity, Sprite, UITransform, tween, Tween, gfx } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

const AURA_MIN_TYPE = 3; // Wolf
export const AURA_DURATION = 1.5; // seconds the repelling aura lasts after launch

@ccclass('AuraEffect')
export class AuraEffect extends Component {
    static readonly MIN_TYPE = AURA_MIN_TYPE;
    static readonly DURATION = AURA_DURATION;

    private _detaching    = false;
    private _outerOp:     UIOpacity | null = null;
    private _innerOp:     UIOpacity | null = null;
    private _rangeOp:     UIOpacity | null = null;
    private _pulseTween:  Tween<Node> | null = null;
    private _sparkleFrame: SpriteFrame | null = null;
    private _radius       = 30;

    onExpired: (() => void) | null = null;
    private _expireCb = () => { this.onExpired?.(); };

    static isEligible(type: number): boolean { return type >= AURA_MIN_TYPE; }

    static attach(warrior: Warrior, auraFrame: SpriteFrame | null, sparkleFrame: SpriteFrame | null, repelRange = 0): AuraEffect {
        const n  = new Node('AuraEffect');
        n.setParent(warrior.viewNode);
        const ae = n.addComponent(AuraEffect);
        ae._radius = warrior.radius;
        ae._sparkleFrame = sparkleFrame;
        ae._build(warrior.radius, auraFrame, repelRange);
        return ae;
    }

    // Call when the warrior is launched to begin the countdown.
    startTimer(): void {
        this.unschedule(this._expireCb);
        this.scheduleOnce(this._expireCb, AURA_DURATION);
    }

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;
        this.unschedule(this._expireCb);
        this.unschedule(this._spawnSparkle);
        this._pulseTween?.stop();
        this._pulseTween = null;
        this._fadeOut();
    }

    // Tweens targeting UIOpacity/child nodes are NOT auto-stopped by the engine when
    // this node dies with its warrior (destroy without detach) — stop them here.
    onDestroy(): void {
        this._pulseTween?.stop();
        this._pulseTween = null;
        for (const op of [this._outerOp, this._innerOp, this._rangeOp]) {
            if (!op) continue;
            Tween.stopAllByTarget(op);
            if (op.node) Tween.stopAllByTarget(op.node);
        }
    }

    private _build(radius: number, auraFrame: SpriteFrame | null, repelRange = 0): void {
        const makeRing = (name: string, size: number, color: Color, targetOp: number, fadeTime: number) => {
            const n = new Node(name);
            n.setParent(this.node);
            n.addComponent(UITransform).setContentSize(size, size);
            const op = n.addComponent(UIOpacity);
            op.opacity = 0;
            if (auraFrame) {
                const sp = n.addComponent(Sprite);
                sp.sizeMode    = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = auraFrame;
                sp.color       = color;
                sp.getMaterialInstance(0)?.overridePipelineStates({
                    blendState: { targets: [{ blend: true,
                        blendSrc: gfx.BlendFactor.SRC_ALPHA,
                        blendDst: gfx.BlendFactor.ONE }] }
                });
            }
            tween(op).to(fadeTime, { opacity: targetOp }).start();
            return { node: n, op };
        };

        // Outer ring — warm orange halo
        const { op: outerOp } = makeRing('AuraOuter', radius * 3.8, new Color(255, 130, 20, 255), 75, 0.7);
        this._outerOp = outerOp;

        // Inner ring — bright yellow core
        const { node: innerNode, op: innerOp } = makeRing('AuraInner', radius * 2.4, new Color(255, 220, 55, 255), 140, 0.5);
        this._innerOp = innerOp;

        // Pulse on inner ring after fade-in
        tween(innerOp).to(0.5, { opacity: 140 }).call(() => {
            if (this._detaching || !innerNode.isValid) return;
            this._pulseTween = tween(innerNode)
                .repeatForever(tween<Node>()
                    .to(0.5, { scale: new Vec3(1.20, 1.20, 1) }, { easing: 'sineInOut' })
                    .to(0.5, { scale: new Vec3(1.0,  1.0,  1) }, { easing: 'sineInOut' }))
                .start() as unknown as Tween<Node>;
        }).start();

        // Range-of-influence ring (squished 50% vertically to match perspective)
        if (repelRange > 0 && auraFrame) {
            const { node: rn, op: rangeOp } = makeRing('AuraRange', repelRange * 2, new Color(255, 200, 60, 255), 12, 1.0);
            rn.getComponent(UITransform)!.height = repelRange; // 50% vertical squish
            this._rangeOp = rangeOp;
            tween(rn)
                .repeatForever(tween<Node>()
                    .to(1.2, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
                    .to(1.2, { scale: new Vec3(0.97, 0.97, 1) }, { easing: 'sineInOut' }))
                .start();
        }

        if (this._sparkleFrame) this.schedule(this._spawnSparkle, 0.12);
    }

    private _spawnSparkle(): void {
        const parent = this.node?.parent;
        if (!parent?.isValid) { this.unschedule(this._spawnSparkle); return; }
        const r     = this._radius;
        const angle = Math.random() * Math.PI * 2;
        const dist  = r * (0.6 + Math.random() * 0.9);

        const spark = new Node('AuraSpark');
        spark.setParent(parent);
        spark.setPosition(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        spark.angle = Math.random() * 360;
        const sc = 0.6 + Math.random() * 1.0;
        spark.setScale(sc, sc, 1);

        const palette = [
            new Color(255, 215, 70, 220),
            new Color(255, 150, 30, 200),
            new Color(255, 245, 170, 180),
        ];
        const col  = palette[Math.floor(Math.random() * palette.length)];
        const size = 26 + Math.random() * 22;
        spark.addComponent(UITransform).setContentSize(size, size);
        const sp = spark.addComponent(Sprite);
        sp.sizeMode    = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = this._sparkleFrame!;
        sp.color       = col;
        sp.getMaterialInstance(0)?.overridePipelineStates({
            blendState: { targets: [{ blend: true,
                blendSrc: gfx.BlendFactor.SRC_ALPHA,
                blendDst: gfx.BlendFactor.ONE }] }
        });
        const op = spark.addComponent(UIOpacity);
        op.opacity = 0;

        const rise  = 16 + Math.random() * 22;
        const drift = (Math.random() - 0.5) * 10;
        const dur   = 0.33 + Math.random() * 0.22;
        tween(spark)
            .by(dur, { position: new Vec3(drift, rise, 0) }, { easing: 'quadOut' })
            .call(() => { if (spark.isValid) spark.destroy(); })
            .start();
        tween(op)
            .to(dur * 0.25, { opacity: 200 })
            .to(dur * 0.75, { opacity: 0 })
            .call(() => { if (spark.isValid) spark.destroy(); })
            .start();
    }

    private _fadeOut(): void {
        const node = this.node;
        const ops  = [this._outerOp, this._innerOp, this._rangeOp].filter(Boolean) as UIOpacity[];
        if (ops.some(op => op.node?.isValid)) {
            ops.forEach(op => { if (op.node?.isValid) tween(op).to(0.4, { opacity: 0 }).start(); });
            this.scheduleOnce(() => { if (node?.isValid) node.destroy(); }, 0.45);
        } else {
            if (node?.isValid) node.destroy();
        }
    }
}
