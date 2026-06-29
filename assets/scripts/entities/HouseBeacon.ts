import { _decorator, Component, Node, UIOpacity } from 'cc';
import { GameMode } from '../config/GameMode';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Pulse shaping (internal — the @property surface stays tiny, per the project's "few clear properties" rule).
// Deliberately SLOWER and GENTLER than the TeeBeacon: the house is ambient "this zone is alive / good mana",
// the tee is the sharp "look here" beacon — different rhythms so the two never pulse in lockstep.
const PULSE_PERIOD = 3.4;   // s for one full fade in→out cycle — slow, ambient breathing
const MIN_ALPHA = 35;       // dimmest point of the breath (0–255) — stays subtle
const MAX_ALPHA = 140;      // brightest point of the breath — gentler than the tee's swell
const PULSE_SHAPE = 2;      // >1 skews the cycle so it dwells dim and brightens in a soft swell

/**
 * HouseBeacon — makes the HOUSE read as a LIVE, "good-mana" zone (the safe scoring area where runes discharge
 * into stars). Authored in the EDITOR on the House node; assign the `lit` overlay sprite (the house_light node,
 * coloured CYAN = good mana in the palette).
 *
 * It simply breathes the overlay's opacity in and out — slow and tenuous, an ambient "alive" heartbeat that
 * tells the player this zone matters (aim here), distinct from the TeeBeacon's sharper centre pulse. No glow
 * shader: pure opacity on an authored sprite. The cyan hue comes from the art, not code.
 */
@ccclass('HouseBeacon')
@disallowMultiple
@menu('Arena/HouseBeacon')
export class HouseBeacon extends Component {
    @property({ type: Node, tooltip: 'The house "lit" overlay sprite (house_light, cyan = good mana). Its opacity is breathed in and out. Ships inactive; this turns it on.' })
    lit: Node | null = null;

    private _op: UIOpacity | null = null;
    private _t = 0;   // pulse phase accumulator

    onLoad(): void {
        if (!GameMode.curling) return;   // curling-only → leave the house overlay as authored (off) outside the curling core
        if (!this.lit?.isValid) { console.warn('[HouseBeacon] no `lit` overlay assigned — beacon disabled'); return; }
        this.lit.active = true;                                   // the authored overlay ships inactive
        // Opacity is the channel we animate (allowed on instances; we never touch the authored position/scale).
        this._op = this.lit.getComponent(UIOpacity) ?? this.lit.addComponent(UIOpacity);
        this._op.opacity = MIN_ALPHA;
    }

    update(dt: number): void {
        if (!this._op) return;
        this._t += dt;
        const phase = (Math.sin(this._t * Math.PI * 2 / PULSE_PERIOD) + 1) * 0.5;   // 0..1 sinusoid
        const shaped = Math.pow(phase, PULSE_SHAPE);                                // skew: lingers dim, swells softly
        this._op.opacity = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * shaped;
    }
}
