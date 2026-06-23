import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// ── Idle "sleeping float" — hardcoded feel, scaled by `floatIntensity` (see @property note) ──
// Slow, slightly irrational periods (seconds) so the loop never visibly repeats; sin(0)=0 on every
// channel, so the float eases out of the authored pose with no jolt on the first frame.
const BOB_PX     = 16;    // vertical bob amplitude (px) at full intensity
const DRIFT_PX   = 7;     // horizontal drift amplitude (px)
const SWAY_DEG   = 2.2;   // rotation sway amplitude (degrees)
const BREATH_AMP = 0.012; // breathing scale amplitude (±1.2%) — sells "asleep"
const W_BOB    = (Math.PI * 2) / 3.2;
const W_DRIFT  = (Math.PI * 2) / 5.3;
const W_SWAY   = (Math.PI * 2) / 4.1;
const W_BREATH = (Math.PI * 2) / 2.6;

/**
 * Koolkan — the boss (a colossal corrupted moai). Authored in the EDITOR on the node that carries his
 * graphics; this only attaches BEHAVIOUR. Single home for all his future behaviours (shield, wake,
 * attack, takedown); for now it holds just the base IDLE.
 *
 * `idle()` makes him drift as if floating in the air, fast asleep: a gentle vertical bob, a slow
 * horizontal sway, a dreamy tilt and a faint breathing pulse — all layered as out-of-phase sines around
 * the pose set in the editor. The authored position/rotation/scale stay authoritative: they are captured
 * once and the float only oscillates AROUND them (and is fully restored by `stopIdle()`).
 */
@ccclass('Koolkan')
@disallowMultiple
@menu('Boss/Koolkan')
export class Koolkan extends Component {
    @property({ tooltip: 'Start floating asleep (idle) automatically when the scene loads.' })
    idleOnStart = true;

    @property({
        range: [0, 1, 0.01], slider: true,
        tooltip: 'How much Koolkan drifts while sleeping: 0 = perfectly still, 1 = full bob/sway/breathing.',
    })
    floatIntensity = 0.5;

    private _idling = false;
    private _t = 0;
    private readonly _basePos = new Vec3();
    private _baseAngle = 0;
    private readonly _baseScale = new Vec3(1, 1, 1);

    onLoad(): void {
        // Capture the editor-authoritative pose once; the idle float oscillates around it.
        this._basePos.set(this.node.position);
        this._baseScale.set(this.node.scale);
        this._baseAngle = this.node.angle;
    }

    start(): void {
        if (this.idleOnStart) this.idle();
    }

    /** Begin the sleeping float (idempotent). */
    idle(): void {
        if (this._idling) return;
        this._idling = true;
        this._t = 0;
    }

    /** Stop floating and settle back onto the authored pose. */
    stopIdle(): void {
        if (!this._idling) return;
        this._idling = false;
        this.node.setPosition(this._basePos);
        this.node.setScale(this._baseScale);
        this.node.angle = this._baseAngle;
    }

    update(dt: number): void {
        if (!this._idling) return;
        this._t += dt;
        const k = this.floatIntensity < 0 ? 0 : this.floatIntensity > 1 ? 1 : this.floatIntensity;

        const driftX = Math.sin(this._t * W_DRIFT + 1.3) * DRIFT_PX * k;
        const bobY   = Math.sin(this._t * W_BOB) * BOB_PX * k;
        this.node.setPosition(this._basePos.x + driftX, this._basePos.y + bobY, this._basePos.z);

        this.node.angle = this._baseAngle + Math.sin(this._t * W_SWAY) * SWAY_DEG * k;

        const breath = 1 + Math.sin(this._t * W_BREATH) * BREATH_AMP * k;
        this.node.setScale(this._baseScale.x * breath, this._baseScale.y * breath, this._baseScale.z);
    }
}
