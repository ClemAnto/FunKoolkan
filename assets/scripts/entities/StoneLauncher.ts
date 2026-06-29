import { _decorator, Component, Node, Vec2, Vec3, Vec4, UITransform, UIOpacity, Sprite, Material, gfx, input, Input, EventTouch, EventMouse, CCFloat, Prefab, Graphics, Color, instantiate, tween, Tween, RigidBody2D, ERigidBody2DType, CircleCollider2D } from 'cc';
import { Stone } from './Stone';
import { Rune } from './Rune';
import { ArenaBounds } from './ArenaBounds';
import { RUNES } from '../config/RuneTypes';
import { projectX, projectY, sizeXFactor, vStackFactor, floorTilt, unprojectX, unprojectY, physicsDepth } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';

const { ccclass, property } = _decorator;

const MAX_AIM_ANGLE = 67.5 * Math.PI / 180;   // aim cone from straight-up (±75% toward horizontal)
const SIM_DT = 1 / 60;
const SIM_MAX_STEPS = 6000;
const SIM_MIN_SPEED = 0.5;   // simulate further into the slow tail → longer, more visible trajectory
const SIM_REST_THRESHOLD = 20;
const SIM_RECORD_DIST = 18;
// Aim-guide reference physics — DELIBERATELY independent of the real launch force (launchSpeed) and the
// real stone drag (stoneDamping), so lowering the force or adding friction never changes how long the
// dotted guide looks. The path SHAPE (direction + bounces) is speed-independent and still uses the real
// wall bounce, so the guide stays an honest direction predictor; only its length is pinned here.
const PREVIEW_SPEED = 200;     // reference full-power launch speed for the guide
const PREVIEW_DAMPING = 0.5;   // reference stone damping for the guide
const BOMB_SHAKE_PX = 2.5;     // loaded stone's unstable vibration amplitude (screen px) while charged to a bomb (about to explode)
const AIM_EASE = 16;           // per-second ease rate for the bow arm + trajectory toward their targets (smooth both ways: invalid↔valid)
const GAUGE_EASE = 14;         // per-second ease rate for the power gauge draining back to empty after release
const MANA_SPIN = 45;          // deg/s perpetual rotation of the mana node
const MANA_WOBBLE_AMP = 12;    // deg peak of the occasional wobble overlaid on the spin
const MANA_WOBBLE_FREQ = 22;   // rad/s wobble oscillation
const MANA_WOBBLE_DECAY = 6;   // wobble damping (higher = settles faster)
const MANA_WOBBLE_MIN = 1.5;   // min seconds between wobbles
const MANA_WOBBLE_MAX = 4.0;   // max seconds between wobbles
const MANA_ALPHA_BASE = 200;   // mana opacity midpoint of the pulse (0..255)
const MANA_ALPHA_AMP = 55;     // mana opacity pulse amplitude (±) → ranges base±amp
const MANA_PULSE_FREQ = 4;     // rad/s of the mana alpha pulse
const LAUNCH_WHITE = Color.WHITE;   // flash colour for the launch animation (loaded + fired stone)
const LAUNCH_FLASH = 0.5;      // white amount (0..1) the launch flash reaches
const LAUNCH_DROP_PX = 10;     // loaded stone drops this many px (screen) as it departs the launcher
const LAUNCH_DROP_TIME = 0.1;  // duration of the loaded stone's drop + whiten on fire (reload waits this long)
const FIRED_FLASH_TIME = 0.15; // fired stone fades from half white back to normal over this
// Legacy (curling core) bomb-overcharge gate: pulling past full power launches a bomb + shows the charge cue.
// In the sticky prototype the overcharge is ALWAYS on (it fires an OVERPOWER shot instead) — see _overchargeOn().
const BOMB_OVERCHARGE_ENABLED = false;
const BOMB_FLASH_COLOR = new Color(255, 40, 40, 255);   // red the bomb-charge flash washes the stone toward (loaded + fired)
const BOMB_FLASH_BASE = 0.30;  // midpoint flash amount of the throbbing bomb-charge red (0..1)
const BOMB_FLASH_AMP = 0.18;   // ± amplitude of the red throb
const BOMB_FLASH_FREQ = 10;    // rad/s of the red throb
const GAUGE_HUE_BASE = 1.7;   // steady HUE rotation (rad) on the gauge while bomb-charged — tuned for red/purple (no throb)
const GAUGE_HUE_EASE = 7;     // per-second ease rate of the gauge hue ramping in/out (gradual activation)
const ARC_MAXDRAG = new Color(255, 210, 70, 230);   // debug arc: full-power drag distance (amber)
const ARC_BOMB = new Color(255, 80, 80, 230);       // debug arc: bomb-arming drag distance (red)
const _tmp = new Vec3();
const _hitPt = new Vec2();   // reused for the launcher hit-test (no per-touch alloc)

interface Seg { ax: number; ay: number; bx: number; by: number; nx: number; ny: number; }

function raySegT(ox: number, oy: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number): number {
    const sx = bx - ax, sy = by - ay;
    const nx = sy, ny = -sx;
    const nDotD = nx * dx + ny * dy;
    if (Math.abs(nDotD) < 1e-6) return Infinity;
    const t = -(nx * (ox - ax) + ny * (oy - ay)) / nDotD;
    if (t <= 0.001) return Infinity;
    const hx = ox + t * dx - ax, hy = oy + t * dy - ay;
    const s = (sx * sx + sy * sy) > 0 ? (hx * sx + hy * sy) / (sx * sx + sy * sy) : 0;
    if (s < -0.01 || s > 1.01) return Infinity;
    return t;
}

/**
 * Stone launcher — ONLY the launch mechanics: aim/drag, slingshot release, trajectory preview, and
 * the "loaded" stone resting on the launcher (with its pop animation). It does NOT own the gem queue
 * or the NEXT preview: the coordinator (ArenaManager) holds current/next, drives NextPreview, and is
 * notified via the host hooks below (onLaunch on fire, onAimPress on press for the swap-on-NEXT tap).
 *
 * Anchored at the launcher node: its position drives the spawn point, the trajectory origin and the
 * launch direction (SLINGSHOT: opposite the pull, ±67.5° cone; power ∝ pull distance). Everything is
 * computed in arena-local space; the spawn point is de-projected via unprojectX/Y and the velocity via
 * _groundDir (the homography couples X and Y). The preview predicts the real DIRECTION and bounces; its
 * LENGTH is a fixed reference (PREVIEW_SPEED/DAMPING) so changing the launch force/friction never resizes it.
 */
@ccclass('StoneLauncher')
export class StoneLauncher extends Component {
    @property({ type: Node, tooltip: 'Arena container (stones spawn as its children; the preview lives here too).' })
    arena: Node | null = null;
    @property({ type: Node, formerlySerializedAs: 'warriorsLayer', tooltip: 'Stone layer where the rune sprites (views) are placed.' })
    stoneLayer: Node | null = null;
    @property({ type: Prefab, tooltip: 'Rune prefab instantiated as the launched stone view.' })
    runePrefab: Prefab | null = null;
    @property({ type: Node, tooltip: 'Rotating arm (StoneLauncherArm). Optional.' })
    launcherNode: Node | null = null;
    @property({ type: Node, tooltip: 'Authored bomb icon shown above the loaded stone while charged to a BOMB (kept inactive otherwise). Optional.' })
    bombIndicator: Node | null = null;
    @property({ type: Node, tooltip: 'Power gauge LEFT half (rotates 180° at power 0 → 0° at full power). Optional.' })
    gaugeLeft: Node | null = null;
    @property({ type: Node, tooltip: 'Power gauge RIGHT half (rotates -180° at power 0 → 0° at full power). Optional.' })
    gaugeRight: Node | null = null;
    @property({ type: Node, tooltip: 'Mana energy node: spins perpetually and wobbles slightly now and then. Optional.' })
    mana: Node | null = null;
    @property({ type: ArenaBounds, tooltip: 'Arena boundary — wall segments + material for the bounce trajectory.' })
    arenaBounds: ArenaBounds | null = null;

    @property({ type: CCFloat, tooltip: 'Stone speed at full power (units/s).' })
    launchSpeed = 150;
    @property({ type: CCFloat, tooltip: 'Stone collider radius (physics px).' })
    stoneRadius = 27.5;
    @property({ type: CCFloat, tooltip: 'Extra scale on the rune view (0.5 = half the prefab size).' })
    stoneViewScale = 0.5;
    @property({ type: CCFloat, tooltip: 'Min aim distance (arena-local px) to fire; closer to the launcher cancels.' })
    minDrag = 24;
    @property({ type: CCFloat, tooltip: 'Aim distance (arena-local px) that reaches full power.' })
    maxDrag = 300;
    @property({ type: CCFloat, tooltip: 'Radius (arena-local px) of the circular area below the arena where the FIRST touch may START a drag. The pull is still measured from the launcher; touching anywhere in this bubble begins aiming. 0 = only the launcher hit box.' })
    dragStartRadius = 380;
    @property({ type: CCFloat, slide: true, range: [1, 2, 0.05], tooltip: 'BOMB overcharge: pull PAST full power by this × maxDrag to launch a bomb (1 = right at full power, 1.3 = 30% extra pull). Power itself stays capped at full.' })
    bombDragFactor = 1.3;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.05], tooltip: 'How much the bow arm follows the aim (1 = full, 0.5 = half).' })
    bowFollowFactor = 0.5;
    @property({ type: CCFloat, tooltip: 'Visible trajectory length in SCREEN px (0 = the whole simulated path, until the stone stops).' })
    trajectoryLength = 0;

    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Stone restitution (mixed with the wall as max()).' })
    stoneRestitution = 0.04;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Stone friction (mixed with the wall as sqrt()).' })
    stoneFriction = 0.3;
    @property({ type: CCFloat, slide: true, range: [0, 5, 0.05], tooltip: 'Stone linear damping.' })
    stoneDamping = 0.5;
    @property({ tooltip: 'Debug: draw a flat ellipse + rotation radius on each launched stone.' })
    debugStones = false;

    @property({ type: CCFloat, tooltip: 'Size of the launcher\'s solid base (ground px) — stones in play bounce off it.' })
    launcherRadius = 28;
    @property({ tooltip: 'Debug: draw the launcher\'s solid circle on the floor.' })
    showLauncherBody = false;

    @property({ type: CCFloat, slide: true, range: [0, 1, 0.05], tooltip: 'Loaded stone size relative to the launched stone (1 = same, <1 = a bit smaller on the launcher).' })
    loadedScaleFactor = 0.85;
    @property({ type: CCFloat, tooltip: 'Duration (s) of the scale-up "pop" when a new stone loads on the launcher (0 = instant).' })
    loadPopDuration = 0.22;
    @property({ type: CCFloat, tooltip: 'Delay (s) after a launch before the new stone pops onto the launcher.' })
    loadPopDelay = 1.0;

    /** Host hooks — set by the coordinator (ArenaManager). */
    onLaunch: ((firedType: number) => void) | null = null;       // a stone was fired → advance the queue + reload
    onAimPress: ((uiX: number, uiY: number) => boolean) | null = null;   // press → return true if consumed (e.g. swap on NEXT)

    private _aiming = false;
    private _suspended = false;         // true while another mode (e.g. EDIT) owns the input → launcher inert
    private _bombCharged = false;       // aiming AND pulled into the bomb-overcharge zone
    private _wasBombCharged = false;    // previous bomb-charge state, to apply the cue (indicator + red tint) on transitions
    private _loadedType = 0;            // gem type resting on the launcher (fires on the next release)
    private _loadedRune: Rune | null = null;   // the stone resting on the launcher (about to fire)
    private _loadAnimT = 1;             // 0..1 progress within the current loaded phase
    private _loadPhase: 0 | 1 | 2 = 0;  // 0 settled, 1 pop-out, 2 pop-in
    private _loadArmed = false;         // in pop-in: hold until the load delay elapses (launch reload)
    private _loadDelayT = 0;            // s left before the armed loaded pop-in is released
    private _pendingLoadType = -1;      // gem type to show on the loaded once it has popped out (swap)
    private _cur = new Vec2();          // current touch, UI coords
    private _preview: Graphics | null = null;
    private _body: Node | null = null;        // the launcher's solid kinematic body in the arena (ground space)
    private _bodyDbg: Graphics | null = null; // debug overlay for the launcher body
    private _dragArc: Graphics | null = null; // debug overlay: the max-drag (full-power) pull-distance arc
    private _bombArc: Graphics | null = null; // debug overlay: the bomb-arming pull-distance arc
    private _segs: Seg[] | null = null;
    private _segsSrc: readonly Vec2[] | null = null;   // boundaryPhysics ref the cache was built from
    private _path: Vec2[] = [];
    private _trajPhase = 0;
    private _armTarget = 0;             // desired bow-arm angle; update() eases launcherNode.angle toward it
    private _trajAlpha = 1;             // current global multiplier on the trajectory dot alpha (eased)
    private _trajTargetAlpha = 1;       // its target (1 = valid pose, 0 = invalid) → smooth fade in/out
    private _pulseT = 0;                // time accumulator for the bomb-charge pulse on the loaded stone
    private _gauge = 0;                 // power shown on the gauge; follows power while aiming, eases to 0 after release
    private _gaugeFlashMats: Material[] = [];   // SpriteFlash material instances on the gauge halves (lazy, for the bomb hue shift)
    private _gaugeFlashGathered = false;
    private readonly _gaugeFx = new Vec4(0, 0, 0, 0);   // fxParams: .x = hue rotation (radians) on the gauge
    private _gaugeHueEnv = 0;           // eased 0..1 envelope ramping the gauge hue in/out (gradual on bomb arm/disarm)
    private _manaBase = 0;              // perpetual spin accumulator for the mana node
    private _manaWobT = -1;             // time within the current wobble (-1 = idle, no wobble running)
    private _manaNextWob = MANA_WOBBLE_MIN;   // seconds left until the next wobble kicks in
    private _manaPulseT = 0;            // time accumulator for the mana alpha pulse
    private _manaOpacity: UIOpacity | null = null;   // cached UIOpacity on the mana node (drives the pulse)
    private readonly _dropT = { y: 0 };  // loaded stone's transient drop offset (px) during the launch departure
    private _launching = false;          // true during the brief launch departure window (blocks a re-fire)
    private _dotColor = new Color(120, 220, 255, 200);   // reused in _drawDots (no per-frame alloc)

    /** True while the loaded stone's pop is running (the coordinator gates a swap on it). */
    get isLoadAnimating(): boolean { return this._loadPhase !== 0; }
    /** Gem type currently loaded (what fires next). */
    get loadedType(): number { return this._loadedType; }
    /** True while aiming pulled into the bomb-overcharge zone — for the (future) charge cue. */
    get isBombCharged(): boolean { return this._bombCharged; }

    /** Suspend the launcher (e.g. while EDIT mode drags stones in the arena): it ignores all input
     *  and aborts any aim in progress until resumed. */
    setSuspended(v: boolean): void { this._suspended = v; if (v) this._abort(); }
    get suspended(): boolean { return this._suspended; }

    onEnable(): void {
        StoneLauncher._instance = this;
        Stone.debugDraw = this.debugStones;
        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE,  this._onTouchMove,  this);
        input.on(Input.EventType.TOUCH_END,   this._onTouchEnd,   this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onCancel,    this);
        input.on(Input.EventType.MOUSE_DOWN,  this._onMouseDown,  this);
        input.on(Input.EventType.MOUSE_MOVE,  this._onMouseMove,  this);
        input.on(Input.EventType.MOUSE_UP,    this._onMouseUp,    this);
        this._gauge = 0; this._setGaugePower(0);   // start empty (overrides the authored pose of the gauge halves)
        if (this.mana) {
            this._manaOpacity = this.mana.getComponent(UIOpacity) ?? this.mana.addComponent(UIOpacity);   // drives the alpha pulse
            const sp = this.mana.getComponent(Sprite);   // additive blend (2D blend is a COMPONENT prop, not exposed in the 3.8 inspector)
            if (sp) { sp.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; sp.dstBlendFactor = gfx.BlendFactor.ONE; }
        }
    }
    onDisable(): void {
        if (StoneLauncher._instance === this) StoneLauncher._instance = null;
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE,  this._onTouchMove,  this);
        input.off(Input.EventType.TOUCH_END,   this._onTouchEnd,   this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onCancel,    this);
        input.off(Input.EventType.MOUSE_DOWN,  this._onMouseDown,  this);
        input.off(Input.EventType.MOUSE_MOVE,  this._onMouseMove,  this);
        input.off(Input.EventType.MOUSE_UP,    this._onMouseUp,    this);
        if (this._body?.isValid) this._body.destroy();
        this._body = null;
        if (this._bodyDbg?.isValid) this._bodyDbg.node.destroy();
        this._bodyDbg = null;
        if (this._dragArc?.isValid) this._dragArc.node.destroy();
        this._dragArc = null;
        if (this._bombArc?.isValid) this._bombArc.node.destroy();
        this._bombArc = null;
    }

    // ── public API (called by the coordinator) ──

    /** Build the loaded rune (once) and pop the first stone in for gem `type`. */
    showInitial(type: number): void {
        this._loadedType = type;
        this._buildLoadedStone();
    }

    /** Launch reload: set the new gem and pop it in after loadPopDelay (the launcher stays empty ~1s).
     *  Collapses the loaded to scale 0 NOW so the fired stone has visibly left the launcher. */
    armReload(newType: number): void {
        this._loadedType = newType;
        this._loadedRune?.setType(newType);
        this._loadedRune?.clearFlash();   // drop the launch-departure white before the next stone pops in
        this._loadPhase = 2; this._loadAnimT = 0; this._loadArmed = true; this._loadDelayT = this.loadPopDelay;
        this._positionLoadedStone();   // collapse to scale 0 now (no 1-frame full-size flash)
    }

    /** Swap (tap on NEXT): pop the loaded OUT, reveal the swapped gem, pop straight back IN (no delay). */
    swapLoaded(newType: number): void {
        this._loadedType = newType;
        this._pendingLoadType = newType;   // revealed once the loaded has popped out
        this._loadPhase = 1; this._loadAnimT = 0; this._loadArmed = false;
    }

    /** EDIT/authoring: create a stone of `gemType` AT REST at the UI point (uiX,uiY) IF it is over the arena,
     *  reusing the launcher's stone config (radius/scale/physics/prefab/layer). Returns true if it spawned
     *  (false if the point is outside the arena or the perspective isn't ready). Used by the EditPanel palette. */
    trySpawnAtUI(uiX: number, uiY: number, gemType: number): boolean {
        const arena = this.arena;
        const ut = arena?.getComponent(UITransform);
        if (!arena?.isValid || !ut || physicsDepth() <= 0) return false;
        if (!ut.getBoundingBoxToWorld().contains(_hitPt.set(uiX, uiY))) return false;   // dropped outside the arena
        _tmp.set(uiX, uiY, 0);
        ut.convertToNodeSpaceAR(_tmp, _tmp);                              // UI → arena-local (visual)
        return !!this.spawnRestingStone(unprojectX(_tmp.x, _tmp.y), unprojectY(_tmp.y), gemType);  // → flat ground
    }

    /** EDIT/authoring: create a stone of `gemType` AT REST at the given GROUND-space point (arena-local,
     *  de-squashed — i.e. a Stone body's `node.position`), reusing the launcher's stone config. Returns the
     *  body node (null if not ready). Used by the EditPanel palette drop and the arena save/load. */
    spawnRestingStone(gx: number, gy: number, gemType: number): Node | null {
        if (!this.arena?.isValid) return null;
        return Stone.spawn({
            arena: this.arena,
            layer: this.stoneLayer,
            viewPrefab: this.runePrefab,
            pos: new Vec2(gx, gy),
            velocity: new Vec2(0, 0),
            radius: this.stoneRadius,
            viewScale: this.stoneViewScale,
            restitution: this.stoneRestitution,
            friction: this.stoneFriction,
            linearDamping: this.stoneDamping,
            gemType,
            name: 'EditStone',
        });
    }

    // ── loaded stone ──

    /** Instantiate the rune resting on the launcher (the stone about to fire) as the LAST child of
     *  the Arena, so it renders ON TOP of the launcher art. Sized/placed to match exactly the stone
     *  that will spawn here on release (same stoneViewScale × depth-perspective at the launcher). */
    private _buildLoadedStone(): void {
        if (!this._loadedRune?.isValid) {
            if (!this.arena?.isValid || !this.runePrefab) return;
            const n = instantiate(this.runePrefab) as unknown as Node;
            n.layer = this.arena.layer;
            n.setParent(this.arena);
            n.setSiblingIndex(this.arena.children.length - 1);   // above the launcher
            this._loadedRune = n.getComponent(Rune);
        }
        this._loadedRune?.setType(this._loadedType);
        this._loadPhase = 2; this._loadAnimT = 0; this._loadArmed = false;   // pop the first stone in
        this._positionLoadedStone();
    }

    /** Glue the resting stone to the launcher position with the same depth-scale a launched stone
     *  gets at that point (its spawn position coincides, so the reload is seamless). */
    private _positionLoadedStone(): void {
        const r = this._loadedRune;
        if (!r?.node?.isValid) return;
        const lp = this.node.position;            // launcher (arena-local) = stone spawn/view point
        const gy = unprojectY(lp.y);              // launcher depth in ground space
        const base = this.stoneViewScale * this.loadedScaleFactor;   // a bit smaller than the launched stone
        const pop = this._loadMult();   // baked here: the per-frame setScale would override a tween
        // While charged to a bomb the stone VIBRATES unstably (random per-frame jitter — like it's about to blow).
        let jx = 0, jy = 0;
        if (this._bombCharged) {
            jx = (Math.random() - 0.5) * 2 * BOMB_SHAKE_PX;
            jy = (Math.random() - 0.5) * 2 * BOMB_SHAKE_PX;
        }
        r.node.setPosition(lp.x + jx, lp.y + this._dropT.y + jy, 0);   // _dropT.y = transient launch-departure drop
        r.node.setScale(base * sizeXFactor(gy) * pop, base * vStackFactor(gy, this.stoneRadius) * pop, 1);   // matches the launched stone's exact-tiling Y scale
    }

    /** Loaded scale multiplier for the current phase: 1 settled, linear 1→0 pop-out, eased 0→1 pop-in. */
    private _loadMult(): number {
        if (this._loadPhase === 1) return 1 - this._loadAnimT;        // pop-out (linear)
        if (this._loadPhase === 2) return this._popScale(this._loadAnimT);   // pop-in (overshoot)
        return 1;                                                     // settled
    }

    /** Ease-out-back 0→1 with a slight overshoot, for the scale-up "pop" when a stone loads. */
    private _popScale(t: number): number {
        if (t >= 1) return 1;
        const c1 = 1.70158, c3 = c1 + 1, x = t - 1;
        return 1 + c3 * x * x * x + c1 * x * x;
    }

    /** Drive the loaded stone's pop: phase 1 pop-out → (reveal pending type) → phase 2 pop-in. On a
     *  launch reload the pop-in holds armed for loadPopDelay (the launcher stays empty ~1s); a swap
     *  is not armed, so it pops straight back in. */
    private _updateLoadedPop(dt: number): void {
        if (this._loadPhase === 0) return;
        const k = dt / Math.max(1e-3, this.loadPopDuration);
        if (this._loadPhase === 1) {                       // pop out
            this._loadAnimT = Math.min(1, this._loadAnimT + k);
            if (this._loadAnimT >= 1) {
                if (this._pendingLoadType >= 0) { this._loadedRune?.setType(this._pendingLoadType); this._pendingLoadType = -1; }
                this._loadAnimT = 0; this._loadPhase = 2;
            }
        } else {                                           // phase 2: pop in, after the load delay
            if (this._loadArmed) {
                this._loadDelayT -= dt;
                if (this._loadDelayT > 0) return;
                this._loadArmed = false;
            }
            this._loadAnimT = Math.min(1, this._loadAnimT + k);
            if (this._loadAnimT >= 1) this._loadPhase = 0;
        }
    }

    update(dt: number): void {
        this._ensureBody();            // the launcher's own solid body (stones bounce off it)
        this._drawBodyDebug();
        this._drawDragArcs();          // debug: the max-drag + bomb-arming pull-distance arcs (under showLauncherBody)
        this._pulseT += dt;
        if (this._bombCharged !== this._wasBombCharged) {   // entered/left the bomb-charge zone → update the cue
            this._wasBombCharged = this._bombCharged;
            if (this.bombIndicator?.isValid) this.bombIndicator.active = this._bombCharged;
            // Left the zone WITHOUT firing → drop the red (a launch keeps it: the departure flashTo / fired bomb owns it).
            if (!this._bombCharged && !this._launching) this._loadedRune?.clearFlash();
        }
        if (this._bombCharged) {   // armed: loaded stone throbs red
            const amt = BOMB_FLASH_BASE + BOMB_FLASH_AMP * Math.sin(this._pulseT * BOMB_FLASH_FREQ);
            this._loadedRune?.setFlash(BOMB_FLASH_COLOR, amt);
        }
        // Gauge HUE: ease an envelope in/out so activation/deactivation is GRADUAL (not a snap). No throb — the
        // hue holds steady at GAUGE_HUE_BASE while armed (it does NOT pulse).
        const hueTarget = this._bombCharged ? 1 : 0;
        this._gaugeHueEnv += (hueTarget - this._gaugeHueEnv) * Math.min(1, dt * GAUGE_HUE_EASE);
        if (this._gaugeHueEnv > 0.001) {
            this._setGaugeHue(this._gaugeHueEnv * GAUGE_HUE_BASE);   // envelope ramps the rotation in/out smoothly
        } else if (this._gaugeHueEnv !== 0) {
            this._gaugeHueEnv = 0; this._setGaugeHue(0);    // settle exactly at the base hue
        }
        this._updateLoadedPop(dt);
        this._positionLoadedStone();   // keep the resting stone glued to the launcher (survives resize)
        if (this.mana) {               // mana: perpetual spin + an occasional damped wobble ("wabble")
            this._manaBase = (this._manaBase - MANA_SPIN * dt) % 360;
            let wob = 0;
            if (this._manaWobT >= 0) {
                this._manaWobT += dt;
                wob = MANA_WOBBLE_AMP * Math.sin(this._manaWobT * MANA_WOBBLE_FREQ) * Math.exp(-this._manaWobT * MANA_WOBBLE_DECAY);
                if (this._manaWobT > 1.2) this._manaWobT = -1;   // wobble has faded → idle until the next one
            } else if ((this._manaNextWob -= dt) <= 0) {
                this._manaWobT = 0;
                this._manaNextWob = MANA_WOBBLE_MIN + Math.random() * (MANA_WOBBLE_MAX - MANA_WOBBLE_MIN);
            }
            this.mana.angle = this._manaBase + wob;
            if (this._manaOpacity) {   // pulse the alpha (reads as energy "breathing"; needs additive blend on the sprite)
                this._manaPulseT += dt;
                this._manaOpacity.opacity = MANA_ALPHA_BASE + MANA_ALPHA_AMP * Math.sin(this._manaPulseT * MANA_PULSE_FREQ);
            }
        }
        if (!this._aiming && this._gauge > 0.0005) {   // not aiming → drain the gauge gradually back to empty
            this._gauge += (0 - this._gauge) * Math.min(1, dt * GAUGE_EASE);
            if (this._gauge < 0.0005) this._gauge = 0;
            this._setGaugePower(this._gauge);
        }
        if (!this._aiming) return;
        this._trajPhase = (this._trajPhase + 160 * dt) % 30;
        const k = Math.min(1, dt * AIM_EASE);   // ease the arm + trajectory toward their targets (both ways: invalid↔valid)
        if (this.launcherNode) this.launcherNode.angle += (this._armTarget - this.launcherNode.angle) * k;
        this._trajAlpha += (this._trajTargetAlpha - this._trajAlpha) * k;
        this._redraw();
    }

    // ── input + firing ──

    private _onTouchStart(e: EventTouch): void { const p = e.getUILocation(); this._beginAim(p.x, p.y); }
    private _onTouchMove(e: EventTouch):  void { const p = e.getUILocation(); this._updateAim(p.x, p.y); }
    private _onTouchEnd(e: EventTouch):   void { const p = e.getUILocation(); this._release(p.x, p.y); }
    private _onCancel():                  void { this._abort(); }
    private _onMouseDown(e: EventMouse):  void { const p = e.getUILocation(); this._beginAim(p.x, p.y); }
    private _onMouseMove(e: EventMouse):  void { if (this._aiming) { const p = e.getUILocation(); this._updateAim(p.x, p.y); } }
    private _onMouseUp(e: EventMouse):    void { const p = e.getUILocation(); this._release(p.x, p.y); }

    private _beginAim(x: number, y: number): void {
        if (this._suspended || this._launching) return;   // another mode owns input, or mid launch-departure → inert
        if (!this._loadedReady()) return;        // no stone ready/visible on the launcher (reloading, or mid pop) → can't aim yet (no spam)
        if (this.onAimPress?.(x, y)) return;     // consumed by the coordinator (e.g. tap on NEXT → swap)
        if (!this._inDragArea(x, y)) return;     // arm when the FIRST touch is anywhere in the circular drag area below the arena
        this._aiming = true; this._cur.set(x, y);
        this._path = []; this._trajAlpha = 0;    // fresh aim: starts as an invalid (zero-drag) pose, eases in as you pull
        this._resim();
    }

    /** True when a stone is fully loaded AND visible on the launcher (settled pop, valid rune) — i.e. ready
     *  to fire. False during the post-launch reload window (loaded collapsed to 0, ~loadPopDelay) and the
     *  pop-out/pop-in animation, so the player can't spam shots before the next rune has actually appeared. */
    private _loadedReady(): boolean {
        return this._loadPhase === 0 && !!this._loadedRune?.node?.isValid;
    }

    /** Whether pulling past full power arms an overcharged shot (legacy bomb gate — off by default). The sticky
     *  prototype no longer uses the overcharge: the detonator is the ManaFlame (fly a shot through it). */
    private _overchargeOn(): boolean { return BOMB_OVERCHARGE_ENABLED; }

    /** Total stones fired (a real launch). Static so the ManaFlame can pace its appearances by shots without a
     *  per-instance reference. Monotonic for the session. */
    private static _launchCount = 0;
    static get launchCount(): number { return StoneLauncher._launchCount; }

    /** The active launcher — so systems like the ManaFlame can reach arena/stoneLayer/spawnRestingStone with
     *  zero editor wiring. */
    private static _instance: StoneLauncher | null = null;
    static get instance(): StoneLauncher | null { return StoneLauncher._instance; }

    /** The rune fired on the CURRENT turn (most recent launch) — the ManaFlame only ignites this one, not other
     *  runes that happen to roll through the flame. */
    private static _lastFired: Stone | null = null;
    static get lastFired(): Stone | null { return StoneLauncher._lastFired; }

    /** True if a UI point lands within the circular DRAG-START area: a bubble of radius dragStartRadius
     *  (arena-local) around the launcher, so the first touch may start a drag anywhere below the arena, not just
     *  on the launcher hit box. The pull is still measured from the launcher (see _pull). dragStartRadius ≤ 0
     *  falls back to the launcher's own UITransform hit box. */
    private _inDragArea(uiX: number, uiY: number): boolean {
        if (this.dragStartRadius <= 0) {
            const ut = this.node.getComponent(UITransform);
            return !ut || ut.getBoundingBoxToWorld().contains(_hitPt.set(uiX, uiY));
        }
        const pull = this._pull(uiX, uiY);   // touch → arena-local offset from the launcher
        return pull.x * pull.x + pull.y * pull.y <= this.dragStartRadius * this.dragStartRadius;
    }

    private _updateAim(x: number, y: number): void { if (!this._aiming) return; this._cur.set(x, y); this._resim(); }

    private _release(x: number, y: number): void {
        if (!this._aiming) return;
        this._aiming = false; this._bombCharged = false; this._path = [];
        this._clearPreview();
        if (this.launcherNode) this.launcherNode.angle = 0;
        if (!this.arena) return;
        const pull = this._pull(x, y);
        const len = this._dragLen(pull);
        if (len < this.minDrag || pull.y > 0) return;   // too short, or pulled ABOVE the launcher → invalid, no launch
        const power = Math.min(len, this.maxDrag) / this.maxDrag;
        const isBomb = this._overchargeOn() && len >= this.maxDrag * this.bombDragFactor;   // pulled PAST full power → bomb (legacy gate, off by default)
        const eff = this._aimDir(-pull.x, -pull.y);   // slingshot: fire OPPOSITE the pull (visual dir)
        const dir = this._groundDir(eff.x, eff.y);     // unit ground direction
        const spawn = this._spawnFrom(dir.x, dir.y);   // just outside the launcher body, along the shot
        const vel = dir.multiplyScalar(this.launchSpeed * power);
        const fired = Stone.spawn({
            arena: this.arena,
            layer: this.stoneLayer,
            viewPrefab: this.runePrefab,
            pos: spawn,
            velocity: vel,
            radius: this.stoneRadius,
            viewScale: this.stoneViewScale,
            restitution: this.stoneRestitution,
            friction: this.stoneFriction,
            linearDamping: this.stoneDamping,
            gemType: this._loadedType,
            isBomb,
            name: isBomb ? 'BombStone' : 'LaunchedStone',
        });
        const firedStone = fired.getComponent(Stone);
        if (isBomb) firedStone?.flashPulse(BOMB_FLASH_COLOR, BOMB_FLASH_BASE, BOMB_FLASH_AMP, BOMB_FLASH_FREQ);   // a bomb KEEPS a throbbing red
        else firedStone?.flashFrom(LAUNCH_WHITE, LAUNCH_FLASH, FIRED_FLASH_TIME);   // normal shot: half white, fades to normal
        StoneLauncher._launchCount++;
        StoneLauncher._lastFired = firedStone;   // the current turn's rune — the only one the ManaFlame may ignite

        // Loaded stone DEPARTS: drop a few px + wash to half white over LAUNCH_DROP_TIME, THEN reload (the
        // coordinator's armReload collapses it to 0). Delaying the reload keeps the departure visible.
        const departedType = this._loadedType;
        this._launching = true;
        this._loadedRune?.flashTo(LAUNCH_WHITE, LAUNCH_FLASH, LAUNCH_DROP_TIME);
        Tween.stopAllByTarget(this._dropT);
        this._dropT.y = 0;
        tween(this._dropT).to(LAUNCH_DROP_TIME, { y: -LAUNCH_DROP_PX }, { easing: 'quadIn' }).start();
        this.scheduleOnce(() => {
            Tween.stopAllByTarget(this._dropT);   // the drop tween holds at -10; stop it so the reset to 0 sticks
            this._dropT.y = 0;                    // next stone pops in at the launcher origin, not 10px lower
            this._launching = false;
            this.onLaunch?.(departedType);   // advance the queue + reload (collapses the loaded, pops the next in)
        }, LAUNCH_DROP_TIME);
    }

    private _abort(): void { this._aiming = false; this._bombCharged = false; this._path = []; this._clearPreview(); if (this.launcherNode) this.launcherNode.angle = 0; }

    /** Drive the radial power gauge: each half sweeps from ±180° (empty) toward 0° (full). */
    private _setGaugePower(power: number): void {
        const t = 1 - Math.max(0, Math.min(1, power));   // 1 at empty, 0 at full
        if (this.gaugeLeft)  this.gaugeLeft.angle  =  180 * t;
        if (this.gaugeRight) this.gaugeRight.angle = -180 * t;
    }

    /** Gauge-half sprite material instances (SpriteFlash), gathered once — the gauge sprites already carry the
     *  SpriteFlash material in the scene (same as the Rune gems); a no-op otherwise. */
    private _gatherGaugeFlashMats(): void {
        if (this._gaugeFlashGathered) return;
        this._gaugeFlashGathered = true;
        for (const half of [this.gaugeLeft, this.gaugeRight]) {
            if (!half?.isValid) continue;
            const sprites = half.getComponentsInChildren(Sprite);
            for (let i = 0; i < sprites.length; i++) {
                const m = sprites[i].getMaterialInstance(0);
                if (m) this._gaugeFlashMats.push(m);
            }
        }
    }

    /** Rotate the gauge's HUE by `radians` (0 = restore) via the SpriteFlash fxParams — keeps its shading, only
     *  spins the colour (red/purple while bomb-charged). */
    private _setGaugeHue(radians: number): void {
        this._gatherGaugeFlashMats();
        if (!this._gaugeFlashMats.length) return;
        this._gaugeFx.x = radians;
        for (let i = 0; i < this._gaugeFlashMats.length; i++) this._gaugeFlashMats[i].setProperty('fxParams', this._gaugeFx);
    }

    /** Recompute aim + trajectory from the CURRENT touch, relative to the launcher. */
    private _resim(): void {
        if (!this._aiming) return;
        const pull = this._pull(this._cur.x, this._cur.y);
        const len = this._dragLen(pull);
        if (len < this.minDrag || pull.y > 0) {   // invalid pose (too short, or above the launcher): keep the last path,
            this._armTarget = 0;                   // update() eases the arm to neutral and fades the dots out
            this._trajTargetAlpha = 0;
            this._bombCharged = false;
            this._gauge = 0; this._setGaugePower(0);
            return;
        }
        const eff = this._aimDir(-pull.x, -pull.y);   // slingshot: fire OPPOSITE the pull
        this._armTarget = -Math.atan2(eff.x, eff.y) * 180 / Math.PI * this.bowFollowFactor;
        this._trajTargetAlpha = 1;                    // valid → update() eases arm + dots back in (symmetric transition)
        this._bombCharged = this._overchargeOn() && len >= this.maxDrag * this.bombDragFactor;   // overcharge zone → bomb (legacy) or OVERPOWER (sticky prototype): show the charge cue
        const power = Math.min(len, this.maxDrag) / this.maxDrag;
        this._gauge = power; this._setGaugePower(power);   // follows the drag directly while aiming
        const d0 = this._groundDir(eff.x, eff.y);
        const spawn = this._spawnFrom(d0.x, d0.y);
        this._path = this._simulate(spawn, d0.multiplyScalar(PREVIEW_SPEED * power));
        // dots are drawn by update()/_redraw() so the marching animation + ease stay centralised
    }

    private _redraw(): void {
        const g = this._ensurePreview();
        if (!g) return;
        g.clear();
        if (this._path.length >= 2 && this._trajAlpha > 0.01) this._drawDots(g, this._path);
    }

    /** Debug: two arcs around the launcher, spanning the ±aim cone (you pull downward) — the MAX-DRAG arc
     *  (amber, where launch power saturates) and the BOMB-ARMING arc just past it (red, maxDrag × bombDragFactor).
     *  Each on its OWN always-on Graphics (arena-local pull space) so they never fight the aim-preview dots. */
    private _drawDragArcs(): void {
        if ((!this.showLauncherBody && !DebugDraw.enabled) || !this.arena?.isValid) {
            if (this._dragArc?.isValid) this._dragArc.clear();
            if (this._bombArc?.isValid) this._bombArc.clear();
            return;
        }
        this._dragArc = this._drawArc(this._dragArc, 'MaxDragDebug', this.maxDrag, ARC_MAXDRAG);
        this._bombArc = this._drawArc(this._bombArc, 'BombLimitDebug', this.maxDrag * this.bombDragFactor, ARC_BOMB);
    }

    /** (Re)draw one aim-cone arc of the given radius/colour on its own child Graphics; creates it on first use.
     *  Drawn as a FLAT ellipse (ry = rx·local ground tilt, sampled) so it lies on the foreshortened ground like the
     *  launcher — and so it coincides with the bomb/power threshold, which uses the same squashed metric (_dragLen). */
    private _drawArc(g: Graphics | null, name: string, radius: number, color: Color): Graphics {
        if (!g?.isValid) {
            const n = new Node(name);
            n.layer = this.arena!.layer;
            n.setParent(this.arena!);
            n.setPosition(0, 0, 0);
            g = n.addComponent(Graphics);
            g.lineWidth = 3;
        }
        const lp = this.node.position;
        const rx = radius, ry = radius * this._launcherTilt();   // flat ground ellipse at the launcher's local tilt (model-aware)
        const a0 = -Math.PI / 2 - MAX_AIM_ANGLE, a1 = -Math.PI / 2 + MAX_AIM_ANGLE;
        const STEPS = 36;
        g.clear();
        g.strokeColor = color;
        for (let i = 0; i <= STEPS; i++) {
            const a = a0 + (a1 - a0) * (i / STEPS);
            const x = lp.x + rx * Math.cos(a), y = lp.y + ry * Math.sin(a);
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
        return g;
    }

    /** Local ground tilt at the launcher (on-screen vertical/horizontal aspect of a floor disc there). Model-aware:
     *  Perspective ≈ s near the bottom, Tilt = k (≈0.5), Flat = 1. Used to draw the floor ellipses and to un-squash
     *  the vertical drag so power matches in both axes. */
    private _launcherTilt(): number { const t = floorTilt(unprojectY(this.node.position.y)); return t > 0.01 ? t : 1; }

    /** Pull magnitude in the squashed-ground metric. The ground is Y-foreshortened on screen (a launcher circle
     *  reads as a flat ellipse), so a vertical drag covers less screen distance per unit of ground pull —
     *  un-squash Y (÷tilt) so power/threshold match the flat drag arcs. */
    private _dragLen(pull: Vec2): number { return Math.hypot(pull.x, pull.y / this._launcherTilt()); }

    /** Vector from the launcher to the touch, in arena-local (visual) space. */
    private _pull(uiX: number, uiY: number): Vec2 {
        const lp = this.node.position;                 // launcher (StoneLauncher) is a child of Arena → arena-local
        const ut = this.arena?.getComponent(UITransform);
        if (!ut) return new Vec2(uiX - lp.x, uiY - lp.y);
        _tmp.set(uiX, uiY, 0);
        ut.convertToNodeSpaceAR(_tmp, _tmp);            // touch → arena-local
        return new Vec2(_tmp.x - lp.x, _tmp.y - lp.y);
    }

    /** Spawn point in physics (ground) space, de-projected from the launcher's visual position. */
    private _spawnPhysics(): Vec2 {
        const lp = this.node.position;
        return new Vec2(unprojectX(lp.x, lp.y), unprojectY(lp.y));
    }

    /** Ground spawn point for a shot in unit ground direction (dx,dy): pushed just outside the launcher
     *  body along the shot, so the launched stone never spawns overlapping it (which Box2D would eject). */
    private _spawnFrom(dx: number, dy: number): Vec2 {
        const s = this._spawnPhysics();
        const off = this.launcherRadius + this.stoneRadius + 2;
        return new Vec2(s.x + dx * off, s.y + dy * off);
    }

    /** Lazily create the launcher's solid circular KINEMATIC body under the arena (ground space) and keep
     *  it pinned at the launcher's ground position, so stones in play collide with / rest against it. */
    private _ensureBody(): void {
        const arena = this.arena;
        if (!arena?.isValid || physicsDepth() <= 0) return;
        const g = this._spawnPhysics();
        if (!this._body?.isValid) {
            const n = new Node('LauncherBody');
            n.layer = arena.layer;
            n.setParent(arena);
            const rb = n.addComponent(RigidBody2D);
            rb.type = ERigidBody2DType.Kinematic;
            rb.gravityScale = 0;
            rb.enabledContactListener = true;
            const col = n.addComponent(CircleCollider2D);
            col.radius = this.launcherRadius;
            col.restitution = this.stoneRestitution;
            col.friction = this.stoneFriction;
            col.apply();
            this._body = n;
        }
        const p = this._body.position;
        if (Math.abs(p.x - g.x) > 0.5 || Math.abs(p.y - g.y) > 0.5) this._body.setPosition(g.x, g.y, 0);
    }

    /** Debug: draw the launcher's solid circle projected onto the floor (a flat ground disc). */
    private _drawBodyDebug(): void {
        if ((!this.showLauncherBody && !DebugDraw.enabled) || !this.arena?.isValid) {
            if (this._bodyDbg?.isValid) this._bodyDbg.clear();
            return;
        }
        if (!this._bodyDbg?.isValid) {
            const n = new Node('LauncherBodyDebug');
            n.layer = this.arena.layer;
            n.setParent(this.arena);
            n.setPosition(0, 0, 0);
            this._bodyDbg = n.addComponent(Graphics);
            this._bodyDbg.lineWidth = 3;
            this._bodyDbg.strokeColor = new Color(120, 255, 160, 235);
        }
        const g = this._spawnPhysics();
        const cx = projectX(g.x, g.y), cy = projectY(g.y);
        const rx = this.launcherRadius * sizeXFactor(g.y), ry = rx * floorTilt(g.y);   // flat ground disc (footprint, model-aware)
        const gr = this._bodyDbg;
        gr.clear();
        gr.ellipse(cx, cy, rx, ry);
        gr.moveTo(cx - rx, cy); gr.lineTo(cx + rx, cy);
        gr.moveTo(cx, cy - ry); gr.lineTo(cx, cy + ry);
        gr.stroke();
    }

    /** Convert a VISUAL aim direction (eff) into the matching GROUND velocity direction, by
     *  un-projecting two visual points near the launcher and differencing (local Jacobian of the
     *  inverse map). Needed because the homography couples X and Y — a visual direction has no
     *  per-axis ground factor. Runs per shot/aim, not per frame. */
    private _groundDir(effX: number, effY: number): Vec2 {
        const lp = this.node.position, EPS = 20;
        const gx0 = unprojectX(lp.x, lp.y), gy0 = unprojectY(lp.y);
        const gx1 = unprojectX(lp.x + effX * EPS, lp.y + effY * EPS), gy1 = unprojectY(lp.y + effY * EPS);
        const dx = gx1 - gx0, dy = gy1 - gy0;
        if (dx * dx + dy * dy < 1e-6) return new Vec2(effX, effY).normalize();   // degenerate (launcher in the clamped band) → fall back to the visual dir
        return new Vec2(dx, dy).normalize();
    }

    /** Clamp a desired shot direction (visual, unit) into the ±67.5° cone from straight up. */
    private _aimDir(aimX: number, aimY: number): Vec2 {
        const len = Math.hypot(aimX, aimY);
        if (len < 1e-4) return new Vec2(0, 1);
        let a = Math.atan2(aimX / len, aimY / len);     // up = 0, toward (aimX, aimY)
        a = Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, a));
        return new Vec2(Math.sin(a), Math.cos(a));
    }

    private _segments(): Seg[] {
        const b = this.arenaBounds?.boundaryPhysics;
        if (!b || b.length < 2) return this._segs ?? [];
        if (this._segs && this._segsSrc === b) return this._segs;   // rebuild only if ArenaBounds re-derived the boundary
        const segs: Seg[] = [];
        const n = b.length, r = this.stoneRadius;
        for (let i = 0; i < n; i++) {
            const a0 = b[i], b0 = b[(i + 1) % n];
            let dx = b0.x - a0.x, dy = b0.y - a0.y;
            const len = Math.hypot(dx, dy);
            if (len < 1e-3) continue;
            dx /= len; dy /= len;
            const nx = -dy, ny = dx;
            segs.push({ ax: a0.x + nx * r, ay: a0.y + ny * r, bx: b0.x + nx * r, by: b0.y + ny * r, nx, ny });
        }
        this._segs = segs;
        this._segsSrc = b;
        return segs;
    }

    private _simulate(p0: Vec2, vel0: Vec2): Vec2[] {
        const segs = this._segments();
        const pts: Vec2[] = [p0.clone()];
        if (segs.length === 0) { pts.push(new Vec2(p0.x + vel0.x, p0.y + vel0.y)); return pts; }
        const restMix = Math.max(this.stoneRestitution, this.arenaBounds?.restitution ?? 0);
        const fricMix = Math.sqrt(Math.max(0, this.stoneFriction * (this.arenaBounds?.friction ?? 0)));
        const dampFactor = 1 / (1 + PREVIEW_DAMPING * SIM_DT);
        let px = p0.x, py = p0.y, vx = vel0.x, vy = vel0.y, recX = px, recY = py;
        for (let step = 0; step < SIM_MAX_STEPS; step++) {
            vx *= dampFactor; vy *= dampFactor;
            const speed = Math.hypot(vx, vy);
            if (speed < SIM_MIN_SPEED) break;
            const mvx = vx * SIM_DT, mvy = vy * SIM_DT;
            const mlen = Math.hypot(mvx, mvy);
            const dxn = mvx / mlen, dyn = mvy / mlen;
            let minT = Infinity, hnx = 0, hny = 0;
            for (const s of segs) {
                const t = raySegT(px, py, dxn, dyn, s.ax, s.ay, s.bx, s.by);
                if (t < minT) { minT = t; hnx = s.nx; hny = s.ny; }
            }
            if (minT <= mlen) {
                px += dxn * minT; py += dyn * minT;
                pts.push(new Vec2(px, py)); recX = px; recY = py;
                const vn = vx * hnx + vy * hny;
                const vtx = vx - vn * hnx, vty = vy - vn * hny;
                const r = Math.abs(vn) > SIM_REST_THRESHOLD ? restMix : 0;
                const vtLen = Math.hypot(vtx, vty);
                const fricLoss = Math.min(fricMix * (1 + r) * Math.abs(vn), vtLen);
                const tScale = vtLen > 1e-4 ? (vtLen - fricLoss) / vtLen : 0;
                const nvn = -r * vn;
                vx = vtx * tScale + nvn * hnx;
                vy = vty * tScale + nvn * hny;
                px += hnx * 0.05; py += hny * 0.05;
            } else {
                px += mvx; py += mvy;
            }
            if ((px - recX) * (px - recX) + (py - recY) * (py - recY) >= SIM_RECORD_DIST * SIM_RECORD_DIST) {
                pts.push(new Vec2(px, py)); recX = px; recY = py;
            }
        }
        pts.push(new Vec2(px, py));
        return pts;
    }

    /**
     * Draw the trajectory as marching dots. Walks the flat physics polyline, projecting each
     * point to visual space INLINE (projectX/projectY) — no per-frame array allocation — and draws
     * each dot as a FLAT ground disc (semi-axes dotR·sizeXFactor × that·0.5 ground-tilt) so the
     * dots shrink with depth and read as lying on the floor. Allocation-free hot path (this runs
     * every frame while aiming): one reused Color, only its alpha changes.
     */
    private _drawDots(g: Graphics, physPts: Vec2[]): void {
        const n = physPts.length;
        if (n < 2) return;
        let total = 0, pvx = projectX(physPts[0].x, physPts[0].y), pvy = projectY(physPts[0].y);
        for (let i = 1; i < n; i++) {
            const vx = projectX(physPts[i].x, physPts[i].y), vy = projectY(physPts[i].y);
            total += Math.hypot(vx - pvx, vy - pvy);
            pvx = vx; pvy = vy;
        }
        if (total < 0.001) return;
        const step = 26, dotR = 11;
        const maxLen = this.trajectoryLength > 0 ? Math.min(this.trajectoryLength, total) : total;   // visible-length cap
        const col = this._dotColor;                 // reused; only alpha changes per dot
        const tint = RUNES[this._loadedType]?.color;   // dots match the gem about to fire (from the rune type registry)
        if (tint) { col.r = tint.r; col.g = tint.g; col.b = tint.b; }
        let phase = this._trajPhase, cum = 0;
        let fpy = physPts[0].y, fvx = projectX(physPts[0].x, fpy), fvy = projectY(fpy);
        for (let i = 1; i < n; i++) {
            const tpy = physPts[i].y, tvx = projectX(physPts[i].x, tpy), tvy = projectY(tpy);
            const ex = tvx - fvx, ey = tvy - fvy;
            const segLen = Math.hypot(ex, ey);
            if (segLen >= 0.001) {
                const ux = ex / segLen, uy = ey / segLen;
                let dist = phase;
                while (dist < segLen) {
                    if (cum + dist >= maxLen) break;   // reached the visible-length cap (trajectoryLength)
                    const t = dist / segLen;
                    col.a = Math.round(240 * (1 - (cum + dist) / maxLen) * this._trajAlpha);   // length fade × global fade (eased in/out on invalid↔valid)
                    g.fillColor = col;
                    const py = fpy + (tpy - fpy) * t;   // depth at this dot
                    const rx = dotR * sizeXFactor(py);  // shrink with depth
                    g.ellipse(fvx + ux * dist, fvy + uy * dist, rx, rx * floorTilt(py));   // flat ground disc (model-aware tilt)
                    g.fill();
                    dist += step;
                }
                phase = Math.max(0, dist - segLen);
                cum += segLen;
                if (cum >= maxLen) break;   // stop drawing past the visible-length cap
            }
            fpy = tpy; fvx = tvx; fvy = tvy;
        }
    }

    private _ensurePreview(): Graphics | null {
        if (this._preview?.isValid) return this._preview;
        if (!this.arena) return null;
        const n = new Node('AimPreview');
        n.layer = this.arena.layer;
        n.setParent(this.arena);
        n.setPosition(0, 0, 0);
        n.setSiblingIndex(this.node.getSiblingIndex());   // render BEHIND the launcher (just below it in z-order)
        this._preview = n.addComponent(Graphics);
        return this._preview;
    }

    private _clearPreview(): void { this._preview?.clear(); }
}
