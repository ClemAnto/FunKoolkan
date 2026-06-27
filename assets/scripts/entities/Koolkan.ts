import { _decorator, Component, Node, Vec3, Color, Material, Sprite, tween, Tween, Enum } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, disallowMultiple, executeInEditMode, menu } = _decorator;

/** Koolkan's three life states. The sprite swap + motion are driven off this. */
export enum KoolkanState {
    Sleeping,   // dormant: a single STATIC sprite, no motion at all
    Floating,   // hovering awake-ish in the air — the dreamy float
    Awaken,     // same float as Floating, but he can ATTACK (attack wiring TBD)
}
Enum(KoolkanState);

// ── Idle "float" — hardcoded feel, scaled by `floatIntensity` (see @property note). Used by BOTH
// Floating and Awaken. Slow, slightly irrational periods (seconds) so the loop never visibly repeats;
// sin(0)=0 on every channel, so the float eases out of the authored pose with no jolt on frame one. ──
const BOB_PX     = 16;    // vertical bob amplitude (px) at full intensity
const DRIFT_PX   = 7;     // horizontal drift amplitude (px)
const SWAY_DEG   = 2.2;   // rotation sway amplitude (degrees)
const BREATH_AMP = 0.012; // breathing scale amplitude (±1.2%)
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
 * graphics; this only attaches BEHAVIOUR.
 *
 * Three states, one STATIC sprite each (assigned in the inspector):
 *  • Sleeping — dormant, no motion, static sprite.
 *  • Floating — drifts as if asleep in mid-air: a gentle vertical bob, a slow horizontal sway, a dreamy
 *    tilt and a faint breathing pulse — out-of-phase sines layered AROUND the editor pose.
 *  • Awaken   — identical float, but he is now able to ATTACK (the attack itself is TBD).
 *
 * The authored position/rotation/scale stay authoritative: captured once, the float only oscillates
 * around them, and Sleeping fully restores them.
 */
@ccclass('Koolkan')
@disallowMultiple
@executeInEditMode
@menu('Boss/Koolkan')
export class Koolkan extends Component {
    @property({ type: Node, tooltip: 'Sprite shown while SLEEPING (static, dormant).' })
    sleepingSprite: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite shown while FLOATING (hovering asleep).' })
    floatingSprite: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite shown while AWAKEN (hovering, can attack).' })
    awakenSprite: Node | null = null;

    @property({
        type: KoolkanState,
        tooltip: 'State at scene load. Also previews live in the editor (swaps the visible sprite).',
    })
    get startState(): KoolkanState { return this._startState; }
    set startState(v: KoolkanState) {
        this._startState = v;
        if (EDITOR) this._showStateSprite(v);   // live editor preview of the sprite swap
    }
    @property
    private _startState: KoolkanState = KoolkanState.Sleeping;

    @property({
        range: [0, 1, 0.01], slider: true,
        tooltip: 'How much Koolkan drifts while floating: 0 = perfectly still, 1 = full bob/sway/breathing.',
    })
    floatIntensity = 0.5;

    @property({
        range: [0, 60, 1], slider: true,
        tooltip: 'How far (px) Koolkan lurches back when struck (hit()), before springing home. 0 = no recoil.',
    })
    hitRecoil = 10;

    /** Current state at runtime. -1 sentinel so the first setState() always applies. */
    private _state: KoolkanState = -1 as KoolkanState;
    /** Whether the float animation is running (Floating or Awaken). */
    private _floating = false;
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
        // Capture the editor-authoritative pose once; the float oscillates around it.
        this._basePos.set(this.node.position);
        this._baseScale.set(this.node.scale);
        this._baseAngle = this.node.angle;
    }

    start(): void {
        if (EDITOR) return;
        this.setState(this._startState);
    }

    // ── State API ───────────────────────────────────────────────────────────────────────────────────
    /** Dormant: static sprite, no motion. */
    sleep(): void { this.setState(KoolkanState.Sleeping); }
    /** Drift asleep in mid-air. */
    float(): void { this.setState(KoolkanState.Floating); }
    /** Awake: same float, now able to attack. */
    awaken(): void { this.setState(KoolkanState.Awaken); }

    /** True once awake — gate point for the (future) attack logic. */
    get canAttack(): boolean { return this._state === KoolkanState.Awaken; }
    get state(): KoolkanState { return this._state; }

    /** Switch state: swap the visible sprite and start/stop the float (idempotent). */
    setState(state: KoolkanState): void {
        if (this._state === state) return;
        this._state = state;
        this._showStateSprite(state);

        const wasFloating = this._floating;
        this._floating = state !== KoolkanState.Sleeping;
        if (this._floating && !wasFloating) {
            this._t = 0;
        } else if (!this._floating) {
            // Sleeping → settle back onto the authored pose (recoil, if any, keeps animating).
            if (!this._recoiling) {
                this.node.setPosition(this._basePos);
                this.node.setScale(this._baseScale);
                this.node.angle = this._baseAngle;
            }
        }
    }

    /** Activate only the sprite that matches `state`; leave others off. Null/unassigned target → no-op
     *  (so a missing sprite never blanks Koolkan). */
    private _showStateSprite(state: KoolkanState): void {
        const target = this._spriteFor(state);
        if (!target) {
            console.warn(`[Koolkan] no sprite assigned for state ${KoolkanState[state]} — visibility unchanged.`);
            return;
        }
        const refs = [this.sleepingSprite, this.floatingSprite, this.awakenSprite];
        for (let i = 0; i < refs.length; i++) {
            const n = refs[i];
            if (n) n.active = n === target;
        }
    }

    private _spriteFor(state: KoolkanState): Node | null {
        switch (state) {
            case KoolkanState.Sleeping: return this.sleepingSprite;
            case KoolkanState.Floating: return this.floatingSprite;
            case KoolkanState.Awaken:   return this.awakenSprite;
            default:                    return null;
        }
    }

    // ── Hit reaction ────────────────────────────────────────────────────────────────────────────────
    /** Struck: flash RED (20%) and lurch slightly BACK (up/away from the arena) then spring home — a quick
     *  recoil layered on the float. `strength` (≥0) scales the distance; repeat hits restart both. */
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
                if (!this._floating) { this.node.setPosition(this._basePos); this.node.angle = this._baseAngle; this.node.setScale(this._baseScale); }
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

    /** Material instances of his sprite(s), gathered once (per-instance so the flash is his alone).
     *  getComponentsInChildren includes inactive nodes, so all three state sprites are covered. */
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
        if (EDITOR) return;                                // editor: only the sprite-swap preview, no motion
        if (!this._floating && !this._recoiling) return;   // sleeping/resting and not bouncing → nothing to drive
        let driftX = 0, bobY = 0, sway = 0, breath = 1;
        if (this._floating) {
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
