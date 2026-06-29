import { _decorator, Component, Node, Vec2, Vec3, Vec4, UIOpacity, Sprite, Material, Color, CCInteger, tween, Tween, Enum, RigidBody2D, ERigidBody2DType, CircleCollider2D, Graphics, UITransform, Contact2DType, Collider2D, Prefab, instantiate, ParticleSystem2D, resources, view } from 'cc';
import { EDITOR } from 'cc/env';
import { physicsDepth, physicsWidth, projectX, projectY, sizeXFactor, floorTilt, unprojectY } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';
import { GameMode } from '../config/GameMode';
import { Stone } from './Stone';

const FOOTPRINT_SCALE = 0.8;   // physics body radius as a fraction of the sprite half-width (a touch smaller than the art)
const MOVE_DUTY = 0.72;    // average per-hop travel weight (arc-weighted advance) → used to size a move to N hops
const POSE_BLEND = 0.15;   // s to ease the inner body from the captured pose to the new state's target (anti-snap)
const HIT_FLASH_COLOR = new Color(255, 170, 60, 255);   // orange: a light hit
const ELIM_FLASH_COLOR = new Color(255, 60, 40, 255);   // red: knocked off the cliff
// Death-VFX prefabs, loaded from resources/ (no per-Aku @property to wire). The prefabs live in
// assets/resources/prefabs/ so resources.load resolves them by path.
const FX_EXPLODE = 'prefabs/SparkBurst';    // electrified death → burst of sparks
const FX_TWINKLE = 'prefabs/ImpactFlash';   // eliminate parabola end → a small "star winks out" glow

const { ccclass, property, disallowMultiple, executeInEditMode, menu } = _decorator;

// Reused scratch (allocation-free).
const _v = new Vec3();

/** Lifecycle phase of an Aku-aku. The spawner / wake-gauge logic decides WHEN to switch (e.g. hit() while
 *  it still has lives, eliminate() on the killing blow); this component only PLAYS the look of each phase. */
enum Phase { Idle, Dance, Move, Emerge, Hit, Eliminated, Zapped, Pray, Leap }

/** Auto-played state on start() — for trying the feel in play mode before the spawner exists. */
enum StartState { None, Idle, Dance, Pray }
Enum(StartState);

// ── Feel (hardcoded; the few high-level knobs below scale these). All amplitudes are in PREFAB units,
//    so they shrink automatically with depth via the root's projected scale. ──
const STRETCH_RATIO  = 0.7;   // mid-air stretch as a fraction of the squash amount
const CONTACT_SHARP  = 3;     // snappiness of the landing/takeoff squash pulse (higher = sharper)
const BREATH_AMP     = 0.04;  // idle breathing (±4% height) — volume-preserved, anchored at the feet → subtle, not a heave
const BREATH_W       = (Math.PI * 2) / 1.9;
const IDLE_SWAY_DEG  = 1.5;   // idle gentle tilt (bigger = goofier)
const IDLE_SWAY_W    = (Math.PI * 2) / 3.1;
const DANCE_TILT_DEG = 12;    // alternating lean per hop while dancing
const DANCE_SHIFT    = 0.16;  // horizontal micro-shift per hop, as a fraction of hopHeight
const DANCE_SQUASH   = 0.6;   // the dance is softer than a travel hop → this fraction of squashAmount (bouncy)
const MOVE_LEAN_DEG  = 7;     // lean toward the travel direction while moving
const MOVE_FLOOR     = 0.25;  // travel never fully stalls at contact: floor on the per-frame step weight

const HIT_POP    = 18;        // px the body pops up when struck
const HIT_SPIN   = 14;        // deg of recoil twist
const HIT_OUT_T  = 0.06;      // s: punch
const HIT_BACK_T = 0.34;      // s: spring home (backOut overshoot = the bounce)

const EMERGE_SINK   = 26;     // px the body starts SUNK in the "hole" (flattened) before the pop
const EMERGE_FLAT_X = 1.2;    // initial horizontal scale in the hole (only slightly wide — NOT a wide pancake)
const EMERGE_FLAT_Y = 0.35;   // initial vertical scale in the hole (squashed short)
const EMERGE_RISE_T = 0.16;   // s: burst up out of the ground (stretch tall)
const EMERGE_SET_T  = 0.52;   // s: drop back and bounce to the resting pose (bounceOut = the rubbery bounces)
const EMERGE_DROP   = 30;     // px: the emerge is a little hop that LANDS this much lower on screen than the hole

// Electrified-death (struck by a RaisingStar): leap up, flicker white↔cyan, then burst into sparks.
const ZAP_TIME       = 0.5;   // s of electrified flicker before the explosion
const ZAP_LEAP       = 52;    // px the body leaps up when zapped
const ZAP_FLASH_HZ   = 22;    // flash-amount pulse rate (fast electrified shimmer)
const ZAP_COLOR_HZ   = 13;    // white↔cyan toggle rate
const ZAP_SHIVER_DEG = 7;     // random angle shiver while electrified
const ZAP_WHITE = new Color(255, 255, 255, 255);
const ZAP_CYAN  = new Color(90, 240, 255, 255);
// A rune impact only HURTS an Aku-aku if the rune is actually moving — a stone at rest / barely drifting
// against it does no damage.
const HIT_MIN_SPEED = 35;     // physics units/s the colliding rune must exceed to count as a hit

// Eliminated = "kicked out of the stadium": a parabola from the contact point UP to near the screen's top
// edge, then DOWN into the lower part of the screen (and behind everything), shrinking to a dot + a final
// twinkle. Targets are SCREEN-relative; everything is randomised per death.
const ELIM_DUR_MIN  = 1.05;   // s of flight
const ELIM_DUR_MAX  = 1.5;
const ELIM_APEXT_MIN = 0.30;  // fraction of the flight spent rising — small = a FAST jump up, then a long fall
const ELIM_APEXT_MAX = 0.45;
const ELIM_TOP_OVER_MIN = 0.08;  // apex sits this far ABOVE the screen's TOP edge, as a fraction of screen height
const ELIM_TOP_OVER_MAX = 0.22;  // (shoots a bit off the top → a high jump)
const ELIM_HIGH_HOP     = 0.08;  // apex height (fraction of H) above the START when eliminated from a HIGH spot → a small hop
const ELIM_LAND_MIN = 0.75;       // landing height above the BOTTOM edge, as a fraction of the arena height
const ELIM_LAND_MAX = 0.90;       // (upper-middle, but not too high)
const ELIM_SIDE_FRAC_MIN = 0.10;  // horizontal travel from the contact point, as a fraction of HALF the width
const ELIM_SIDE_FRAC_MAX = 0.28;  // (a small drift in the rune's direction — stays well clear of the edge)
const ELIM_END_SCALE = 0.0;   // final size (× the start scale) → shrinks all the way to nothing
const ELIM_FADE = 0.35;       // the last fraction of the flight also fades the Aku out (on top of the shrink)

// Leap onto a column: a world-space ballistic arc of the ROOT (projection frozen), landing on the column top,
// then it PERCHES there (root glued to the top cube) — used by the "climb a column and pray" spawn mode.
const COLUMN_LEAP_DUR = 0.5;   // s of the leap onto the column top
const COLUMN_LEAP_ARC_MIN = 50;   // min apex height (world px) over the straight line, so even a short hop arcs
const COLUMN_LEAP_ARC_K = 0.4;    // apex height as a fraction of the leap distance (bigger leap = higher arc)
// Re-align when a cube vanishes under a perched Aku: a small hop UP, then settle down to the new (lower) top.
const REPERCH_HOP      = 30;      // world px of the little hop up before dropping
const REPERCH_HOP_T    = 0.12;    // s of the hop up
const REPERCH_SETTLE_T = 0.42;    // s to settle onto the new top (gummy elastic bounce)

const SHADOW_SHRINK = 0.35;   // ground shadow shrinks by up to 35% at the apex of a hop (sells the height)
const SHADOW_FADE   = 0.45;   // ...and lightens by up to 45% — together they read the jump height

const BLINK_MIN    = 2.2;     // s: shortest gap between blinks
const BLINK_MAX    = 5.0;     // s: longest gap between blinks
const BLINK_DUR    = 0.09;    // s: eyes-closed hold (a few frames)
const BLINK_DOUBLE = 0.25;    // chance a blink is a quick double
const BLINK_GAP2   = 0.14;    // s: pause before the second blink of a double
const BLINK_DESYNC = 0.05;    // s: max stagger between the two eyes within ONE blink (almost-but-not-quite synced)

// Prayer: the same gentle idle sway, but eyes CLOSED — the INVERSE of blink. Every so often the Aku peeks,
// opening ONE random eye (or, less often, BOTH) for a short beat, then shuts them again.
const PRAY_PEEK_MIN = 1.8;    // s: shortest gap between peeks
const PRAY_PEEK_MAX = 4.6;    // s: longest gap between peeks
const PRAY_PEEK_DUR = 0.5;    // s: how long the peeked eye(s) stay open
const PRAY_BOTH     = 0.3;    // chance a peek opens BOTH eyes (else just one, picked at random)
const PRAY_BREATH_AMP = 0.04; // praying breath is calmer than idle (BREATH_AMP) → a subtle wobble, not a heave
const PRAY_SWAY_DEG   = 1.5;  // and a barely-there sway (vs IDLE_SWAY_DEG) → mostly still, head bowed
// Prayer aura: a feathered INNER glow on the body sprite while praying (via the SpriteFlash material's glow). The
// glow stays inside the silhouette → no clipping / no texture padding. STATIC here — animate the intensity later
// for a pulse.
const GLOW_COLOR     = new Color(170, 80, 255, 255);    // purple "spirit" rim
const GLOW_REACH     = 0.07;  // inner-rim reach as a UV fraction of the sprite (resolution-independent: no texture-size read)
const GLOW_FALLOFF   = 1.3;   // >1 = tighter to the edge
const GLOW_QUALITY   = 0;     // sampling quality (0 low .. 3 ultra) — Low (2×6 taps): perf first, precision not critical
const GLOW_PULSE_MIN = 0.25;  // intensity at the dim point of the prayer pulse
const GLOW_PULSE_MAX = 0.9;   // intensity at the bright point
const GLOW_PULSE_W   = (Math.PI * 2) / 1.6;   // pulse rate (~1.6 s per breath)

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

    @property({ type: ParticleSystem2D, tooltip: 'Prayer bubbles — the authored ParticleSystem2D in the Aku\'s VFX node (emitting upward). Stopped by default; played while praying, stopped otherwise.' })
    prayerBubbles: ParticleSystem2D | null = null;


    @property({ range: [0, 1, 0.01], slide: true, tooltip: 'Squash & stretch intensity on every hop. 0 = rigid, 1 = very rubbery.' })
    squashAmount = 0.35;

    @property({ tooltip: 'Hop height in prefab px (dance & travel arcs).' })
    hopHeight = 46;

    @property({ range: [0.2, 6, 0.1], slide: true, tooltip: 'Hops per second — the dance / travel rhythm.' })
    hopsPerSecond = 2.2;

    @property({ tooltip: 'Travel speed in GROUND units/second when moving A→B.' })
    moveSpeed = 220;

    @property({ type: Enum(StartState), tooltip: 'Auto-play a state on start(), for testing the feel before the spawner exists.' })
    startState = StartState.None;

    @property({ tooltip: 'Debug: draw the physics body as a flat disc on the floor (also shown by the global debug toggle).' })
    showDebug = false;

    /** The Arena container; its world transform maps ground → screen (set by the spawner, same as Stone.arena).
     *  Until assigned, the node keeps its editor placement and only the body animates (handy for previews). */
    arena: Node | null = null;

    /** Background node to drop INTO (as its last child) during the eliminate descent — set by the spawner.
     *  A prefab can't hold a scene-node ref, so this is injected at runtime. Null → it stays in its layer. */
    background: Node | null = null;

    /** Fired when a moving RUNE collides with the physics body (set by the behaviour). Passes the rune node, its
     *  horizontal travel sign (+1 right / −1 left, so the eliminate flies the same way) and the impact SPEED
     *  (physics u/s) so the behaviour can tell a strong hit from a weak one. */
    onImpact: ((other: Node, dirX: number, speed: number) => void) | null = null;
    /** Called once it is fully gone (any death) — the spawner wires this to recycle it. One-shot per life. */
    onGone: (() => void) | null = null;

    private _gx = 0;            // ground-space position (arena-local, de-projected)
    private _gy = 0;
    private _tx = 0;            // move target
    private _ty = 0;
    private _curMoveSpeed = 0;  // effective travel speed for the current move (sized to a hop count by moveTo)
    private _facing = 1;        // +1 facing right, -1 facing left (flips the sprite by the travel direction)
    private _phase = Phase.Idle;
    private _resume = Phase.Idle;   // phase to return to after a Hit
    private _t = 0;                 // hop clock (kept continuous across state changes → no jump)
    private _onArrive: (() => void) | null = null;

    private _claimed = false;       // a RaisingStar has reserved this Aku as its target (no two stars share one)
    private _claimToken = 0;        // bumped on every claim / reset → invalidates a stale star's claim after pooling
    private _zapT = 0;              // electrified-death flicker clock
    private _zapTween: Tween<Node> | null = null;

    // Leap onto a column + perch: the leap arcs the ROOT in world space (frozen), then `_perch` glues the root
    // to the column-top node every frame (lateUpdate), so the Aku rides the column while praying.
    private _perch: Node | null = null;          // column-top node to follow while perched (null = not perched)
    private _perchOffsetY = 0;                   // world-px above the perch node's centre (so the feet sit ON it)
    private readonly _reperch = { extra: 0 };    // transient world-Y offset added while re-aligning to a new top (bounces to 0)
    private _reperchTween: Tween<{ extra: number }> | null = null;
    private _leapT = 0;                          // leap clock
    private _leapDur = COLUMN_LEAP_DUR;
    private _leapArc = 0;                         // apex height of the current leap (world px)
    private readonly _leapStart = new Vec3();     // leap start WORLD pos
    private readonly _leapEnd = new Vec3();       // leap landing WORLD pos (column top)
    private _onLand: (() => void) | null = null;  // fired when the leap lands

    private _frozen = false;        // Eliminated → stop projecting; the ROOT flies the parabola out of the stadium
    private _elimT = 0;             // elapsed flight time
    private _elimDur = 1;           // randomised flight duration
    private readonly _elimStart = new Vec3();    // start WORLD position (contact point)
    private _elimStartSx = 1;       // start world scale (captured abs, so the shrink-to-dot is proportional)
    private _elimStartSy = 1;
    private _elimTargetX = 0;       // end WORLD x (near a screen side edge, in the rune's direction)
    private _elimApexY = 0;         // apex WORLD y (near the screen's top edge)
    private _elimLandY = 0;         // landing WORLD y (lower part of the screen)
    private _elimApexT = 0.35;      // fraction of the flight spent rising to the apex (fast up → long fall)
    private _elimSentBack = false;  // moved into the background once the descent starts

    // Optional Box2D body in the arena's GROUND space (a child of `arena`, like a Stone) so the runes
    // collide with the Aku-aku and shove it around. Created by attachPhysics(), destroyed on reset()/
    // eliminate(). When present it DRIVES the ground position (rune impacts move it). Null = free preview.
    private _body: Node | null = null;
    private _physRadius = 0;
    // Runes currently overlapping the body sensor (kept by begin/end contact). Each frame the Aku-aku takes a
    // hit from the FASTEST one moving above HIT_MIN_SPEED — so a rune set moving by ANOTHER rune (or one already
    // touching that then gets knocked) counts, not just a rune that ENTERED the sensor this frame.
    private readonly _overlap = new Set<Collider2D>();
    private _emergeTween: Tween<Node> | null = null;
    // Emerge hop: while the body breaches, the GROUND position eases down so the Aku LANDS EMERGE_DROP px lower
    // than the hole (a little hop out). No physics body during emerge → lateUpdate doesn't fight the drop.
    private _dropFromGy = 0;
    private _dropToGy = 0;
    private _dropClock = 0;
    private _dropDur = 0;   // > 0 while the emerge drop is animating
    private _dbg: Graphics | null = null;   // debug overlay for the physics body (a flat ground disc)
    private _externallyDriven = false;      // true once a spawner has configure()d this one → start() ignores startState
    private readonly _facingT = { v: 1 };   // animated horizontal flip multiplier (eases through 0 → a rubbery turn-around)
    private _facingTween: Tween<{ v: number }> | null = null;

    // Pose blend: the tick-driven states (idle/dance/move) write a TARGET pose for the inner `body`; on a phase
    // change we capture the current pose and ease from it to the target over POSE_BLEND s → switching states
    // never snaps. (Hit/Emerge drive the body with their own tweens; the blend resumes when they hand back.)
    private readonly _posT = new Vec3();
    private readonly _sclT = new Vec3(1, 1, 1);
    private _angT = 0;
    private readonly _posC = new Vec3();
    private readonly _sclC = new Vec3(1, 1, 1);
    private _angC = 0;
    private _blend = 1;
    private _appliedPhase = Phase.Idle;

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

    // Prayer eyes (the inverse of blink): eyes CLOSED by default, occasionally peeking one (random) or both open.
    private _prayActive = false;    // a peek is currently open
    private _prayT = 0;             // countdown to the next peek
    private _prayElapsed = 0;       // time since the current peek opened
    private readonly _eyeOpen: boolean[] = [];   // per-eye: opened during the current peek (→ shut it again after)

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

    // Prayer inner-glow (same SpriteFlash material, glowColor/glowParams) — pulses purple while praying, off otherwise.
    private readonly _glowColor = new Color(GLOW_COLOR.r, GLOW_COLOR.g, GLOW_COLOR.b, 0);   // .a = intensity × 255
    private readonly _glowParams = new Vec4(0, 0, GLOW_FALLOFF, 0);                          // .xy = uv radius, .z = falloff
    private _glowing = false;   // glow active (pulsing) — true only while praying
    private _glowT = 0;         // pulse clock

    // Live registry (runtime only) — RaisingStar reads it to target / claim the nearest Aku-aku.
    private static _allAku: AkuAku[] = [];
    static get all(): readonly AkuAku[] { return AkuAku._allAku; }

    // Shared death-VFX prefabs, loaded once from resources/ (no per-Aku @property). undefined = not requested,
    // null = loading/failed, Prefab = ready. Returns the prefab if loaded, else kicks off the (async) load.
    private static _fx: Record<string, Prefab | null | undefined> = {};
    private static _fxLoad(path: string): Prefab | null {
        const c = AkuAku._fx[path];
        if (c !== undefined) return c;
        AkuAku._fx[path] = null;
        resources.load(path, Prefab, (err, p) => { if (err) console.warn(`[AkuAku] failed to load VFX prefab "${path}" — is it imported under assets/resources/?`, err); AkuAku._fx[path] = err ? null : p; });
        return null;
    }

    onEnable(): void { if (!EDITOR) AkuAku._allAku.push(this); }
    onDisable(): void { if (EDITOR) return; const i = AkuAku._allAku.indexOf(this); if (i >= 0) AkuAku._allAku.splice(i, 1); }

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
        if (!EDITOR) { AkuAku._fxLoad(FX_EXPLODE); AkuAku._fxLoad(FX_TWINKLE); }   // warm the death-VFX prefabs
    }

    start(): void {
        if (this._externallyDriven) return;   // a spawner owns this one → ignore the editor's test startState
        if (this.startState === StartState.Idle) this.wait();
        else if (this.startState === StartState.Dance) this.dance();
        else if (this.startState === StartState.Pray) this.pray();
    }

    // ── Public API (the spawner / round logic drives these) ─────────────────────────────────────────────

    /** Place this Aku-aku in the arena's GROUND space (same space as the stones) so it projects with the
     *  perspective. Call right after instantiate / pool-get. */
    configure(arena: Node, gx: number, gy: number): void {
        this.arena = arena;
        this._gx = gx; this._gy = gy;
        this._frozen = false;
        this._externallyDriven = true;   // a spawner is driving this one → start() must not apply the test startState
    }

    /** Give the Aku-aku a DYNAMIC Box2D body in the arena's ground space (a child of `arena`, like a Stone),
     *  so the runes collide with it and knock it around. Call after configure(); re-callable (rebuilds the body).
     *  gravityScale 0 (top-down arena) + damping so a shove settles; fixedRotation (the view stays upright).
     *  `radius` omitted/≤0 → the collider matches the SPRITE footprint (half its width), so the physics circle
     *  coincides with what's drawn. */
    attachPhysics(radius?: number, opts?: { density?: number; friction?: number; restitution?: number; linearDamping?: number; angularDamping?: number }): void {
        if (EDITOR) return;
        this._destroyBody();
        const arena = this.arena;
        if (!arena?.isValid) return;
        const r = (radius && radius > 0) ? radius : (this._spriteFootprintRadius() || 30);
        const n = new Node('AkuBody');
        n.layer = arena.layer;
        n.setParent(arena);
        n.setPosition(this._gx, this._gy, 0);
        const rb = n.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Dynamic;
        rb.gravityScale = 0;
        rb.fixedRotation = true;                 // stays upright; the view never reads the body's spin
        rb.enabledContactListener = true;
        rb.linearDamping = opts?.linearDamping ?? 2.5;
        rb.angularDamping = opts?.angularDamping ?? 2;
        const col = n.addComponent(CircleCollider2D);
        col.radius = r;
        col.density = opts?.density ?? 2;       // lighter than a rune (~8) → the runes shove it around easily
        col.friction = opts?.friction ?? 0.4;
        col.restitution = opts?.restitution ?? 0.1;
        // Aku-arena core: the body is a SENSOR → a launched rune PIERCES it (detects the hit, but no collision
        // response, so the rune keeps its speed/trajectory and can plough through several Aku in a row). The
        // contact listener below still fires on overlap, so the hit is registered. (Curling core: solid, shoved.)
        if (GameMode.akuArena) col.sensor = true;
        col.apply();
        col.on(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);   // track overlapping runes (hit decided per-frame)
        col.on(Contact2DType.END_CONTACT, this._onEndContact, this);
        this._body = n;
        this._physRadius = r;
    }

    /** Ground-space radius matching the current variant's sprite footprint: half the sprite width times the
     *  AUTHORED local scale chain root→variant (_baseScale · _bodyScale · variant scale). Depth-independent —
     *  the projection (sizeXFactor) is applied later, so on screen the body disc tracks the sprite width. */
    private _spriteFootprintRadius(): number {
        const v = this.variants[this._active];
        const ut = v?.getComponent(UITransform);
        if (!ut) return 0;
        const sx = this._baseScale.x * this._bodyScale.x * v.scale.x;
        return ut.contentSize.width * 0.5 * Math.abs(sx) * FOOTPRINT_SCALE;
    }

    /** The Aku-aku's physics body node (null until attachPhysics) — e.g. for the spawner's overlap checks. */
    get bodyNode(): Node | null { return this._body; }
    get physRadius(): number { return this._physRadius; }
    /** Ground-space position (arena-local, de-projected). */
    get groundX(): number { return this._gx; }
    get groundY(): number { return this._gy; }
    /** False once dying (cliff dive or electrified) — not targetable / no longer reacts. */
    get alive(): boolean { return this._phase !== Phase.Eliminated && this._phase !== Phase.Zapped; }

    // ── RaisingStar targeting claim: a star reserves the Aku so no two stars target the same one. The token
    //    invalidates a stale claim once the Aku is pooled & reused (reset() bumps it). ──
    get claimable(): boolean { return this.alive && !this._claimed; }
    claim(): number { this._claimed = true; return ++this._claimToken; }
    claimValid(token: number): boolean { return this._claimed && this._claimToken === token && this.alive; }
    releaseClaim(token: number): void { if (this._claimToken === token) this._claimed = false; }

    /** True when the body sits within `pad` (+ its radius) of the arena's rectangular footprint edge — i.e. it
     *  was shoved onto/over the rim. Used by the behaviour to knock it off the cliff. */
    nearEdge(pad = 8): boolean {
        if (!this._body?.isValid) return false;
        const W = physicsWidth(), D = physicsDepth();
        if (W <= 0 || D <= 0) return false;
        const m = this._physRadius + pad;
        const p = this._body.position;
        return Math.abs(p.x) > W / 2 - m || p.y < m || p.y > D - m;
    }

    /** Box2D contact on the body sensor: track which RUNES currently overlap (begin adds, end removes). The hit
     *  is decided per-frame in _checkRuneHits — so a rune set moving by ANOTHER rune (or one already touching
     *  that then gets knocked) still counts, not only a rune that ENTERS the sensor this frame. */
    private _onBeginContact(_self: Collider2D, other: Collider2D): void {
        if (other?.node?.isValid && other.node.getComponent(Stone)) this._overlap.add(other);   // walls/launcher/other Aku ignored
    }
    private _onEndContact(_self: Collider2D, other: Collider2D): void {
        this._overlap.delete(other);
    }

    /** Each frame while alive: take a hit from the FASTEST overlapping rune moving above HIT_MIN_SPEED (a stone
     *  at rest / barely drifting does nothing). Catches the launched rune AND any rune knocked into the Aku-aku
     *  by another rune — however it started moving, and whether or not it entered the sensor this frame. Fires the
     *  onImpact hook with the impact speed (strong vs weak is the behaviour's call); never mutates physics here. */
    private _checkRuneHits(): void {
        if (!this.alive || this._overlap.size === 0 || !this.onImpact) return;
        let best = HIT_MIN_SPEED, node: Node | null = null, dirX = 0;
        for (const col of this._overlap) {
            if (!col?.isValid || !col.node?.isValid) { this._overlap.delete(col); continue; }   // prune destroyed runes
            const rb = col.body;                        // the rune's RigidBody2D (Collider2D.body)
            if (!rb) continue;
            const v = rb.linearVelocity;
            const sp = Math.sqrt(v.x * v.x + v.y * v.y);
            if (sp > best) { best = sp; node = col.node; dirX = v.x >= 0 ? 1 : -1; }
        }
        if (node) this.onImpact?.(node, dirX, best);
    }

    private _destroyBody(): void {
        if (this._body?.isValid) this._body.destroy();
        this._body = null;
        this._overlap.clear();   // drop tracked rune contacts (the sensor is gone)
        if (this._dbg?.isValid) this._dbg.clear();
    }

    /** Pop up out of a hole in the ground: start flattened & sunk, BURST upward (stretch tall), then drop and
     *  bounce to rest — rubbery. Settles to Idle when done; `onDone` lets the spawner kick off the dance. */
    emerge(onDone?: () => void): void {
        this._hitTween?.stop(); this._hitTween = null;
        this._emergeTween?.stop(); this._emergeTween = null;
        this._phase = Phase.Emerge;
        this.node.angle = 0;                             // a fresh upright spawn (clear any leftover tumble angle)
        // Set up the ground drop: land EMERGE_DROP px lower on screen than the hole (converted to a ground delta
        // via the projection). Eased over the emerge in _tickEmergeDrop. (No physics body yet → it isn't fought.)
        this._dropFromGy = this._gy;
        this._dropToGy = unprojectY(projectY(this._gy) - EMERGE_DROP);
        this._dropClock = 0;
        this._dropDur = EMERGE_RISE_T + EMERGE_SET_T;
        this._project();                                 // place the root NOW so frame 1 isn't at the un-projected prefab spot
        const b = this.body;
        this._setEyesClosed(true);                       // eyes shut underground; reopen when it lands
        if (!b) { this._afterEmerge(onDone); return; }
        Tween.stopAllByTarget(b);
        b.setPosition(this._bodyPos.x, this._bodyPos.y - EMERGE_SINK, this._bodyPos.z);
        b.setScale(this._bodyScale.x * EMERGE_FLAT_X, this._bodyScale.y * EMERGE_FLAT_Y, 1);   // squashed SHORT in the hole (only slightly wide)
        const upY = this._bodyPos.y + this.hopHeight * 0.55;
        const stretch = 1 + STRETCH_RATIO * this.squashAmount;
        this._emergeTween = tween(b)
            .to(EMERGE_RISE_T, {                         // burst up + stretch tall
                position: new Vec3(this._bodyPos.x, upY, this._bodyPos.z),
                scale: new Vec3(this._bodyScale.x * (2 - stretch), this._bodyScale.y * stretch, 1),
            }, { easing: 'quadOut' })
            .to(EMERGE_SET_T, {                          // fall back and bounce to the resting pose
                position: this._bodyPos.clone(),
                scale: this._bodyScale.clone(),
            }, { easing: 'bounceOut' })
            .call(() => this._afterEmerge(onDone))
            .start();
    }

    /** Ease the ground position down during the emerge (so the hop LANDS EMERGE_DROP px lower than the hole).
     *  Ease-in (u²) → most of the descent happens late, as the body settles. */
    private _tickEmergeDrop(dt: number): void {
        if (this._dropDur <= 0) return;
        this._dropClock = Math.min(this._dropDur, this._dropClock + dt);
        const u = this._dropClock / this._dropDur;
        this._gy = this._dropFromGy + (this._dropToGy - this._dropFromGy) * (u * u);
    }

    private _afterEmerge(onDone?: () => void): void {
        this._emergeTween = null;
        if (this._dropDur > 0) { this._gy = this._dropToGy; this._dropDur = 0; }   // snap to the landed ground
        if (this.body) {
            this.body.setPosition(this._bodyPos);
            this.body.setScale(this._bodyScale);
            this.body.angle = this._bodyAngle;
        }
        this._phase = Phase.Idle;
        this._initBlink();                               // eyes reopen + blinks rescheduled
        onDone?.();
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
    dance(): void { if (this._phase !== Phase.Dance) this._t = 0; this._enter(Phase.Dance); }   // start the hop from the ground

    /** Pray the wake ritual: the SAME gentle idle sway, but with eyes CLOSED — every so often it peeks, opening
     *  one random eye (or, less often, both) for a beat, then shuts them again. */
    pray(): void { if (this._phase === Phase.Pray) return; this._enter(Phase.Pray); this._initPray(); this._setGlow(true); this._setBubbles(true); }

    /** Hop from here to a ground point; `onArrive` fires once it lands on the target (then it goes Idle). When
     *  `hops` is given the travel is sized to take ~that many hops (regardless of distance). The sprite flips
     *  to face the travel direction (moving left → faces left). */
    moveTo(gx: number, gy: number, onArrive?: () => void, hops?: number): void {
        this._tx = gx; this._ty = gy;
        this._onArrive = onArrive ?? null;
        if (this._phase !== Phase.Move) this._t = 0;   // start the travel hop from the ground
        const dist = Math.hypot(gx - this._gx, gy - this._gy);
        if (hops && hops > 0) {
            this._curMoveSpeed = (dist * this.hopsPerSecond) / (hops * MOVE_DUTY);   // arc-weighting compensated → ~hops hops
        } else {
            this._curMoveSpeed = this.moveSpeed;
        }
        if (Math.abs(gx - this._gx) > 1) this._setFacing(gx >= this._gx ? 1 : -1);   // face where we're heading
        this._enter(Phase.Move);
    }

    /** Leap (world-space ballistic arc) from wherever it is onto `targetWorld` — used to jump onto a column top.
     *  Drops the ground body & freezes the projection (the root flies free); `onLand` fires when it touches down
     *  (typically to perchOn the column). The body keeps its facing and gets a small jump-stretch. */
    leapTo(targetWorld: Vec3, onLand?: () => void): void {
        if (!this.alive) return;
        this._hitTween?.stop(); this._hitTween = null;
        this._emergeTween?.stop(); this._emergeTween = null;
        this._destroyBody();                                   // off the ground → no longer collides
        this._perch = null;
        this._phase = Phase.Leap;
        this.node.getWorldPosition(this._leapStart);
        this._leapEnd.set(targetWorld);
        const dist = Math.hypot(this._leapEnd.x - this._leapStart.x, this._leapEnd.y - this._leapStart.y);
        this._leapArc = Math.max(COLUMN_LEAP_ARC_MIN, dist * COLUMN_LEAP_ARC_K);
        this._leapDur = COLUMN_LEAP_DUR;
        this._leapT = 0;
        this._onLand = onLand ?? null;
        this._frozen = true;
        if (this.shadow) this.shadow.active = false;           // airborne → no ground shadow
        const b = this.body;
        if (b) {                                               // a tall jump-stretch (keep facing)
            Tween.stopAllByTarget(b);
            const st = 1 + STRETCH_RATIO * this.squashAmount;
            b.setPosition(this._bodyPos);
            b.setScale(this._bodyScale.x * (2 - st) * this._facing, this._bodyScale.y * st, 1);
            b.angle = this._bodyAngle;
        }
    }

    /** Glue the root to `target` (the column-top node) every frame, `offsetY` world-px above its centre so the
     *  feet rest ON it. Stops the ground projection; the body keeps animating (idle, then pray) on top. */
    perchOn(target: Node, offsetY: number): void {
        this._perch = target;
        this._perchOffsetY = offsetY;
        this._reperchTween?.stop(); this._reperch.extra = 0;
        this._frozen = true;
        this._phase = Phase.Idle;
        this._initBlink();
    }

    /** Re-align to a NEW top cube after the one below was destroyed: keep following `target` but DROP into place
     *  with a gummy elastic bounce (the column got shorter). Keeps whatever it was doing (idle / praying). */
    reperchTo(target: Node, offsetY: number): void {
        if (!this.alive || !target?.isValid) return;
        const curY = this.node.worldPosition.y;            // where the feet are right now
        this._perch = target;
        this._perchOffsetY = offsetY;
        target.getWorldPosition(_v);
        const startExtra = curY - (_v.y + offsetY);        // current feet height relative to the new top
        this._reperch.extra = startExtra;
        this._reperchTween?.stop();
        this._reperchTween = tween(this._reperch)
            .to(REPERCH_HOP_T, { extra: startExtra + REPERCH_HOP }, { easing: 'quadOut' })   // small hop UP first
            .to(REPERCH_SETTLE_T, { extra: 0 }, { easing: 'elasticOut' })                    // then settle down to the new top
            .start();
    }

    /** True once perched on a column (riding the top cube). */
    get perched(): boolean { return !!this._perch?.isValid; }

    /** True while actually praying (the wake ritual) — used to time the prayer spirit emission. */
    get praying(): boolean { return this._phase === Phase.Pray; }

    /** World position the prayer spirit is born from — the Aku's position raised 40px (≈ its head). */
    headWorld(out: Vec3): Vec3 {
        this.node.getWorldPosition(out);
        out.y += 40;
        return out;
    }

    /** Per-frame during the leap: arc the ROOT in world space from start to the column top, then land. */
    private _tickLeap(dt: number): void {
        this._leapT += dt;
        const t = Math.min(1, this._leapT / this._leapDur);
        const x = this._leapStart.x + (this._leapEnd.x - this._leapStart.x) * t;
        const y = this._leapStart.y + (this._leapEnd.y - this._leapStart.y) * t + Math.sin(Math.PI * t) * this._leapArc;
        this.node.setWorldPosition(x, y, this._leapStart.z);
        if (t >= 1) {
            if (this.body) { this.body.setPosition(this._bodyPos); this.body.setScale(this._bodyScale.x * this._facing, this._bodyScale.y, 1); this.body.angle = this._bodyAngle; }
            this._phase = Phase.Idle;
            const cb = this._onLand; this._onLand = null;
            cb?.();
        }
    }

    /** Struck but NOT eliminated: flash white + a quick pop-and-spin recoil, then resume the prior state.
     *  (Health / how many hits it survives is the caller's concern — call eliminate() on the killing blow.) */
    hit(color?: Color, onDone?: () => void): void {
        if (!this.alive) return;
        this._flash(color ?? HIT_FLASH_COLOR);
        this._setGlow(false); this._setBubbles(false);              // interrupted → drop the prayer aura during the recoil
        if (this._phase !== Phase.Hit) this._resume = this._phase;   // remember where to return
        this._phase = Phase.Hit;
        this._hitTween?.stop();
        const b = this.body;
        if (!b) { if (onDone) onDone(); else this._phase = this._resume; return; }
        const fx = this._facing;                                     // keep the body mirrored (facing) through the recoil
        b.setScale(this._bodyScale.x * fx, this._bodyScale.y, 1);    // start the recoil from the neutral (facing) pose
        b.angle = this._bodyAngle;
        this._applyShadow(0);                                        // recoil pop is small → keep the shadow grounded
        this._setEyesClosed(true);                                   // wince: both eyes shut during the recoil
        this._hitTween = tween(b)
            // squash on impact → spring up & overshoot (elasticOut bounce) = exaggerated, rubbery recoil
            .to(HIT_OUT_T, { position: new Vec3(this._bodyPos.x, this._bodyPos.y + HIT_POP, this._bodyPos.z), scale: new Vec3(this._bodyScale.x * 1.25 * fx, this._bodyScale.y * 0.75, 1), angle: this._bodyAngle + HIT_SPIN }, { easing: 'quadOut' })
            .to(HIT_BACK_T, { position: this._bodyPos.clone(), scale: new Vec3(this._bodyScale.x * fx, this._bodyScale.y, 1), angle: this._bodyAngle }, { easing: 'elasticOut' })
            .call(() => {   // eyes reopen (or resume praying); blinks/peeks rescheduled
                if (onDone) { this._initBlink(); onDone(); }
                else { this._phase = this._resume; if (this._resume === Phase.Pray) { this._initPray(); this._setGlow(true); this._setBubbles(true); } else this._initBlink(); }
            })
            .start();
    }

    /** Eliminated: KICKED OUT OF THE STADIUM. The whole Aku-aku flies a parabola — from the contact point UP to
     *  near the screen's TOP edge, then DOWN into the lower part of the screen (passing BEHIND everything),
     *  in the RUNE's horizontal direction toward that side edge — tumbling + shrinking to a dot, then a twinkle.
     *  `dirX` is the rune's horizontal travel sign (+1 right / −1 left); 0 → random. `onGone` fires at the end. */
    eliminate(dirX = 0): void {
        if (!this.alive) return;
        this._flash(ELIM_FLASH_COLOR, 0.9);                          // red flash as it's knocked off
        this._setGlow(false); this._setBubbles(false);               // drop the prayer aura if it was praying
        this._perch = null;                                          // release the column perch → the parabola flies free
        this._phase = Phase.Eliminated;
        this._claimed = false;
        this._hitTween?.stop(); this._hitTween = null;
        this._emergeTween?.stop(); this._emergeTween = null;
        this._zapTween?.stop(); this._zapTween = null;
        this._destroyBody();                                         // gone from the field → no longer collides
        if (this.body) {                                             // clean ball, but KEEP the facing flip it had when hit
            Tween.stopAllByTarget(this.body);
            this.body.setPosition(this._bodyPos); this.body.setScale(this._bodyScale.x * this._facing, this._bodyScale.y, 1); this.body.angle = this._bodyAngle;
        }
        this._setEyesClosed(true);                                   // knocked out → eyes shut
        if (this.shadow) this.shadow.active = false;                 // off the ground → no shadow

        // Capture the launch state in WORLD space (the root flies free now → stop the perspective projection).
        this.node.getWorldPosition(this._elimStart);
        const ws = this.node.worldScale;
        this._elimStartSx = Math.abs(ws.x) || 1; this._elimStartSy = Math.abs(ws.y) || 1;
        // Screen extent in the Aku's WORLD space = the ARENA's real world bounding box (reliable & in the SAME
        // space as the Aku, regardless of the arena's anchor — worldPosition was NOT a dependable centre). The
        // arena fills the view, so its box ≈ the screen. ELIM_LAND is then a true fraction up that height.
        const ut = this.arena?.getComponent(UITransform);
        let botY: number, topY: number, leftX: number, rightX: number, H: number;
        if (ut) {
            const box = ut.getBoundingBoxToWorld();
            botY = box.y; topY = box.y + box.height; H = box.height;
            leftX = box.x; rightX = box.x + box.width;
        } else {
            const vs = view.getVisibleSize();
            botY = this._elimStart.y - vs.height * 0.5; topY = this._elimStart.y + vs.height * 0.5; H = vs.height;
            leftX = this._elimStart.x - vs.width * 0.5; rightX = this._elimStart.x + vs.width * 0.5;
        }
        const topOver = (ELIM_TOP_OVER_MIN + Math.random() * (ELIM_TOP_OVER_MAX - ELIM_TOP_OVER_MIN)) * H;
        // Apex scales with HOW HIGH it starts: a LOW start jumps all the way up (near/above the top edge); a HIGH
        // start (e.g. perched on a tall column) only does a small hop — the higher the start, the lower the jump.
        const startNorm = Math.max(0, Math.min(1, (this._elimStart.y - botY) / Math.max(1, H)));
        const highApex = topY + topOver;                                                 // target for a LOW start
        const lowApex = this._elimStart.y + ELIM_HIGH_HOP * H;                            // small hop for a HIGH start
        this._elimApexY = highApex + (lowApex - highApex) * startNorm;                   // lerp by start height
        this._elimLandY = botY + (ELIM_LAND_MIN + Math.random() * (ELIM_LAND_MAX - ELIM_LAND_MIN)) * H;   // fraction up the height
        const dir = dirX !== 0 ? (dirX > 0 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);   // same way as the rune
        const horiz = (ELIM_SIDE_FRAC_MIN + Math.random() * (ELIM_SIDE_FRAC_MAX - ELIM_SIDE_FRAC_MIN)) * (rightX - leftX) * 0.5;
        this._elimTargetX = this._elimStart.x + dir * horiz;                             // moderate drift in the rune's direction
        this._elimTargetX = Math.max(leftX + 20, Math.min(rightX - 20, this._elimTargetX));   // keep it on-screen
        this._elimApexT = ELIM_APEXT_MIN + Math.random() * (ELIM_APEXT_MAX - ELIM_APEXT_MIN);
        this._elimDur = ELIM_DUR_MIN + Math.random() * (ELIM_DUR_MAX - ELIM_DUR_MIN);
        this._elimSentBack = false;
        this._elimT = 0;
        this._frozen = true;                                         // lateUpdate stops projecting; _tickEliminate owns the root
    }

    /** Killed by a RaisingStar: LEAP up, pulse white↔cyan like it's electrified, then BURST into sparks and
     *  vanish (recycled via onGone). A different death from eliminate()'s cliff dive. */
    electrifyAndExplode(): void {
        if (!this.alive) return;
        this._setGlow(false); this._setBubbles(false);               // drop the prayer aura if it was praying
        if (this._perch) this._frozen = true;                        // was on a column → freeze in place (don't re-project to the ground)
        this._perch = null;
        this._phase = Phase.Zapped;
        this._claimed = false;                                       // consumed
        this._hitTween?.stop(); this._hitTween = null;
        this._emergeTween?.stop(); this._emergeTween = null;
        this._facingTween?.stop(); this._facingTween = null;
        this._destroyBody();                                         // no longer collides
        this._setEyesClosed(true);                                   // KO eyes
        this._zapT = 0;
        const b = this.body;
        if (!b) { this._explodeAndGone(); return; }
        Tween.stopAllByTarget(b);
        const stretch = 1 + STRETCH_RATIO * this.squashAmount;
        this._zapTween = tween(b)
            .to(0.12, { position: new Vec3(this._bodyPos.x, this._bodyPos.y + ZAP_LEAP, this._bodyPos.z),     // the leap
                        scale: new Vec3(this._bodyScale.x * (2 - stretch), this._bodyScale.y * stretch, 1) }, { easing: 'quadOut' })
            .to(ZAP_TIME - 0.12, { position: new Vec3(this._bodyPos.x, this._bodyPos.y + ZAP_LEAP * 0.7, this._bodyPos.z) }, { easing: 'sineOut' })   // hang while shivering
            .call(() => this._explodeAndGone())
            .start();
    }

    /** Per-frame during the electrified death: fast flash pulse toggling white↔cyan + a random angle shiver. */
    private _tickZap(dt: number): void {
        this._zapT += dt;
        const amt = 0.55 + 0.45 * Math.abs(Math.sin(this._zapT * Math.PI * ZAP_FLASH_HZ));   // fast shimmer
        const white = Math.floor(this._zapT * ZAP_COLOR_HZ) % 2 === 0;
        this._flashColor.r = white ? ZAP_WHITE.r : ZAP_CYAN.r;
        this._flashColor.g = white ? ZAP_WHITE.g : ZAP_CYAN.g;
        this._flashColor.b = white ? ZAP_WHITE.b : ZAP_CYAN.b;
        this._ensureFlashMats();
        this._setFlash(amt);
        if (this.body) this.body.angle = this._bodyAngle + (Math.random() * 2 - 1) * ZAP_SHIVER_DEG;   // electrified shiver
    }

    /** End of the electrified death: spark burst where it stood, clear the flash, then it's gone (recycle). */
    private _explodeAndGone(): void {
        this._zapTween = null;
        this._setFlash(0);
        this._spawnExplosion();
        const cb = this.onGone; this.onGone = null;                  // one-shot; the spawner re-sets it per spawn
        if (cb) cb(); else if (this.node?.isValid) this.node.destroy();
    }

    /** Instantiate the explosion spark burst (a prefab) at this Aku-aku's on-screen position. Parented to the
     *  Aku's PARENT (not the Aku — which is about to be pooled away), additive, self-removing when finished. */
    private _spawnExplosion(): void {
        const prefab = AkuAku._fxLoad(FX_EXPLODE), parent = this.node?.parent;
        if (!prefab || !parent?.isValid) return;
        const n = instantiate(prefab) as unknown as Node;
        n.layer = this.node.layer;
        n.setParent(parent);
        n.setWorldPosition(this.node.worldPosition);
        const ps = n.getComponent(ParticleSystem2D) ?? n.getComponentInChildren(ParticleSystem2D);
        if (ps) {
            ps.autoRemoveOnFinish = true;                // self-destroy when the burst finishes (the Aku is pooled away)
            ps.resetSystem();                            // blend (additive) is authored on the prefab — editor-first
        }
    }

    /** Restore for pooling reuse (call on pool-get, before configure()). Re-rolls the look. */
    reset(): void {
        this.randomVariant();
        this._hitTween?.stop(); this._hitTween = null;
        this._emergeTween?.stop(); this._emergeTween = null;
        this._flashTween?.stop(); this._flashTween = null;
        this._facingTween?.stop(); this._facingTween = null;
        this._zapTween?.stop(); this._zapTween = null;
        this._facing = 1; this._facingT.v = 1;
        this._curMoveSpeed = 0; this._zapT = 0;
        this._claimed = false; this._claimToken++;   // invalidate any star's outstanding claim on the old life
        this._blend = 1; this._appliedPhase = Phase.Idle;
        this._posT.set(this._bodyPos); this._sclT.set(this._bodyScale); this._angT = this._bodyAngle;
        this._destroyBody();
        if (this.body) {
            Tween.stopAllByTarget(this.body);
            this.body.setPosition(this._bodyPos);
            this.body.setScale(this._bodyScale);
            this.body.angle = this._bodyAngle;
        }
        this._phase = Phase.Idle; this._resume = Phase.Idle;
        this._frozen = false; this._t = 0; this._elimT = 0;
        this._elimSentBack = false;
        this._onArrive = null;
        this._perch = null; this._perchOffsetY = 0; this._leapT = 0; this._onLand = null;
        this._reperchTween?.stop(); this._reperch.extra = 0;
        this._dropDur = 0;
        this.node.angle = 0;                  // clear any leftover eliminate tumble (lateUpdate won't reset angle)
        this._setFlash(0);
        this._opacity().opacity = 255;
        if (this.shadow) { this.shadow.active = true; this.shadow.setScale(this._shadowScale); }
        this._setGlow(false); this._setBubbles(false);   // no prayer aura until it prays again
        this._applyShadow(0);
    }

    get phase(): Phase { return this._phase; }

    // ── Per-frame ───────────────────────────────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (EDITOR) return;   // @executeInEditMode is only for the variant preview — never animate in the editor
        this._checkRuneHits();   // any overlapping rune moving fast enough → take a hit (incl. runes knocked by others)
        if (this._phase <= Phase.Move) this._tickBlink(dt);          // blink while alive & grounded (not Hit/Eliminated)
        else if (this._phase === Phase.Pray) this._tickPrayEyes(dt);  // prayer: eyes closed, occasional peeks
        switch (this._phase) {
            case Phase.Idle:       this._tickIdle(dt); break;
            case Phase.Pray:       this._tickPray(dt); this._tickGlow(dt); break;   // idle sway (feet planted) + pulsing purple rim
            case Phase.Dance:      this._tickHop(dt, true); break;
            case Phase.Move:       this._tickMove(dt); break;
            case Phase.Emerge:     this._tickEmergeDrop(dt); break;   // body breach via tween; ground eases down here
            case Phase.Hit:        break;                 // driven by the hit tween
            case Phase.Eliminated: this._tickEliminate(dt); break;
            case Phase.Zapped:     this._tickZap(dt); break;   // electrified flicker (body leap driven by a tween)
            case Phase.Leap:       this._tickLeap(dt); break;  // world-space arc onto a column top
        }
        this._applyBody(dt);
    }

    /** Push the tick-driven body pose, easing across phase changes so the switch never snaps. The ticks set
     *  _posT/_sclT/_angT; on entering a tick-driven phase we capture the current pose and blend to the target
     *  over POSE_BLEND. Hit/Emerge/Eliminated own the body directly → here we only note the phase so the next
     *  tick-driven entry blends FROM wherever their tween left it. */
    private _applyBody(dt: number): void {
        const b = this.body;
        const driven = this._phase === Phase.Idle || this._phase === Phase.Dance || this._phase === Phase.Move || this._phase === Phase.Pray;
        if (!b || !driven) { this._appliedPhase = this._phase; return; }
        if (this._phase !== this._appliedPhase) {       // just switched into a tick-driven state → capture + restart blend
            this._posC.set(b.position); this._sclC.set(Math.abs(b.scale.x), b.scale.y, 1); this._angC = b.angle;   // x = magnitude (facing re-applied below)
            this._blend = 0; this._appliedPhase = this._phase;
        }
        this._blend = Math.min(1, this._blend + dt / POSE_BLEND);
        const f = this._facingT.v;                       // horizontal facing: −1 = mirrored (faces left). Local scale → reliable.
        if (this._blend >= 1) {
            b.setPosition(this._posT); b.setScale(this._sclT.x * f, this._sclT.y, 1); b.angle = this._angT;
        } else {
            const e = this._blend * this._blend * (3 - 2 * this._blend);   // smoothstep
            b.setPosition(this._posC.x + (this._posT.x - this._posC.x) * e, this._posC.y + (this._posT.y - this._posC.y) * e, this._posC.z + (this._posT.z - this._posC.z) * e);
            b.setScale((this._sclC.x + (this._sclT.x - this._sclC.x) * e) * f, this._sclC.y + (this._sclT.y - this._sclC.y) * e, 1);
            b.angle = this._angC + (this._angT - this._angC) * e;
        }
    }

    /** Project the ground position to screen (same maths as Stone.lateUpdate), so the Aku-aku obeys the
     *  perspective. Skipped while frozen (eliminated) or before the arena is wired (keeps editor placement). */
    lateUpdate(): void {
        if (this._perch?.isValid) {                            // perched on a column → ride the top cube, no projection
            this._perch.getWorldPosition(_v);
            this.node.setWorldPosition(_v.x, _v.y + this._perchOffsetY + this._reperch.extra, _v.z);   // +extra = re-align bounce
            return;
        }
        if (this._frozen) return;
        // While DYNAMIC (idle/dance/hit) the physics body drives the ground position → the runes shove it. While
        // MOVING the AI drives it (the body is Kinematic and follows in _tickMove), so don't read it back here.
        if (this._body?.isValid && this._phase !== Phase.Move) { const bp = this._body.position; this._gx = bp.x; this._gy = bp.y; }
        this._project();
        this._drawBodyDebug();
    }

    /** Map the ground position to screen (1-point perspective, same maths as Stone): position + depth scale on
     *  the ROOT. Called every frame by lateUpdate, and once at emerge() so frame 1 isn't at the un-projected
     *  prefab spot (which read as "arriving stretched from the left"). */
    private _project(): void {
        const arena = this.arena;
        if (!arena?.isValid || physicsDepth() <= 0) return;
        _v.set(projectX(this._gx, this._gy), projectY(this._gy), 0);
        Vec3.transformMat4(_v, _v, arena.worldMatrix);
        this.node.setWorldPosition(_v);
        // Shrink uniformly with depth (sizeXFactor on both axes) — upright & proportioned, not floor-foreshortened.
        // (Left/right facing is mirrored on the BODY's local scale, not here — negative WORLD scale is unreliable.)
        const ws = arena.worldScale, s = sizeXFactor(this._gy);
        this.node.setWorldScale(ws.x * this._baseScale.x * s, ws.y * this._baseScale.y * s, 1);
    }

    /** Debug only: draw the physics body as a flat disc on the floor (projected ground circle), shown when
     *  the local `showDebug` or the global DebugDraw toggle is on. A child Graphics of the arena (arena-local
     *  coords), mirroring StoneLauncher's body debug. */
    private _drawBodyDebug(): void {
        const arena = this.arena;
        const on = (this.showDebug || DebugDraw.enabled) && !!this._body?.isValid && !this._frozen;
        if (!on || !arena?.isValid) { if (this._dbg?.isValid) this._dbg.clear(); return; }
        if (!this._dbg?.isValid) {
            const n = new Node('AkuBodyDebug');
            n.layer = arena.layer;
            n.setParent(arena);
            n.setPosition(0, 0, 0);
            this._dbg = n.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(255, 170, 60, 235);
        }
        const cx = projectX(this._gx, this._gy), cy = projectY(this._gy);
        const rx = this._physRadius * sizeXFactor(this._gy), ry = rx * floorTilt(this._gy);   // flat ground disc (model-aware tilt)
        const g = this._dbg;
        g.clear();
        g.ellipse(cx, cy, rx, ry);
        g.moveTo(cx - rx, cy); g.lineTo(cx + rx, cy);
        g.moveTo(cx, cy - ry); g.lineTo(cx, cy + ry);
        g.stroke();
    }

    // ── State ticks ───────────────────────────────────────────────────────────────────────────────────

    private _tickIdle(dt: number): void {
        this._t += dt;
        if (!this.body) return;
        const breath = 1 + Math.sin(this._t * BREATH_W) * BREATH_AMP;
        const sway = Math.sin(this._t * IDLE_SWAY_W) * IDLE_SWAY_DEG;
        this._posT.set(this._bodyPos.x, this._bodyPos.y, this._bodyPos.z);   // feet planted — no bob
        this._sclT.set(this._bodyScale.x / breath, this._bodyScale.y * breath, 1);   // volume-preserved squash → gommoso
        this._angT = this._bodyAngle + sway;
        this._applyShadow(0);   // grounded → full shadow
    }

    /** Prayer: like idle, but the FEET stay planted on the ground — no vertical bob. Only the volume-preserving
     *  breath (anchored at the feet) and a gentle sway, so it reads as kneeling/praying rather than floating. */
    private _tickPray(dt: number): void {
        this._t += dt;
        if (!this.body) return;
        const breath = 1 + Math.sin(this._t * BREATH_W) * PRAY_BREATH_AMP;
        const sway = Math.sin(this._t * IDLE_SWAY_W) * PRAY_SWAY_DEG;
        this._posT.set(this._bodyPos.x, this._bodyPos.y, this._bodyPos.z);   // feet planted — no bob
        this._sclT.set(this._bodyScale.x / breath, this._bodyScale.y * breath, 1);   // breath from the feet up
        this._angT = this._bodyAngle + sway;
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
        this._posT.set(this._bodyPos.x + shiftX, this._bodyPos.y + arc * this.hopHeight, this._bodyPos.z);
        this._sclT.set(this._bodyScale.x * sx, this._bodyScale.y * sy, 1);
        this._angT = this._bodyAngle + tilt;
        this._applyShadow(arc);
    }

    private _tickMove(dt: number): void {
        this._t += dt;
        const dx = this._tx - this._gx, dy = this._ty - this._gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) {                                                   // arrived
            this._gx = this._tx; this._gy = this._ty;
            if (this._body?.isValid) this._body.setPosition(this._gx, this._gy, 0);
            const cb = this._onArrive; this._onArrive = null;
            this._enter(Phase.Idle);                                      // → body back to Dynamic (runes can shove it)
            cb?.();
            return;
        }
        const period = 1 / Math.max(0.0001, this.hopsPerSecond);
        const u = (this._t / period) - Math.floor(this._t / period);
        const arc = Math.sin(Math.PI * u);
        // Advance the ground position mostly while AIRBORNE (weighted by the arc, with a floor so it never
        // fully stalls) → reads as discrete leaps rather than a glide.
        const spd = this._curMoveSpeed > 0 ? this._curMoveSpeed : this.moveSpeed;
        const step = Math.min(dist, spd * dt * (MOVE_FLOOR + (1 - MOVE_FLOOR) * arc));
        this._gx += dx / dist * step;
        this._gy += dy / dist * step;
        if (this._body?.isValid) this._body.setPosition(this._gx, this._gy, 0);   // Kinematic body follows the AI (shoves stones aside)
        if (!this.body) return;
        const contact = Math.pow(Math.abs(Math.cos(Math.PI * u)), CONTACT_SHARP);
        const sq = this.squashAmount;
        const sy = 1 + STRETCH_RATIO * sq * arc - sq * contact;
        const sx = 1 - (sy - 1);
        const lean = (dx >= 0 ? 1 : -1) * MOVE_LEAN_DEG * arc;            // lean toward travel direction
        this._posT.set(this._bodyPos.x, this._bodyPos.y + arc * this.hopHeight, this._bodyPos.z);
        this._sclT.set(this._bodyScale.x * sx, this._bodyScale.y * sy, 1);
        this._angT = this._bodyAngle + lean;
        this._applyShadow(arc);
    }

    /** The "kicked out of the stadium" flight: a parabola on the ROOT (world space) toward a background corner,
     *  shrinking to a dot while tumbling + wobbling. At the end a twinkle winks where it vanishes, then gone. */
    private _tickEliminate(dt: number): void {
        this._elimT += dt;
        const t = Math.min(1, this._elimT / this._elimDur);
        const x = this._elimStart.x + (this._elimTargetX - this._elimStart.x) * t;      // horizontal drift to the side edge
        // Vertical = a fast jump UP to the apex near the top edge (ease-out over the first _elimApexT), then an
        // accelerating fall DOWN to the landing in the lower part of the screen.
        const tA = this._elimApexT;
        let y: number;
        if (t < tA) { const u = t / tA; y = this._elimStart.y + (this._elimApexY - this._elimStart.y) * (1 - (1 - u) * (1 - u)); }   // ease-out up
        else {
            const u = (t - tA) / (1 - tA);
            y = this._elimApexY + (this._elimLandY - this._elimApexY) * (u * u);        // ease-in down
            if (!this._elimSentBack) this._sendToBackground();                          // descending → move behind everything
        }
        this.node.setWorldPosition(x, y, 0);
        const k = 1 - t * t;                                                            // stays big most of the flight, then collapses late
        const sc = ELIM_END_SCALE + (1 - ELIM_END_SCALE) * k;                           // proportional down to nothing
        this.node.setWorldScale(this._elimStartSx * sc, this._elimStartSy * sc, 1);
        const fade = t < 1 - ELIM_FADE ? 1 : Math.max(0, (1 - t) / ELIM_FADE);          // fade out over the last ELIM_FADE of the flight
        this._opacity().opacity = Math.round(255 * fade);
        if (t >= 1) { this._spawnTwinkle(x, y); this._finishEliminate(); }
    }

    /** During the descent, move the Aku-aku INTO the background node as its LAST child (keeping the world
     *  transform) — so it falls within the background layer, on top of the bg art but behind the gameplay.
     *  setParent appends as the last child by default. No-op if no background was injected by the spawner. */
    private _sendToBackground(): void {
        this._elimSentBack = true;
        const bg = this.background;
        if (!bg?.isValid) { console.warn('[AkuAku] background not assigned (set it on the AkuAkuSpawner) — the eliminated Aku falls in FRONT instead of behind everything'); return; }
        if (this.node.parent !== bg) this.node.setParent(bg, true);   // keep world transform
        this.node.setSiblingIndex(bg.children.length - 1);            // ALWAYS the last child
    }

    /** A small one-shot glow (FX_TWINKLE, from resources) that pops then fades where the eliminate flight ends —
     *  "a star winking out". Attached INSIDE the background as its LAST child (same place as the fallen Aku). */
    private _spawnTwinkle(worldX: number, worldY: number): void {
        const prefab = AkuAku._fxLoad(FX_TWINKLE);
        const parent = (this.background?.isValid ? this.background : this.node?.parent);   // inside the background
        if (!prefab || !parent?.isValid) return;
        const n = instantiate(prefab) as unknown as Node;
        n.layer = this.node.layer;
        n.setParent(parent);
        n.setSiblingIndex(parent.children.length - 1);   // ALWAYS the last child
        n.setWorldPosition(worldX, worldY, 0);   // blend (additive) is authored on the prefab — editor-first
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;
        n.setScale(0.2, 0.2, 1);
        const peak = 0.4 + Math.random() * 0.3;
        tween(n).to(0.12, { scale: new Vec3(peak, peak, 1) }, { easing: 'quadOut' })
            .to(0.28, { scale: new Vec3(0.02, 0.02, 1) }, { easing: 'quadIn' }).start();
        tween(op).to(0.1, { opacity: 255 }).to(0.3, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (n.isValid) n.destroy(); }).start();
    }

    private _finishEliminate(): void {
        const cb = this.onGone; this.onGone = null;
        cb?.();   // spawner recycles to the NodePool here (cliff dive finished)
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

    private _enter(p: Phase): void {
        if (this._phase === p) return;
        if (this._phase === Phase.Hit) { this._hitTween?.stop(); this._hitTween = null; }
        const wasPray = this._phase === Phase.Pray;
        this._phase = p;
        if (wasPray) { this._setGlow(false); this._setBubbles(false); if (p <= Phase.Move) this._initBlink(); }   // leaving prayer → glow + bubbles off, eyes reopen
        // Kinematic while travelling (the AI drives it, it shoves stones aside); Dynamic otherwise (the runes
        // shove the Aku-aku). Hit/Emerge keep whatever they had — they set _phase directly, not via _enter.
        this._setBodyType(p === Phase.Move ? ERigidBody2DType.Kinematic : ERigidBody2DType.Dynamic);
    }

    /** Switch the body between Kinematic (AI-driven travel) and Dynamic (shoved by the runes), zeroing velocity. */
    private _setBodyType(t: ERigidBody2DType): void {
        const rb = this._body?.getComponent(RigidBody2D);
        if (!rb || rb.type === t) return;
        rb.type = t;
        rb.linearVelocity = new Vec2(0, 0);
        rb.angularVelocity = 0;
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

    /** (Re)initialise prayer eyes: shut every eye and schedule the first peek. The eyes ARE the children of the
     *  active variant (derived, never wired by property — same as blink). */
    private _initPray(): void {
        const host = this._eyeHost;
        const n = host?.isValid ? host.children.length : 0;
        this._eyeOpen.length = n;
        for (let i = 0; i < n; i++) { this._eyeOpen[i] = false; if (host!.children[i]?.isValid) host!.children[i].active = true; }   // closed
        this._prayActive = false;
        this._prayElapsed = 0;
        this._prayT = PRAY_PEEK_MIN + Math.random() * (PRAY_PEEK_MAX - PRAY_PEEK_MIN);
    }

    /** Prayer eyes — the INVERSE of blink: eyes stay CLOSED; when the timer fires, open ONE random eye (or, less
     *  often, BOTH) for PRAY_PEEK_DUR, then shut again and reschedule. */
    private _tickPrayEyes(dt: number): void {
        const host = this._eyeHost;
        if (!host?.isValid) return;
        const ch = host.children;
        if (this._prayActive) {
            this._prayElapsed += dt;
            if (this._prayElapsed >= PRAY_PEEK_DUR) {                          // peek over → shut the opened eye(s)
                for (let i = 0; i < ch.length && i < this._eyeOpen.length; i++) {
                    if (this._eyeOpen[i] && ch[i]?.isValid) ch[i].active = true;
                    this._eyeOpen[i] = false;
                }
                this._prayActive = false;
                this._prayT = PRAY_PEEK_MIN + Math.random() * (PRAY_PEEK_MAX - PRAY_PEEK_MIN);
            }
            return;
        }
        this._prayT -= dt;
        if (this._prayT <= 0) {                                                // open a peek
            this._prayActive = true;
            this._prayElapsed = 0;
            const both = ch.length >= 2 && Math.random() < PRAY_BOTH;
            const pick = ch.length ? Math.floor(Math.random() * ch.length) : -1;
            for (let i = 0; i < ch.length && i < this._eyeOpen.length; i++) {
                const open = both || i === pick;
                this._eyeOpen[i] = open;
                if (open && ch[i]?.isValid) ch[i].active = false;             // open = hide the closed-eye sprite
            }
        }
    }

    /** Flip the sprite to face `dir` (+1 right, −1 left) with a quick rubbery turn-around: the flip multiplier
     *  eases THROUGH 0, so the silhouette squashes thin then springs back out facing the other way. */
    private _setFacing(dir: number): void {
        if (dir === this._facing) return;
        this._facing = dir;
        this._facingTween?.stop();
        this._facingTween = tween(this._facingT)
            .to(0.16, { v: dir }, { easing: 'backOut' })   // overshoot on exit = bouncy turn
            .start();
    }

    /** Gather the flash material instance from the shown variant's sprite (once per variant). */
    private _ensureFlashMats(): void {
        if (this._flashGathered) return;
        this._flashGathered = true;
        const host = this.variants[this._active] ?? this.node;   // only the shown variant flashes...
        const m = host.getComponent(Sprite)?.getMaterialInstance(0);   // ...its OWN sprite, not the eye children
        if (m) this._flashMats.push(m);
    }

    /** Wash the sprite toward `color` (SpriteFlash material's `flashColor` vec4: .rgb colour, .a amount), peaking
     *  at `peak`. No-op if the material isn't on the sprite — a plain tint/additive can't whiten on any background. */
    private _flash(color: Color, peak = 0.7): void {
        this._ensureFlashMats();
        if (!this._flashMats.length) return;
        this._flashColor.r = color.r; this._flashColor.g = color.g; this._flashColor.b = color.b;
        this._flashTween?.stop();
        this._flashT.v = 0;
        const apply = (): void => this._setFlash(this._flashT.v);
        this._flashTween = tween(this._flashT)
            .to(0.05, { v: peak }, { easing: 'quadOut', onUpdate: apply })
            .to(0.28, { v: 0 }, { easing: 'quadIn', onUpdate: apply })
            .call(() => this._setFlash(0))
            .start();
    }

    private _setFlash(v: number): void {
        if (!this._flashMats.length) return;
        this._flashColor.a = Math.round(Math.max(0, Math.min(1, v)) * 255);
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('flashColor', this._flashColor);
    }

    /** Toggle the prayer inner-glow on the shown variant's sprite (SpriteFlash material's glowColor/glowParams).
     *  While on it PULSES purple via _tickGlow; off zeroes it. No-op if the material/texture isn't there. */
    private _setGlow(on: boolean): void {
        this._glowing = on;
        this._ensureFlashMats();
        if (!this._flashMats.length) return;
        if (on) {
            this._glowParams.set(GLOW_REACH, GLOW_REACH, GLOW_FALLOFF, GLOW_QUALITY);   // UV fraction → no texture-size read
            this._glowT = 0;
            this._glowColor.set(GLOW_COLOR.r, GLOW_COLOR.g, GLOW_COLOR.b, Math.round(GLOW_PULSE_MIN * 255));   // start at the dim point
            for (let i = 0; i < this._flashMats.length; i++) { this._flashMats[i].setProperty('glowParams', this._glowParams); this._flashMats[i].setProperty('glowColor', this._glowColor); }
        } else {
            this._glowColor.a = 0;
            for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('glowColor', this._glowColor);
        }
    }

    /** Pulse the purple prayer rim: breathe glowColor.a between GLOW_PULSE_MIN..MAX (called each frame while praying). */
    private _tickGlow(dt: number): void {
        if (!this._glowing || !this._flashMats.length) return;
        this._glowT += dt;
        const k = GLOW_PULSE_MIN + (GLOW_PULSE_MAX - GLOW_PULSE_MIN) * (0.5 - 0.5 * Math.cos(this._glowT * GLOW_PULSE_W));
        this._glowColor.a = Math.round(k * 255);
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('glowColor', this._glowColor);
    }

    /** Play / stop the prayer bubble particles (the authored ParticleSystem2D in the Aku's VFX node, wired via
     *  `prayerBubbles`). On → ensure active + restart emission; off → stop emitting (existing bubbles float out
     *  and die). No-op if none is wired. */
    private _setBubbles(on: boolean): void {
        const ps = this.prayerBubbles;
        if (!ps?.isValid) return;
        if (on) { if (!ps.node.active) ps.node.active = true; ps.resetSystem(); }
        else ps.stopSystem();
    }

    onDestroy(): void {
        this._hitTween?.stop(); this._hitTween = null;
        this._emergeTween?.stop(); this._emergeTween = null;
        this._flashTween?.stop(); this._flashTween = null;
        this._facingTween?.stop(); this._facingTween = null;
        this._zapTween?.stop(); this._zapTween = null;
        this._reperchTween?.stop(); this._reperchTween = null;
        this._destroyBody();
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
        if (this.body) Tween.stopAllByTarget(this.body);
        Tween.stopAllByTarget(this._flashT);
        Tween.stopAllByTarget(this._facingT);
    }
}
