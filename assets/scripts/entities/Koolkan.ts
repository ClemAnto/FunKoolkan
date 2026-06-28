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

// On waking (Sleeping → Floating) Koolkan rises softly by this much, then keeps floating around the raised spot.
const FLOAT_RISE   = 30;   // px risen when he wakes
const FLOAT_RISE_T = 0.6;  // s of the soft rise
const SLEEP_FALL_T = 0.55; // s of the fall back down (quick drop + a few gummy bounces via bounceOut)
const SLEEP_SHAKE_AMP = 12; // px the frame jitters when he slams down to sleep
const SLEEP_SHAKE_T   = 0.35; // s of the frame shake

// ── Hit recoil — a quick lurch BACK (up/away) then a springy return (layered over the idle float) ──
const RECOIL_OUT  = 0.07;  // s: punch back
const RECOIL_BACK = 0.52;  // s: spring home (backOut → a slight overshoot = the bounce)

// ── Flash wash (mix toward a colour, peaking at 20%) via the SpriteFlash material: RED on a hit, PURPLE when
//    absorbing a prayer spirit. ──
const FLASH_PEAK = 0.2;    // peak amount (mix toward the colour): 20%
const FLASH_RISE = 0.05;   // s: flash in
const FLASH_FALL = 0.3;    // s: flash out
const HIT_RED      = new Color(255, 0, 0, 255);     // struck-by-rune wash
const ENERGY_PURPLE = new Color(170, 80, 255, 255); // prayer-spirit absorb wash

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

    @property({ type: Node, tooltip: 'Node to shake when he slams down to sleep (the "frame" — e.g. the Camera or a content root). Empty = no shake.' })
    shakeTarget: Node | null = null;

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

    @property({
        range: [1, 20, 1], slider: true,
        tooltip: 'Energy (prayer spirits absorbed) needed to wake up: Sleeping → Floating.',
    })
    wakeEnergy = 5;

    /** The boss instance — so the RaisingStar can home onto it with no editor wiring. */
    private static _instance: Koolkan | null = null;
    static get instance(): Koolkan | null { return Koolkan._instance; }

    /** Current state at runtime. -1 sentinel so the first setState() always applies. */
    private _state: KoolkanState = -1 as KoolkanState;
    /** Accumulated energy from prayer spirits; reaching `wakeEnergy` wakes him (Sleeping → Floating). */
    private _energy = 0;
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

    /** Vertical offset (px above the base pose): rises on wake, falls on sleep. 0 once settled on the altar. */
    private readonly _rise = { v: 0 };
    private _riseTween: Tween<{ v: number }> | null = null;
    private _falling = false;   // true during the quick fall back to sleep → keeps update() composing the drop

    /** Hit flash: the sprite material INSTANCES (SpriteFlash effect) + a 0→0.2→0 amount tween — washes
     *  Koolkan RED on a strike. The effect packs colour AND amount into ONE vec4 `flashColor` (.rgb = red,
     *  .a = amount), so we drive that single uniform. Needs the SpriteFlash material on his sprite. */
    private _flashMats: Material[] = [];
    private _flashGathered = false;
    private readonly _flashColor = new Color(255, 0, 0, 0);   // red; .a carries the amount (0 at rest)
    private readonly _flashT = { v: 0 };
    private _flashTween: Tween<{ v: number }> | null = null;
    private readonly _glowOff = new Color(255, 255, 255, 0);  // glowColor with .a=0 → kills any inner glow

    onLoad(): void {
        Koolkan._instance = this;
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
            this._riseTween?.stop();                 // wake: rise softly by FLOAT_RISE, then float around the raised spot
            this._rise.v = 0;
            this._riseTween = tween(this._rise).to(FLOAT_RISE_T, { v: FLOAT_RISE }, { easing: 'sineOut' }).start();
            this._killGlow();                        // no inner glow once awake/floating
        } else if (!this._floating) {
            this._energy = 0;   // back to sleep (e.g. round reset) → energy gauge resets
            this._riseTween?.stop();
            if (!this._recoiling) {
                // Quick FALL back to the altar: capture the current height into _rise, then ease it to 0.
                this._rise.v = this.node.position.y - this._basePos.y;
                this.node.angle = this._baseAngle;
                this.node.setScale(this._baseScale);
                this._falling = true;
                this._riseTween = tween(this._rise)
                    .to(SLEEP_FALL_T, { v: 0 }, { easing: 'bounceOut' })   // drop + a few gummy bounces on the altar
                    .call(() => { this._falling = false; this._rise.v = 0; this.node.setPosition(this._basePos); this.node.angle = this._baseAngle; this.node.setScale(this._baseScale); })
                    .start();
                this._shake();   // slam → shake the frame
            } else {
                this._rise.v = 0;   // a recoil owns the position right now; just clear the rise
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
        this._flash(HIT_RED);            // red wash (always, even with no recoil)
        this._recoilBack(strength);
    }

    /** Current energy and whether awake (past Sleeping). */
    get energy(): number { return this._energy; }

    /** Absorb a prayer spirit: +`amount` energy with a PURPLE wash + a little recoil; once it reaches
     *  `wakeEnergy` while still Sleeping, he WAKES (Sleeping → Floating). */
    addEnergy(amount = 1): void {
        this._energy += amount;
        this._flash(ENERGY_PURPLE);
        this._recoilBack(0.6);
        console.log(`[Koolkan] +${amount} energy → ${this._energy}/${this.wakeEnergy}`);
        if (this._energy >= this.wakeEnergy && this._state === KoolkanState.Sleeping) {
            console.log('[Koolkan] energy full — WAKING UP (Sleeping → Floating)');
            this.float();
        }
    }

    /** A quick lurch BACK (up/away) then a springy return, layered over the float. `strength` scales it. */
    private _recoilBack(strength: number): void {
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

    /** Wash Koolkan toward `color` (mix to FLASH_PEAK) then back. No-op without the SpriteFlash material on his
     *  sprite (the shader's single `flashColor` vec4: .rgb = colour, .a = amount). */
    private _flash(color: Color): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        this._flashColor.r = color.r; this._flashColor.g = color.g; this._flashColor.b = color.b;
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

    /** Shake the frame (shakeTarget) with a quick decaying jitter, then restore — the slam-to-sleep impact. */
    private _shake(): void {
        const t = this.shakeTarget;
        if (!t?.isValid) return;
        Tween.stopAllByTarget(t);
        const base = t.position.clone();
        const step = SLEEP_SHAKE_T / 6;
        const tw = tween(t);
        for (let i = 0; i < 5; i++) {
            const amp = SLEEP_SHAKE_AMP * (1 - i / 5);   // decaying
            tw.to(step, { position: new Vec3(base.x + (Math.random() * 2 - 1) * amp, base.y + (Math.random() * 2 - 1) * amp, base.z) }, { easing: 'quadOut' });
        }
        tw.to(step, { position: base }).start();
    }

    /** Force OFF any inner glow on his sprites (glowColor.a = 0) — used when he wakes/floats. No-op on materials
     *  that don't carry the glow property. */
    private _killGlow(): void {
        this._gatherFlashMats();
        for (let i = 0; i < this._flashMats.length; i++) {
            const m = this._flashMats[i];
            if (m.passes?.[0]?.getHandle('glowColor', 0)) m.setProperty('glowColor', this._glowOff);
        }
    }

    update(dt: number): void {
        if (EDITOR) return;                                // editor: only the sprite-swap preview, no motion
        if (!this._floating && !this._recoiling && !this._falling) return;   // sleeping & settled → nothing to drive
        let driftX = 0, bobY = 0, sway = 0, breath = 1;
        if (this._floating) {
            this._t += dt;
            const k = this.floatIntensity < 0 ? 0 : this.floatIntensity > 1 ? 1 : this.floatIntensity;
            driftX = Math.sin(this._t * W_DRIFT + 1.3) * DRIFT_PX * k;
            bobY   = Math.sin(this._t * W_BOB) * BOB_PX * k;
            sway   = Math.sin(this._t * W_SWAY) * SWAY_DEG * k;
            breath = 1 + Math.sin(this._t * W_BREATH) * BREATH_AMP * k;
        }
        // Compose the idle oscillation + the transient hit-recoil + the wake rise around the authored pose.
        this.node.setPosition(this._basePos.x + driftX + this._recoil.x, this._basePos.y + bobY + this._recoil.y + this._rise.v, this._basePos.z);
        this.node.angle = this._baseAngle + sway;
        this.node.setScale(this._baseScale.x * breath, this._baseScale.y * breath, this._baseScale.z);
    }

    onDestroy(): void {
        if (Koolkan._instance === this) Koolkan._instance = null;
        this._recoilTween?.stop();
        this._recoilTween = null;
        this._riseTween?.stop();
        this._riseTween = null;
        Tween.stopAllByTarget(this._rise);
        Tween.stopAllByTarget(this._recoil);
        if (this.shakeTarget?.isValid) Tween.stopAllByTarget(this.shakeTarget);
        this._flashTween?.stop();
        this._flashTween = null;
        Tween.stopAllByTarget(this._flashT);
    }
}
