import { _decorator, Component, Vec3, Color, Material, Sprite, tween, Tween } from 'cc';

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

// ── Hit recoil — a quick lurch BACK (up/away) then a springy return (layered over the idle float) ──
const RECOIL_OUT  = 0.07;  // s: punch back
const RECOIL_BACK = 0.52;  // s: spring home (backOut → a slight overshoot = the bounce)

// ── Hit flash — a brief RED wash (mix toward red, peaking at 20%) via the SpriteFlash material ──
const FLASH_PEAK = 0.2;    // peak amount (mix toward red): 20%
const FLASH_RISE = 0.05;   // s: flash in
const FLASH_FALL = 0.3;    // s: flash out

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

    @property({
        range: [0, 60, 1], slider: true,
        tooltip: 'How far (px) Koolkan lurches back when struck (hit()), before springing home. 0 = no recoil.',
    })
    hitRecoil = 10;

    private _idling = false;
    private _t = 0;
    private readonly _basePos = new Vec3();
    private _baseAngle = 0;
    private readonly _baseScale = new Vec3(1, 1, 1);

    /** Transient knockback offset (px) added on TOP of the idle float; 0 at rest, animated by hit(). */
    private readonly _recoil = new Vec3();
    private _recoiling = false;
    private _recoilTween: Tween<Vec3> | null = null;

    /** Hit flash: the sprite material INSTANCES (SpriteFlash effect) + a 0→0.2→0 amount tween — washes
     *  Koolkan RED on a strike. The effect packs colour AND amount into ONE vec4 `flashColor` (.rgb = red,
     *  .a = amount), so we drive that single uniform. Needs the SpriteFlash material on his sprite. */
    private _flashMats: Material[] = [];
    private _flashGathered = false;
    private readonly _flashColor = new Color(255, 0, 0, 0);   // red; .a carries the amount (0 at rest)
    private readonly _flashT = { v: 0 };
    private _flashTween: Tween<{ v: number }> | null = null;

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

    /** Struck: flash RED (20%) and lurch slightly BACK (up/away from the arena) then spring home — a quick
     *  recoil layered on the idle float. `strength` (≥0) scales the distance; repeat hits restart both. */
    hit(strength = 1): void {
        this._flashRed();                                  // red wash (always, even with no recoil)
        if (this.hitRecoil <= 0) return;
        const back = this.hitRecoil * (strength < 0 ? 0 : strength);
        this._recoilTween?.stop();
        this._recoil.set(0, 0, 0);
        this._recoiling = true;
        this._recoilTween = tween(this._recoil)
            .to(RECOIL_OUT, { y: back }, { easing: 'quadOut' })   // punch back (up)
            .to(RECOIL_BACK, { y: 0 }, { easing: 'backOut' })     // spring home with a slight overshoot
            .call(() => {
                this._recoiling = false;
                this._recoil.set(0, 0, 0);
                if (!this._idling) { this.node.setPosition(this._basePos); this.node.angle = this._baseAngle; this.node.setScale(this._baseScale); }
            })
            .start();
    }

    /** Wash Koolkan RED (mix to FLASH_PEAK) then back — the struck reaction. No-op without the SpriteFlash
     *  material on his sprite (the shader's single `flashColor` vec4: .rgb = colour, .a = amount). */
    private _flashRed(): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        this._flashTween?.stop();
        this._flashT.v = 0;
        const apply = (): void => this._setFlash(this._flashT.v);
        this._flashTween = tween(this._flashT)
            .to(FLASH_RISE, { v: FLASH_PEAK }, { easing: 'quadOut', onUpdate: apply })
            .to(FLASH_FALL, { v: 0 }, { easing: 'quadIn', onUpdate: apply })
            .call(() => this._setFlash(0))
            .start();
    }

    /** Material instances of his sprite(s), gathered once (per-instance so the flash is his alone). */
    private _gatherFlashMats(): void {
        if (this._flashGathered) return;
        this._flashGathered = true;
        const sprites = this.node.getComponentsInChildren(Sprite);
        for (let i = 0; i < sprites.length; i++) {
            const m = sprites[i].getMaterialInstance(0);
            if (m) this._flashMats.push(m);
        }
    }

    private _setFlash(v: number): void {
        this._flashColor.a = Math.round(Math.max(0, Math.min(1, v)) * 255);   // amount packed into flashColor.a
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('flashColor', this._flashColor);
    }

    update(dt: number): void {
        if (!this._idling && !this._recoiling) return;   // resting and not bouncing → nothing to drive
        let driftX = 0, bobY = 0, sway = 0, breath = 1;
        if (this._idling) {
            this._t += dt;
            const k = this.floatIntensity < 0 ? 0 : this.floatIntensity > 1 ? 1 : this.floatIntensity;
            driftX = Math.sin(this._t * W_DRIFT + 1.3) * DRIFT_PX * k;
            bobY   = Math.sin(this._t * W_BOB) * BOB_PX * k;
            sway   = Math.sin(this._t * W_SWAY) * SWAY_DEG * k;
            breath = 1 + Math.sin(this._t * W_BREATH) * BREATH_AMP * k;
        }
        // Compose the idle oscillation with the transient hit-recoil offset around the authored pose.
        this.node.setPosition(this._basePos.x + driftX + this._recoil.x, this._basePos.y + bobY + this._recoil.y, this._basePos.z);
        this.node.angle = this._baseAngle + sway;
        this.node.setScale(this._baseScale.x * breath, this._baseScale.y * breath, this._baseScale.z);
    }

    onDestroy(): void {
        this._recoilTween?.stop();
        this._recoilTween = null;
        Tween.stopAllByTarget(this._recoil);
        this._flashTween?.stop();
        this._flashTween = null;
        Tween.stopAllByTarget(this._flashT);
    }
}
