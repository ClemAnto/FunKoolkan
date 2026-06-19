import { _decorator, Component, Node, Color, Vec3, SpriteFrame, UIOpacity, Sprite, UITransform, tween, Tween, gfx } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

const EXPIRE_SECS = 5.0;

@ccclass('PsychoForceEffect')
export class PsychoForceEffect extends Component {
    private _detaching   = false;
    private _tintOp:     UIOpacity | null = null;
    private _glowOp:     UIOpacity | null = null;
    private _pulseTween: Tween<Node> | null = null;

    onExpired: (() => void) | null = null;

    private _expireCb = () => { this.onExpired?.(); };

    /** withGlow=true → portatore PF (tinta + anello pulsante); false → solo tinta ciano */
    static attach(warrior: Warrior, glowFrame: SpriteFrame | null, withGlow = false): PsychoForceEffect {
        const n   = new Node('PsychoForce');
        n.setParent(warrior.viewNode);
        const pfe = n.addComponent(PsychoForceEffect);
        pfe._build(warrior.radius, glowFrame, withGlow);
        return pfe;
    }

    resetTimer(): void {
        this.unschedule(this._expireCb);
        this.scheduleOnce(this._expireCb, EXPIRE_SECS);
    }

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;
        this.unschedule(this._expireCb);
        this._pulseTween?.stop();
        this._pulseTween = null;
        this._fadeOut();
    }

    // Tweens targeting UIOpacity/child nodes are NOT auto-stopped by the engine when
    // this node dies with its warrior (destroy without detach) — stop them here.
    onDestroy(): void {
        this._pulseTween?.stop();
        this._pulseTween = null;
        for (const op of [this._tintOp, this._glowOp]) {
            if (!op) continue;
            Tween.stopAllByTarget(op);
            if (op.node) Tween.stopAllByTarget(op.node);
        }
    }

    private _build(radius: number, glowFrame: SpriteFrame | null, withGlow: boolean): void {
        const addLayer = (name: string, size: number, color: Color, targetOpacity: number) => {
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
            tween(op).to(0.4, { opacity: targetOpacity }).start();
            return { node: n, op };
        };

        // Tinta ciano — sempre presente
        const { op: tintOp } = addLayer('PsychoTint', radius * 2.1, new Color(60, 230, 255, 255), 110);
        this._tintOp = tintOp;

        if (!withGlow) return;

        // Anello pulsante esterno — solo per il portatore PF
        const { node: outer, op: glowOp } = addLayer('PsychoGlow', radius * 3.2, new Color(40, 210, 255, 255), 85);
        this._glowOp = glowOp;

        tween(glowOp).to(0.5, { opacity: 85 }).call(() => {
            if (this._detaching || !outer.isValid) return;
            this._pulseTween = tween(outer)
                .repeatForever(tween<Node>()
                    .to(0.45, { scale: new Vec3(1.20, 1.20, 1) }, { easing: 'sineInOut' })
                    .to(0.45, { scale: new Vec3(1.0,  1.0,  1) }, { easing: 'sineInOut' }))
                .start() as unknown as Tween<Node>;
        }).start();
    }

    private _fadeOut(): void {
        const node = this.node;
        const ops  = [this._tintOp, this._glowOp].filter(Boolean) as UIOpacity[];
        if (ops.some(op => op.node?.isValid)) {
            ops.forEach(op => { if (op.node?.isValid) tween(op).to(0.35, { opacity: 0 }).start(); });
            this.scheduleOnce(() => { if (node?.isValid) node.destroy(); }, 0.4);
        } else {
            if (node?.isValid) node.destroy();
        }
    }
}
