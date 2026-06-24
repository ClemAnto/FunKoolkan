import { _decorator, Component, Node, Vec3, UIOpacity, Sprite, Material, Color, CCInteger, tween, Tween, Enum } from 'cc';
import { EDITOR } from 'cc/env';
import { physicsDepth, projectX, projectY, sizeXFactor } from '../config/Perspective';

const { ccclass, property, disallowMultiple, executeInEditMode, menu } = _decorator;

// Reused scratch (allocation-free).
const _v = new Vec3();

/** Lifecycle phase of an Aku-aku. The spawner / wake-gauge logic decides WHEN to switch (e.g. hit() while
 *  it still has lives, eliminate() on the killing blow); this component only PLAYS the look of each phase. */
enum Phase { Idle, Dance, Move, Hit, Eliminated }

/** Auto-played state on start() — for trying the feel in play mode before the spawner exists. */
enum StartState { None, Idle, Dance }
Enum(StartState);

// ── Feel (hardcoded; the few high-level knobs below scale these). All amplitudes are in PREFAB units,
//    so they shrink automatically with depth via the root's projected scale. ──
const STRETCH_RATIO  = 0.7;   // mid-air stretch as a fraction of the squash amount
const CONTACT_SHARP  = 3;     // snappiness of the landing/takeoff squash pulse (higher = sharper)
const BREATH_AMP     = 0.05;  // idle breathing (±5% height)
const BREATH_W       = (Math.PI * 2) / 2.2;
const IDLE_SWAY_DEG  = 1.5;   // idle gentle tilt
const IDLE_SWAY_W    = (Math.PI * 2) / 3.1;
const DANCE_TILT_DEG = 9;     // alternating lean per hop while dancing
const DANCE_SHIFT    = 0.12;  // horizontal micro-shift per hop, as a fraction of hopHeight
const DANCE_SQUASH   = 0.45;  // the dance is softer than a travel hop → only this fraction of squashAmount
const MOVE_LEAN_DEG  = 7;     // lean toward the travel direction while moving
const MOVE_FLOOR     = 0.25;  // travel never fully stalls at contact: floor on the per-frame step weight

const HIT_POP    = 18;        // px the body pops up when struck
const HIT_SPIN   = 14;        // deg of recoil twist
const HIT_OUT_T  = 0.06;      // s: punch
const HIT_BACK_T = 0.34;      // s: spring home (backOut overshoot = the bounce)

const ELIM_UP    = 520;       // initial upward launch (units/s) when knocked off the cliff
const ELIM_SIDE  = 150;       // sideways fling (units/s)
const ELIM_GRAV  = 1400;      // gravity pulling it down off the cliff (units/s²)
const ELIM_SPIN  = 360;       // tumble (deg/s)
const ELIM_FADE  = 0.7;       // s to fade out as it falls

const SHADOW_SHRINK = 0.35;   // ground shadow shrinks by up to 35% at the apex of a hop (sells the height)
const SHADOW_FADE   = 0.45;   // ...and lightens by up to 45% — together they read the jump height

const BLINK_MIN    = 2.2;     // s: shortest gap between blinks
const BLINK_MAX    = 5.0;     // s: longest gap between blinks
const BLINK_DUR    = 0.09;    // s: eyes-closed hold (a few frames)
const BLINK_DOUBLE = 0.25;    // chance a blink is a quick double
const BLINK_GAP2   = 0.14;    // s: pause before the second blink of a double
const BLINK_DESYNC = 0.05;    // s: max stagger between the two eyes within ONE blink (almost-but-not-quite synced)

/**
 * Aku-aku — a cute-but-mischievous island spirit (DRAFT enemy of the early rounds: they dance to wake
 * Koolkan; the player knocks them off the cliff before the wake-gauge fills). Authored in the EDITOR as a
 * prefab; this only attaches BEHAVIOUR. Single static sprite, brought to life purely by HOPPING with
 * squash & stretch — no frame animation.
 *
 * Prefab shape (build it in the editor):
 *   AkuAku (root, this component)        ← projected into the arena (position + depth scale), like a Stone view
 *     └─ body (Node, → `body` property)  ← the Sprite; set its anchor Y to 0 (feet) so squash/stretch and the
 *                                           hop arc anchor on the ground. THIS is what gets animated.
 * Optionally give the sprite the SpriteFlash material so hit() washes it white (else the flash is a no-op).
 *
 * Model: it lives in the arena's flat GROUND space (gx,gy) exactly like the stones, and lateUpdate() maps
 * that through the same 1-point projection (projectX/projectY + sizeXFactor) — so far Aku-aku are genuinely
 * smaller and converge toward the centre. The hop is a VISUAL offset on the inner `body` node (it never
 * changes the ground depth), so a character bobbing up doesn't read as "walking away".
 *
 * States: Idle (waiting), Dance (the wake ritual), Move (hops A→B), Hit (struck, survives), Eliminated
 * (flies off the cliff). The wake-gauge / health / spawner wiring is external — see the TODOs.
 */
@ccclass('AkuAku')
@disallowMultiple
@executeInEditMode
@menu('Enemies/AkuAku')
export class AkuAku extends Component {
    @property({ type: Node, tooltip: 'Inner node carrying the sprite — this is what hops & squashes. Give its sprite anchor Y = 0 (feet on the ground).' })
    body: Node | null = null;

    @property({ type: [Node], tooltip: 'The look variants — your 8 Aku-aku sprite NODES under `body`: one is shown, the rest hidden (same pattern as Rune.gems). A random one is picked per spawn.' })
    variants: Node[] = [];

    @property({ visible: false })
    private _variant = 0;   // serialized editor choice (index into variants); the spawner re-rolls it at runtime

    @property({ type: CCInteger, tooltip: 'Which look to show — index into variants (live preview in the editor). At runtime the spawner re-rolls it randomly per spawn (reset()).' })
    get variant(): number { return this._variant; }
    set variant(v: number) {
        const n = this.variants.length;
        this._variant = n ? Math.max(0, Math.min(n - 1, Math.floor(v))) : 0;
        this.setVariant(this._variant);
    }

    @property({ type: Node, tooltip: 'Optional ground shadow (a child of the ROOT, sibling of `body`). Stays on the ground while the body hops; it shrinks & lightens with the hop height to sell the jump.' })
    shadow: Node | null = null;

    @property({ range: [0, 1, 0.01], slider: true, tooltip: 'Squash & stretch intensity on every hop. 0 = rigid, 1 = very rubbery.' })
    squashAmount = 0.35;

    @property({ tooltip: 'Hop height in prefab px (dance & travel arcs).' })
    hopHeight = 46;

    @property({ range: [0.2, 6, 0.1], slider: true, tooltip: 'Hops per second — the dance / travel rhythm.' })
    hopsPerSecond = 2.2;

    @property({ tooltip: 'Travel speed in GROUND units/second when moving A→B.' })
    moveSpeed = 220;

    @property({ type: Enum(StartState), tooltip: 'Auto-play a state on start(), for testing the feel before the spawner exists.' })
    startState = StartState.None;

    /** The Arena container; its world transform maps ground → screen (set by the spawner, same as Stone.arena).
     *  Until assigned, the node keeps its editor placement and only the body animates (handy for previews). */
    arena: Node | null = null;

    private _gx = 0;            // ground-space position (arena-local, de-projected)
    private _gy = 0;
    private _tx = 0;            // move target
    private _ty = 0;
    private _phase = Phase.Idle;
    private _resume = Phase.Idle;   // phase to return to after a Hit
    private _t = 0;                 // hop clock (kept continuous across state changes → no jump)
    private _onArrive: (() => void) | null = null;
    private _onGone: (() => void) | null = null;

    private _frozen = false;        // Eliminated → stop projecting; the body free-flies off the cliff
    private readonly _elimVel = new Vec3();
    private _elimT = 0;

    // Authored poses, captured once; all animation oscillates AROUND these (restored on reset()).
    private readonly _baseScale = new Vec3(1, 1, 1);
    private readonly _bodyPos = new Vec3();
    private readonly _bodyScale = new Vec3(1, 1, 1);
    private _bodyAngle = 0;

    private _hitTween: Tween<Node> | null = null;
    private _uiOp: UIOpacity | null = null;
    private _active = 0;            // index of the currently-shown variant

    // Blink: the "closed eyes" are the CHILDREN of the active variant (no properties — always derived). ONE
    // shared timer fires a blink; the eyes close a few ms apart (a small stagger, not fully independent).
    private _eyeHost: Node | null = null;
    private _blinkT = 0;            // shared countdown to the next blink
    private _blinkActive = false;   // a blink is currently playing out
    private _blinkElapsed = 0;      // time since the current blink started
    private readonly _eyeOffset: number[] = [];   // per-eye stagger within the blink (a few ms → "almost" synced)
    private readonly _eyeDone: boolean[] = [];    // per-eye: reopened, this blink finished

    // Ground shadow: authored pose + base opacity, captured once; driven by the hop height each frame.
    private readonly _shadowScale = new Vec3(1, 1, 1);
    private _shadowOp: UIOpacity | null = null;
    private _shadowBaseOpacity = 255;

    // Optional white hit-flash via the SpriteFlash material (no-op if that material isn't on the sprite).
    private _flashMats: Material[] = [];
    private _flashGathered = false;
    private readonly _flashColor = new Color(255, 255, 255, 0);   // .rgb = colour, .a = amount (driven by the tween)
    private readonly _flashT = { v: 0 };
    private _flashTween: Tween<{ v: number }> | null = null;

    onLoad(): void {
        this._baseScale.set(this.node.scale);
        if (this.body) {
            this._bodyPos.set(this.body.position);
            this._bodyScale.set(this.body.scale);
            this._bodyAngle = this.body.angle;
        }
        if (this.shadow) {
            this._shadowScale.set(this.shadow.scale);
            this._shadowBaseOpacity = (this.shadow.getComponent(UIOpacity)?.opacity) ?? 255;
        }
        this.setVariant(this._variant);   // show the authored look (editor preview + runtime initial)
    }

    start(): void {
        if (this.startState === StartState.Idle) this.wait();
        else if (this.startState === StartState.Dance) this.dance();
    }

    // ── Public API (the spawner / round logic drives these) ─────────────────────────────────────────────

    /** Place this Aku-aku in the arena's GROUND space (same space as the stones) so it projects with the
     *  perspective. Call right after instantiate / pool-get. */
    configure(arena: Node, gx: number, gy: number): void {
        this.arena = arena;
        this._gx = gx; this._gy = gy;
        this._frozen = false;
    }

    /** Show variant `i` (index into `variants`), hide the others — same pattern as Rune.setType. */
    setVariant(i: number): void {
        this._active = i;
        for (let k = 0; k < this.variants.length; k++) {
            if (this.variants[k]) this.variants[k].active = (k === i);
        }
        // The closed-eye sprites are the CHILDREN of the shown variant — derived, never wired by property.
        this._eyeHost = (i >= 0 && i < this.variants.length) ? this.variants[i] : null;
        this._initBlink();
        this._flashGathered = false; this._flashMats.length = 0;   // re-gather the flash mats from the new look
    }

    /** Pick a random look from `variants` (called on reset() so each spawn varies). */
    randomVariant(): void {
        if (this.variants.length) this.setVariant(Math.floor(Math.random() * this.variants.length));
    }

    /** Waiting: present and breathing, no travel. */
    wait(): void { this._enter(Phase.Idle); }

    /** Dance the wake ritual: rhythmic in-place hopping with an alternating lean. */
    dance(): void { this._enter(Phase.Dance); }

    /** Hop from here to a ground point; `onArrive` fires once it lands on the target (then it goes Idle). */
    moveTo(gx: number, gy: number, onArrive?: () => void): void {
        this._tx = gx; this._ty = gy;
        this._onArrive = onArrive ?? null;
        this._enter(Phase.Move);
    }

    /** Struck but NOT eliminated: flash white + a quick pop-and-spin recoil, then resume the prior state.
     *  (Health / how many hits it survives is the caller's concern — call eliminate() on the killing blow.) */
    hit(): void {
        if (this._phase === Phase.Eliminated) return;
        this._flashWhite();
        if (this._phase !== Phase.Hit) this._resume = this._phase;   // remember where to return
        this._phase = Phase.Hit;
        this._hitTween?.stop();
        const b = this.body;
        if (!b) { this._phase = this._resume; return; }
        b.setScale(this._bodyScale);                                 // start the recoil from the neutral pose
        b.angle = this._bodyAngle;
        this._applyShadow(0);                                        // recoil pop is small → keep the shadow grounded
        this._setEyesClosed(true);                                   // wince: both eyes shut during the recoil
        this._hitTween = tween(b)
            .to(HIT_OUT_T, { position: new Vec3(this._bodyPos.x, this._bodyPos.y + HIT_POP, this._bodyPos.z), angle: this._bodyAngle + HIT_SPIN }, { easing: 'quadOut' })
            .to(HIT_BACK_T, { position: this._bodyPos.clone(), angle: this._bodyAngle }, { easing: 'backOut' })
            .call(() => { this._phase = this._resume; this._initBlink(); })   // eyes reopen, blinks rescheduled
            .start();
    }

    /** Eliminated: launch up and tumble off the cliff, fading as it falls; `onGone` fires when it's gone
     *  (the spawner should then pool/destroy it). */
    eliminate(onGone?: () => void): void {
        if (this._phase === Phase.Eliminated) return;
        this._onGone = onGone ?? null;
        this._phase = Phase.Eliminated;
        this._hitTween?.stop(); this._hitTween = null;
        this._frozen = true;                                         // stop projecting; the body free-flies now
        this._elimT = 0;
        const side = (this._gx >= 0 ? 1 : -1) * ELIM_SIDE;          // fling toward the nearer edge → varies per spot
        this._elimVel.set(side, ELIM_UP, 0);
        this._opacity().opacity = 255;
        if (this.shadow) this.shadow.active = false;               // it's off the ground now → no shadow
        this._setEyesClosed(true);                                 // knocked out → eyes shut
    }

    /** Restore for pooling reuse (call on pool-get, before configure()). Re-rolls the look. */
    reset(): void {
        this.randomVariant();
        this._hitTween?.stop(); this._hitTween = null;
        this._flashTween?.stop(); this._flashTween = null;
        if (this.body) {
            Tween.stopAllByTarget(this.body);
            this.body.setPosition(this._bodyPos);
            this.body.setScale(this._bodyScale);
            this.body.angle = this._bodyAngle;
        }
        this._phase = Phase.Idle; this._resume = Phase.Idle;
        this._frozen = false; this._t = 0; this._elimT = 0;
        this._onArrive = null; this._onGone = null;
        this._setFlash(0);
        this._opacity().opacity = 255;
        if (this.shadow) { this.shadow.active = true; this.shadow.setScale(this._shadowScale); }
        this._applyShadow(0);
    }

    get phase(): Phase { return this._phase; }

    // ── Per-frame ───────────────────────────────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (EDITOR) return;   // @executeInEditMode is only for the variant preview — never animate in the editor
        if (this._phase <= Phase.Move) this._tickBlink(dt);   // blink while alive & grounded (not Hit/Eliminated)
        switch (this._phase) {
            case Phase.Idle:       this._tickIdle(dt); break;
            case Phase.Dance:      this._tickHop(dt, true); break;
            case Phase.Move:       this._tickMove(dt); break;
            case Phase.Hit:        break;                 // driven by the hit tween
            case Phase.Eliminated: this._tickEliminate(dt); break;
        }
    }

    /** Project the ground position to screen (same maths as Stone.lateUpdate), so the Aku-aku obeys the
     *  perspective. Skipped while frozen (eliminated) or before the arena is wired (keeps editor placement). */
    lateUpdate(): void {
        if (this._frozen) return;
        const arena = this.arena;
        if (!arena?.isValid || physicsDepth() <= 0) return;
        _v.set(projectX(this._gx, this._gy), projectY(this._gy), 0);
        Vec3.transformMat4(_v, _v, arena.worldMatrix);
        this.node.setWorldPosition(_v);
        // Shrink uniformly with depth (sizeXFactor on both axes) — keep the character upright and proportioned,
        // NOT floor-foreshortened like a stone disc.
        const ws = arena.worldScale, s = sizeXFactor(this._gy);
        this.node.setWorldScale(ws.x * this._baseScale.x * s, ws.y * this._baseScale.y * s, 1);
    }

    // ── State ticks ───────────────────────────────────────────────────────────────────────────────────

    private _tickIdle(dt: number): void {
        this._t += dt;
        if (!this.body) return;
        const breath = 1 + Math.sin(this._t * BREATH_W) * BREATH_AMP;
        const sway = Math.sin(this._t * IDLE_SWAY_W) * IDLE_SWAY_DEG;
        this.body.setPosition(this._bodyPos);
        this.body.setScale(this._bodyScale.x, this._bodyScale.y * breath, 1);   // feet pinned → breathe upward
        this.body.angle = this._bodyAngle + sway;
        this._applyShadow(0);   // grounded → full shadow
    }

    /** In-place hop (Dance when `dancing`). Squash & stretch driven off the hop phase. */
    private _tickHop(dt: number, dancing: boolean): void {
        this._t += dt;
        if (!this.body) return;
        const period = 1 / Math.max(0.0001, this.hopsPerSecond);
        const cyc = this._t / period;
        const u = cyc - Math.floor(cyc);                                  // 0..1 within the hop
        const arc = Math.sin(Math.PI * u);                                // 0 at contact → 1 at apex → 0
        const contact = Math.pow(Math.abs(Math.cos(Math.PI * u)), CONTACT_SHARP);   // 1 at contact, 0 at apex
        const sq = this.squashAmount * (dancing ? DANCE_SQUASH : 1);      // the dance is softer
        const sy = 1 + STRETCH_RATIO * sq * arc - sq * contact;           // tall mid-air, squashed on contact
        const sx = 1 - (sy - 1);                                          // 1st-order volume preserve
        let shiftX = 0, tilt = 0;
        if (dancing) {
            const lean = (Math.floor(cyc) % 2 === 0) ? 1 : -1;            // alternate the lean each hop
            tilt = lean * DANCE_TILT_DEG * arc;
            shiftX = lean * this.hopHeight * DANCE_SHIFT * arc;
        }
        this.body.setPosition(this._bodyPos.x + shiftX, this._bodyPos.y + arc * this.hopHeight, this._bodyPos.z);
        this.body.setScale(this._bodyScale.x * sx, this._bodyScale.y * sy, 1);
        this.body.angle = this._bodyAngle + tilt;
        this._applyShadow(arc);
    }

    private _tickMove(dt: number): void {
        this._t += dt;
        const dx = this._tx - this._gx, dy = this._ty - this._gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) {                                                   // arrived
            this._gx = this._tx; this._gy = this._ty;
            const cb = this._onArrive; this._onArrive = null;
            this._enter(Phase.Idle);
            cb?.();
            return;
        }
        const period = 1 / Math.max(0.0001, this.hopsPerSecond);
        const u = (this._t / period) - Math.floor(this._t / period);
        const arc = Math.sin(Math.PI * u);
        // Advance the ground position mostly while AIRBORNE (weighted by the arc, with a floor so it never
        // fully stalls) → reads as discrete leaps rather than a glide.
        const step = Math.min(dist, this.moveSpeed * dt * (MOVE_FLOOR + (1 - MOVE_FLOOR) * arc));
        this._gx += dx / dist * step;
        this._gy += dy / dist * step;
        if (!this.body) return;
        const contact = Math.pow(Math.abs(Math.cos(Math.PI * u)), CONTACT_SHARP);
        const sq = this.squashAmount;
        const sy = 1 + STRETCH_RATIO * sq * arc - sq * contact;
        const sx = 1 - (sy - 1);
        const lean = (dx >= 0 ? 1 : -1) * MOVE_LEAN_DEG * arc;            // lean toward travel direction
        this.body.setPosition(this._bodyPos.x, this._bodyPos.y + arc * this.hopHeight, this._bodyPos.z);
        this.body.setScale(this._bodyScale.x * sx, this._bodyScale.y * sy, 1);
        this.body.angle = this._bodyAngle + lean;
        this._applyShadow(arc);
    }

    private _tickEliminate(dt: number): void {
        if (!this.body) { this._finishEliminate(); return; }
        this._elimT += dt;
        this._elimVel.y -= ELIM_GRAV * dt;
        const b = this.body, p = b.position;
        b.setPosition(p.x + this._elimVel.x * dt, p.y + this._elimVel.y * dt, p.z);
        b.angle += ELIM_SPIN * dt * (this._elimVel.x >= 0 ? 1 : -1);
        this._opacity().opacity = Math.round(255 * Math.max(0, 1 - this._elimT / ELIM_FADE));
        if (this._elimT >= ELIM_FADE) this._finishEliminate();
    }

    private _finishEliminate(): void {
        const cb = this._onGone; this._onGone = null;
        cb?.();   // TODO(spawner): recycle to the NodePool / destroy here.
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

    private _enter(p: Phase): void {
        if (this._phase === p) return;
        if (this._phase === Phase.Hit) { this._hitTween?.stop(); this._hitTween = null; }
        this._phase = p;
    }

    private _opacity(): UIOpacity {
        if (!this._uiOp?.isValid) this._uiOp = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        return this._uiOp;
    }

    /** Ground shadow reacting to the hop height: as `arc` (0 on the ground → 1 at the apex) rises, the shadow
     *  shrinks and lightens, so the eye reads how high the Aku-aku jumped. No-op without a `shadow` node. */
    private _applyShadow(arc: number): void {
        const sh = this.shadow;
        if (!sh?.isValid) return;
        const k = arc < 0 ? 0 : arc > 1 ? 1 : arc;
        const s = 1 - SHADOW_SHRINK * k;
        sh.setScale(this._shadowScale.x * s, this._shadowScale.y * s, 1);
        this._shadowOpacity().opacity = Math.round(this._shadowBaseOpacity * (1 - SHADOW_FADE * k));
    }

    private _shadowOpacity(): UIOpacity {
        if (!this._shadowOp?.isValid) {
            const sh = this.shadow!;
            this._shadowOp = sh.getComponent(UIOpacity) ?? sh.addComponent(UIOpacity);
        }
        return this._shadowOp;
    }

    /** (Re)initialise the per-eye blink: every eye open, each with its OWN random countdown so left & right
     *  drift out of sync. The eyes ARE the children of the active variant — derived, never wired by property. */
    private _initBlink(): void {
        const host = this._eyeHost;
        const n = host?.isValid ? host.children.length : 0;
        this._eyeOffset.length = n; this._eyeDone.length = n;
        for (let i = 0; i < n; i++) { this._eyeOffset[i] = 0; this._eyeDone[i] = true; host!.children[i].active = false; }
        this._blinkActive = false;
        this._blinkT = BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN);
    }

    /** Force every eye open/closed at once (the wince on hit, the KO on eliminate). Cancels any in-flight blink. */
    private _setEyesClosed(closed: boolean): void {
        const host = this._eyeHost;
        if (!host?.isValid) return;
        const ch = host.children;
        for (let i = 0; i < ch.length; i++) if (ch[i]?.isValid) ch[i].active = closed;
        this._blinkActive = false;
    }

    /** Blink: ONE shared timer fires a blink, then each eye closes & reopens offset by a few ms (BLINK_DESYNC)
     *  so they're almost — but not quite — in sync. Occasional quick double via BLINK_GAP2. */
    private _tickBlink(dt: number): void {
        const host = this._eyeHost;
        if (!host?.isValid) return;
        const ch = host.children;
        if (this._blinkActive) {
            this._blinkElapsed += dt;
            let allDone = true;
            for (let i = 0; i < ch.length && i < this._eyeOffset.length; i++) {
                if (this._eyeDone[i] || !ch[i]?.isValid) continue;
                const o = this._eyeOffset[i];
                if (this._blinkElapsed >= o + BLINK_DUR) { ch[i].active = false; this._eyeDone[i] = true; }   // reopen
                else { if (this._blinkElapsed >= o) ch[i].active = true; allDone = false; }                   // close after its stagger
            }
            if (allDone) {
                this._blinkActive = false;
                this._blinkT = (Math.random() < BLINK_DOUBLE) ? BLINK_GAP2 : BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN);
            }
            return;
        }
        this._blinkT -= dt;
        if (this._blinkT <= 0) {
            this._blinkActive = true;
            this._blinkElapsed = 0;
            for (let i = 0; i < ch.length && i < this._eyeOffset.length; i++) {
                this._eyeOffset[i] = Math.random() * BLINK_DESYNC;   // each eye a few ms apart
                this._eyeDone[i] = false;
            }
        }
    }

    /** Wash the sprite white (SpriteFlash material's `flashColor` vec4: .rgb colour, .a amount). No-op if the
     *  material isn't on the sprite — see reference: a plain tint/additive can't whiten on any background. */
    private _flashWhite(): void {
        if (!this._flashGathered) {
            this._flashGathered = true;
            const host = this.variants[this._active] ?? this.node;   // only the shown variant flashes...
            const main = host.getComponent(Sprite);                  // ...its OWN sprite, not the eye children
            const m = main?.getMaterialInstance(0);
            if (m) this._flashMats.push(m);
        }
        if (!this._flashMats.length) return;
        this._flashTween?.stop();
        this._flashT.v = 0;
        const apply = (): void => this._setFlash(this._flashT.v);
        this._flashTween = tween(this._flashT)
            .to(0.05, { v: 1 }, { easing: 'quadOut', onUpdate: apply })
            .to(0.22, { v: 0 }, { easing: 'quadIn', onUpdate: apply })
            .call(() => this._setFlash(0))
            .start();
    }

    private _setFlash(v: number): void {
        if (!this._flashMats.length) return;
        this._flashColor.a = Math.round(Math.max(0, Math.min(1, v)) * 255);
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('flashColor', this._flashColor);
    }

    onDestroy(): void {
        this._hitTween?.stop(); this._hitTween = null;
        this._flashTween?.stop(); this._flashTween = null;
        if (this.body) Tween.stopAllByTarget(this.body);
        Tween.stopAllByTarget(this._flashT);
    }
}
