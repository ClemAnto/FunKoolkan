import { _decorator, Component, Node, UIOpacity } from 'cc';
import { House } from './House';
import { GameMode } from '../config/GameMode';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Pulse shaping (internal — the @property surface stays tiny, per the project's "few clear properties" rule).
const PULSE_PERIOD = 2.6;   // s for one full fade in→out cycle while the tee is free (the "look here" heartbeat)
const MIN_ALPHA = 50;       // dimmest point of the idle pulse (0–255)
const MAX_ALPHA = 200;      // brightest point of the idle pulse
const HOLD_ALPHA = 255;     // steady alpha held while a stone sits on the tee
const HOLD_EASE = 12;       // how fast the held↔free blend chases occupancy (per second) — smooths the switch
const PULSE_SHAPE = 3;      // >1 skews the cycle so it dwells DIM and brightens in a brief swell (off phase longer)

/**
 * TeeBeacon — makes the TEE read as an IMPORTANT spot the moment the player looks at the arena. Authored in
 * the EDITOR on the Tee node; assign the `lit` overlay sprite (the "tee on" art, e.g. the tee_light node) and
 * the `house` (occupancy authority).
 *
 * While the tee is FREE the lit overlay fades in and out on a timer (a "drop here" heartbeat). The instant a
 * stone sits on the tee the overlay locks fully lit and steady — so reaching the tee visibly "activates" it,
 * teaching the player that the tee is where things happen. No glow shader: pure opacity on an authored sprite.
 */
@ccclass('TeeBeacon')
@disallowMultiple
@menu('Arena/TeeBeacon')
export class TeeBeacon extends Component {
    @property({ type: Node, tooltip: 'The "tee lit" overlay sprite (e.g. tee_light). Its opacity is pulsed when free, held full when a stone is on the tee.' })
    lit: Node | null = null;

    @property({ type: House, tooltip: 'The House component (occupancy authority) — tells when a stone is on the TEE so the beacon holds steady.' })
    house: House | null = null;

    private _op: UIOpacity | null = null;
    private _t = 0;        // pulse phase accumulator
    private _held = 0;     // 0 = pulsing freely, 1 = locked bright; eased toward occupancy

    onLoad(): void {
        if (!GameMode.curling) return;   // curling-only → leave the tee overlay as authored (off) outside the curling core
        if (!this.house) this.house = this.getComponent(House);   // convenience if it shares the House node
        if (!this.lit?.isValid) { console.warn('[TeeBeacon] no `lit` overlay assigned — beacon disabled'); return; }
        this.lit.active = true;                                   // the authored overlay ships inactive
        // Opacity is the channel we animate (allowed on instances; we don't touch the authored position/scale).
        this._op = this.lit.getComponent(UIOpacity) ?? this.lit.addComponent(UIOpacity);
        this._op.opacity = MIN_ALPHA;
    }

    update(dt: number): void {
        if (!this._op) return;
        this._t += dt;

        // held chases occupancy: 1 while a stone sits on the tee (→ steady bright), 0 when free (→ pulsing).
        const goal = this.house?.isTeeOccupied() ? 1 : 0;
        this._held += (goal - this._held) * Math.min(1, HOLD_EASE * dt);

        const phase = (Math.sin(this._t * Math.PI * 2 / PULSE_PERIOD) + 1) * 0.5;   // 0..1 sinusoid
        const shaped = Math.pow(phase, PULSE_SHAPE);                                // skew: lingers dim, swells briefly
        const pulse = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * shaped;
        this._op.opacity = pulse + (HOLD_ALPHA - pulse) * this._held;               // blend pulse → steady hold
    }
}
