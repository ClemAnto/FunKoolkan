import { _decorator, Component, Color, Sprite, tween, Tween } from 'cc';
import { Warrior } from './Warrior';
import { PerspectiveMapper } from './PerspectiveMapper';

const { ccclass } = _decorator;

const TINT_COLOR    = new Color(200,  80, 255, 255);
const TINT_DARK     = new Color(160,  40, 220, 255);
const TINT_LIGHT    = new Color(225, 115, 255, 255);
const TINT_RESTORE  = new Color(255, 255, 255, 255);

/**
 * Internal base for the "infected warrior" effects (WildRiverSparkleEffect /
 * BrotherhoodSparkleEffect): violet tint pulse on the warrior sprite + bounce hop
 * on its PerspectiveMapper, both restored on detach. Implementation sharing only —
 * each public effect keeps its own dedicated class (project rule: one class per
 * effect). Subclasses tune the protected fields and keep their own static attach().
 */
@ccclass('TintSparkleEffect')
export abstract class TintSparkleEffect extends Component {
    protected _warrior!: Warrior;
    protected _sprite: Sprite | null = null;
    protected _vibTween: Tween<PerspectiveMapper> | null = null;
    protected _detaching = false;

    onExpired: (() => void) | null = null;

    // Tuning — overridden by subclasses
    protected readonly hopUpSec:         number = 0.13;
    protected readonly hopDownSec:       number = 0.13;
    protected readonly hopHeight:        number = 18;
    protected readonly tintInSec:        number = 0.12;
    protected readonly pulseSec:         number = 0.35;
    protected readonly mapperRestoreSec: number = 0.12;
    protected readonly spriteRestoreSec: number = 0.25;

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;

        this._vibTween?.stop();
        this._vibTween = null;
        const mapper = this._warrior?.mapper;
        if (mapper?.node?.isValid) {
            Tween.stopAllByTarget(mapper);
            tween(mapper).to(this.mapperRestoreSec, { bounceY: 0 }).start();
        }

        if (this._sprite?.node?.isValid) {
            Tween.stopAllByTarget(this._sprite);
            tween(this._sprite).to(this.spriteRestoreSec, { color: TINT_RESTORE }).start();
        }

        this.onExpired?.();
        if (this.node?.isValid) this.node.destroy();
    }

    // Destroyed WITHOUT detach (warrior died): kill the repeatForever tweens on the
    // warrior's sprite/mapper — they target components, so the engine won't stop them.
    // After a normal detach() the restore tweens must keep running, hence the guard.
    onDestroy(): void {
        if (this._detaching) return;
        this._vibTween?.stop();
        this._vibTween = null;
        const mapper = this._warrior?.mapper;
        if (mapper) Tween.stopAllByTarget(mapper);
        if (this._sprite) Tween.stopAllByTarget(this._sprite);
    }

    protected _startVFX(): void {
        const sp = this._warrior.viewNode?.getComponent(Sprite);
        if (sp) {
            this._sprite = sp;
            tween(sp).to(this.tintInSec, { color: TINT_COLOR }).call(() => {
                if (!this._detaching && sp.node?.isValid) {
                    tween(sp)
                        .repeatForever(
                            tween<Sprite>()
                                .to(this.pulseSec, { color: TINT_DARK  })
                                .to(this.pulseSec, { color: TINT_LIGHT })
                        )
                        .start();
                }
            }).start();
        }

        const mapper = this._warrior?.mapper;
        if (mapper) {
            this._vibTween = tween(mapper)
                .repeatForever(
                    tween<PerspectiveMapper>()
                        .to(this.hopUpSec,   { bounceY: this.hopHeight }, { easing: 'quadOut' })
                        .to(this.hopDownSec, { bounceY: 0 },              { easing: 'quadIn'  })
                )
                .start() as unknown as Tween<PerspectiveMapper>;
        }
    }
}
