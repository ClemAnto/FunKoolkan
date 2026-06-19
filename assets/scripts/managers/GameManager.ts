import { _decorator, Component, PhysicsSystem2D, EPhysics2DDrawFlags, Vec2, Vec3, tween, Tween, Node, Label, Graphics, Color, UITransform, UIOpacity, Widget, director, sys, view, ResolutionPolicy, Sprite, ProgressBar, Prefab, instantiate, gfx } from 'cc';
import { Warrior } from '../entities/Warrior';
import { WARRIORS, LEVEL_CONFIG, spawnTypesForRound } from '../data/WarriorConfig';
import { WarriorSpriteCache } from '../utils/WarriorSpriteCache';
import { SafeStorage } from '../utils/SafeStorage';
import { InputController } from './InputController';
import { SpawnManager } from './SpawnManager';
import { OnboardingHints } from './OnboardingHints';
import { GameState } from './GameState';
import { GAME_OVER_LINE_Y, TRACK_W, TRACK_H, TRACK_BOTTOM_Y, LAYOUT_SCALE, WALL_LB, WALL_LT, WALL_RB, WALL_RT, initLayout, Track, setGameOverLineRaisePx, funnelWidthRatioAt } from '../entities/Track';
import { DebugPanel, IGameManagerDebug } from './DebugPanel';
import { CoordConverter } from '../utils/CoordConverter';
import { AudioManager, SFX } from './AudioManager';
import { VFXManager, SCORE_TIER5_PTS, SCORE_TIER6_PTS } from './VFXManager';
import { AuraEffect } from '../entities/AuraEffect';
import { PsychoForceEffect } from '../entities/PsychoForceEffect';
import { WildRiverEffect } from '../entities/WildRiverEffect';
import { WildRiverSparkleEffect } from '../entities/WildRiverSparkleEffect';
import { BrotherhoodEffect } from '../entities/BrotherhoodEffect';
import { BrotherhoodSparkleEffect } from '../entities/BrotherhoodSparkleEffect';
import { TrailEffect } from '../entities/TrailEffect';
import { LineDescentEffect } from '../entities/LineDescentEffect';
import { Settings } from './Settings';
import { EndPanel } from './EndPanel';
import { PausePanel } from './PausePanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { LeaderboardProvider } from '../services/LeaderboardProvider';
import { ENABLED as LEADERBOARD_CONFIG_ENABLED, TOP_N } from '../config/LeaderboardConfig';
import { PortalProvider } from '../services/PortalProvider';
import { PORTAL, LEADERBOARD_ALLOWED } from '../config/PortalConfig';
const { ccclass, property } = _decorator;

/** Effective online-leaderboard switch: configured ON *and* allowed on this portal build
 *  (off on GameDistribution per §7). Gates end-game routing + name-entry prep. */
const LEADERBOARD_ENABLED = LEADERBOARD_CONFIG_ENABLED && LEADERBOARD_ALLOWED;

export const VERSION     = '0.1.0';
/** Dedicated leaderboard scene; the game-over flow hands the score off to it. */
const RANKING_SCENE      = 'Ranking';
/** Main menu scene — target of the Menu buttons on the pause/end panels. */
const MAIN_MENU_SCENE    = 'MainMenu';
/** Delay before the game-over / victory panel fades in, so the end moment (shake/cascade) plays first. */
const END_PANEL_DELAY    = 1.0;
const DEBUG              = false;
const DEBUG_ENGINE       = false;
const SHOW_ENDLINE_DEBUG = false;  // set true to draw the purple dashed game-over threshold line (debug)
const LIVE_RESIZE        = true;   // real-time relayout on browser resize — kept on in production too (negligible cost, fires only on resize)
const TEST_FIRST_LAUNCH_GAMEOVER = false; // TEST: first launch forces game-over @15k to exercise the leaderboard flow
// Continuous forces are applied once per render frame, but Box2D steps at a fixed rate, so on a
// 144/165 Hz monitor the same force accumulates ~2.4× per physics step. Multiply every per-frame
// force by (dt × this) so the integrated force matches 60 fps regardless of refresh rate.
const FORCE_FPS_REF = 60;
// Resize: debounce delay after the last resize signal + hard cap so physics never stays frozen.
const RESIZE_SETTLE_S = 0.5;
const RESIZE_MAX_S    = 2.5;
const MAGNET_GAP_BASE    = 30;  // surface-to-surface px at design width — scaled by LAYOUT_SCALE
const MAGNET_FORCE_BASE  = 40;  // base force at design width — scaled by LAYOUT_SCALE
const UPWARD_DRIFT_BASE  = 0;   // slight upward push on settled warriors — keeps pile away from game over line
const WARRIOR_LINEAR_DAMPING   = 1.5; // linearDamping on active warriors — controls sliding speed decay
const WARRIOR_SETTLED_DAMPING  = 12;  // linearDamping applied when warrior stops — lower = easier to displace
const WARRIOR_VIEW_Y_OFFSET = 1.5; // viewNode lift above physics center, in units of radius
const SETTLE_VELOCITY      = 0.4;   // Box2D velocity units — warrior is "stopped" below this
const LAUNCH_CHECK_DELAY   = 0.8;   // seconds before checking if launched warrior failed to cross
const FAILED_LAUNCH_MALUS  = 50;    // score penalty when launched warrior fails to cross the line
const CROSS_LINE_FRAMES    = 3;     // consecutive frames above gol before crossedLine is committed (prevents grazing false-positive)
const GAME_OVER_FRAMES     = 3;     // consecutive frames below gol before game over triggers (prevents physics-jitter false-positive)
const GAME_OVER_DESCENT_RADII = 6;  // how far below the line (in warrior radii) the physics centre must sink before game over — the visual base passes the line only after a large physics descent (perspective compresses Y by 4×). Tune for "base fully past the line".

const WRS_PROX_INTERVAL      = 0.08; // seconds between WRS proximity spread checks
const AURA_REPEL_RANGE       = 160;  // design-px — max distance at which repelling force is applied
const AURA_REPEL_FORCE       = 500;  // base force magnitude (design-px units, scaled by LAYOUT_SCALE)
const AURA_ZAPP_HOLD         = 0.2;  // seconds a warrior must stay in range before being zapped
const AURA_ZAP_MIN_TYPE      = 2;    // species below this index only repel — no zap/auto-merge
const WRS_PROX_MARGIN        = 60;   // extra design-px beyond touching radius to count as "near"
const WRS_CONTACT_DELAY      = 0.15; // seconds of sustained proximity before WRS spreads
const PF_PROX_INTERVAL       = 0.08;
const PF_PROX_MARGIN         = 60;
const PF_CONTACT_DELAY       = 0.15;
const BROTHERHOOD_PROX_MARGIN   = 20;   // extra px beyond touch radius to trigger cascade
const BROTHERHOOD_CASCADE_DELAY = 0.3;  // seconds between each infection step (nearest → farthest)
const BROTHERHOOD_IMPLODE_HOLD  = 0.5;  // seconds from infection to implosion
const BROTHERHOOD_EXPIRE_SEC    = 2.0;  // max carrier duration before effect expires
const BROTHERHOOD_PROX_INTERVAL = 0.06; // seconds between proximity checks
const VORTEX_RANGE_BASE      = 70;   // design px per level (level 1 = 70, level 5 = 350)
const VORTEX_FORCE_BASE      = 220;  // force units per level
const VORTEX_TTL_BASE        = 0.5;  // base vortex duration in seconds
const VORTEX_TTL_LEVEL       = 0.15; // extra seconds per level
const LAUNCH_TIMER       = 15;     // seconds per turn, round 1

// ── Dynamic game-over line ──
// The editor GameOverLine quota is the END-GAME (lowest) position. The line starts the
// game raised by GO_LINE_RAISE_FRAC × TRACK_H (early tension: smaller safe zone) and
// steps down once per species unlock (rounds 3/5/7/9) — relief exactly when the merge
// combinatorics get harder. Min-force is NOT a constraint: a launch that fails to cross
// the raised line goes through the regular failed-launch malus path.
const GO_LINE_RAISE_FRAC  = 0.13; // game-start raise, fraction of TRACK_H — tune in playtest
const GO_LINE_DESCENT_DUR = 1.4;  // s, fits inside the round-up banner physics freeze (2.16s)
const NEW_BEST_MIN_SCORE = 10000;  // min score for the "new best" message to appear

// Cumulative totalMerges to reach each round (index = round - 1, so [1] = 10 means 10 merges → round 2)
const ROUND_THRESHOLDS = [0, 20, 40, 60, 80, 100, 120] as const;

// ── Resumable game state (localStorage snapshot) ──
// Saved at the start of every turn (settled board + launcher ready) so a runtime error can be
// recovered by reloading the scene and rebuilding the exact turn-start situation.
const STATE_KEY = 'fw_game_state';

type PowerupKind = 'aura' | 'psychoForce' | 'wildRiver' | 'brotherhood';

interface WarriorSnap {
    type: number;
    level: number;
    x: number;
    y: number;
    pu?: PowerupKind;   // residual powerup carried by an on-track warrior (only aura persists)
}

interface GameSnapshot {
    version: string;
    score: number;
    round: number;
    totalMerges: number;
    cooldowns: { wr: number; pf: number; br: number; brMerges: number };
    firstLaunchSpecies: number[];
    trackClearedBonusUsed: boolean;
    bestSingle: { score: number; desc: string };
    spawnLog: [number, [number, number][]][];
    launcher: { type: number; level: number; powerup: PowerupKind | null };
    nextPowerup: PowerupKind | null;
    next: { type: number; level: number };
    warriors: WarriorSnap[];
}

function launchTimerForRound(round: number): number {
    if (round <= 1) return 15;
    if (round <= 3) return 12;
    if (round <= 5) return 10;
    if (round <= 7) return 8;
    if (round <= 10) return 5;
    return 3;
}

function spawnMaxLevelForRound(round: number): number {
    if (round <= 1) return 1;   // onboarding: round 1 launches only level-1 warriors
    if (round <= 5) return 2;   // level 2 unlocked from round 2 (was round 3) for more early variety
    return 3;
}


@ccclass('GameManager')
export class GameManager extends Component implements IGameManagerDebug {
    @property(Prefab) psychoSparklePrefab: Prefab | null = null;
    @property({ type: PausePanel, tooltip: 'Pause modal (UILayer/Modals/PausePanel). Auto-resolved by name if unset.' })
    pausePanel: PausePanel | null = null;
    @property({ type: EndPanel, tooltip: 'Game-over modal (UILayer/Modals/GameOverPanel). Auto-resolved by name if unset.' })
    gameOverPanel: EndPanel | null = null;
    @property({ type: EndPanel, tooltip: 'Victory modal (UILayer/Modals/VictoryPanel). Auto-resolved by name if unset.' })
    victoryPanel: EndPanel | null = null;
    @property({ type: OnboardingHints, tooltip: 'In-gameplay onboarding hints (optional). Drives editor-authored hint nodes.' })
    onboarding: OnboardingHints | null = null;
    private inputCtrl!: InputController;
    private spawnMgr!: SpawnManager;
    private warriors: Warrior[] = [];
    private framesAboveLine = new Map<Warrior, number>();
    private framesBelowLine = new Map<Warrior, number>();
    private state = GameState.Idle;
    private inflightWarrior: Warrior | null = null;
    private debugLabel: Label | null = null;
    private debugOverlay: Graphics | null = null;

    private worldNode!: Node;
    private vfxLayer!: Node;
    private box2dLayer!: Node;
    private warriorsLayer!: Node;
    private uiLayer!: Node;
    private coords!: CoordConverter;

    // game state
    private score = 0;
    private bestScore = 0;
    private _newBest = false;   // true when this game's score beat the previous stored best
    private _lbReady: Promise<void> | null = null;  // leaderboard prep started at end-game, awaited by Continue
    private currentRound = 1;
    private totalMerges = 0;
    private mergesThisLaunch = 0;
    private roundUpPause = false;
    private timerRemaining = LAUNCH_TIMER;
    private timerPaused = false;
    private waitForSettling = false;
    private sceneName = '';
    private track: Track | null = null;
    private implosionCenter: Vec2 | null = null;
    private implosionTimeLeft: number = 0;
    private implosionDuration: number = 0;
    private implosionPeakForce: number = 0;
    private cohesionTimeLeft: number = 0;
    private _resizeObserver: ResizeObserver | null = null;
    private _obsW = -1;
    private _obsH = -1;
    // Resize: the layers re-centre via their HCENTER Widgets, BUT dynamic Box2D bodies live in the
    // fixed b2World and do NOT follow the Widget layout — so on a resize we freeze physics, capture each
    // warrior's funnel-relative LOCAL position (box2dLayer space, stable across scale/centre), then
    // re-apply it on settle to re-pin the bodies to the re-centred funnel. No manual layer recentre.
    private _resizeFrozen = false;
    private _roundUpPauseBeforeResize = false;
    private _inputBlockedBeforeResize = false;
    private _lastSettledW = -1;
    private _lastSettledH = -1;
    private _warriorFreezePos: { w: Warrior; x: number; y: number }[] | null = null;
    private _lastTickSec = -1;
    private _dangerCooldown = 0;
    private _slowmoTimer    = 0;
    private _slowmoScale    = 1.0;
    private _trailEffect: TrailEffect | null = null;
    private _proximityTimers = new Map<string, number>();
    private _auraWarrior:    Warrior | null = null;
    private _auraEffect:     AuraEffect | null = null;
    private _auraProxTimers   = new Map<Warrior, number>();
    private _zapTargetEnergy  = new Map<Warrior, { energy: number; count: number }>();
    private _zapTimerFrozen   = false;
    private static _zapSparkGlobalIdx = 0;
    private _launcherWildRiverEffect: WildRiverEffect | null = null;
    private _wrsActive = new Map<Warrior, WildRiverSparkleEffect>();
    private _wrsProxTimer = 0;
    private _wrsProxTimers = new Map<Warrior, number>(); // candidate → accumulated proximity time
    private _wrLaunchWarrior: Warrior | null = null;
    private _wrLaunchEffect: WildRiverSparkleEffect | null = null;
    private _wrsOrder: Warrior[] = [];
    private _pfActive       = new Map<Warrior, Sprite | null>();
    private _pfOrder:         Warrior[] = [];
    private _pfProxTimer    = 0;
    private _pfProxTimers   = new Map<Warrior, number>();
    private _pfImploding    = false;
    private _pfImplodeK     = 1;
    private _pfLaunchWarrior: Warrior | null = null;
    private _pfCooldownLaunches = 0;
    psychoForceEnabled      = false;
    private _wrsImploding = false;
    private _wrsImplodeK = 1;
    wildRiverEnabled = false;
    private _wrCooldownLaunches = 0;
    private _brCooldownLaunches = 0;
    private _brCooldownMerges = 0;
    private _nextPowerup: 'aura' | 'psychoForce' | 'wildRiver' | 'brotherhood' | null = null;
    private _nextPowerupPending = false;
    private _brotherhoodCarrier:   Warrior | null = null;
    private _brotherhoodEffect:    BrotherhoodEffect | null = null;
    private _brotherhoodTriggered  = false;
    private _brotherhoodProxTimer  = 0;
    private _brTimerStarted     = false;
    private _activeVortices: { x: number; y: number; range: number; force: number; ttl: number }[] = [];
    private _firstLaunchSpecies   = new Set<number>(); // species launched for the first time this game
    private _didFirstLaunchRefresh = false; // one-shot track-geometry refresh on the very first launch
    private _trackClearedBonusUsed = false;
    private _bestSingleScore = 0;
    private _bestSingleScoreDesc = '';
    private _spawnLog: Map<number, Map<number, number>> = new Map();

    get bestSingleScore(): number { return this._bestSingleScore; }
    get bestSingleScoreDesc(): string { return this._bestSingleScoreDesc; }
    private vfx!: VFXManager;
    // Set just before a scene reload triggered by the "RIPRISTINA" button — the fresh GameManager
    // detects it in start() and rebuilds the board from the saved snapshot instead of a new game.
    private static _pendingRestore = false;
    private _errorPanel: Node | null = null;
    private _endlineDebugNode: Node | null = null;
    private _errorDialogShown = false;
    private _errorSuppressed = false;   // brief window after CONTINUA where the dialog won't re-pop
    private _lastErrorText = '';
    private _stateBeforePause: GameState | null = null;
    private _autoPaused = false;
    private _settings: Settings | null = null;
    private _endlineNode: Node | null = null;  // scene GameOverLine node (under TrackSprite) — immutable anchor, sprite muted
    private _goLineVis: Node | null = null;    // runtime visual line, the one the player sees (moves/narrows with the raise)
    private _goLineRaisePx = 0;                // current logic raise above the editor quota, canvas px
    private get gameOverLineLocal(): number {
        const sy = this.box2dLayer?.scale.y ?? 1;
        // Derive the physics-Y threshold from the GameOverLine node's *visual* position, inverting
        // the same perspective mapping used to render warriors. This makes the threshold land on the
        // red art line (not above it) and self-corrects for layout/resize timing. Computed live each
        // call — during gameplay all world positions are final. The dynamic raise is added on top:
        // the editor node never moves, it remains the authoritative end-game (lowest) quota.
        if (this._endlineNode?.isValid && this.warriorsLayer?.isValid && this.coords) {
            const visualY = this._endlineNode.worldPosition.y - this.warriorsLayer.worldPosition.y + this._goLineRaisePx;
            return this.coords.visualToPhys(visualY);
        }
        return sy > 0 ? GAME_OVER_LINE_Y / sy : GAME_OVER_LINE_Y; // global already includes the raise
    }

    /** Raise fraction for a round: full at game start, stepping to 0 (editor quota) as species unlock. */
    private _goLineFracForRound(round: number): number {
        const extras   = WARRIORS.filter(w => w.introRound > 1);
        const unlocked = extras.filter(w => w.introRound <= round).length;
        return extras.length > 0 ? GO_LINE_RAISE_FRAC * (1 - unlocked / extras.length) : 0;
    }

    /** Build the runtime visual line and mute the editor sprite (the editor node stays as position anchor —
     *  documented exception to the "never move editor nodes" rule: we never move IT, only our copy). */
    private _wireGoLineVisual(): void {
        const anchor = this._endlineNode;
        if (!anchor?.isValid || !anchor.parent) return;
        const srcSp = anchor.getComponent(Sprite);
        if (srcSp) srcSp.enabled = false;
        const vis = new Node('GameOverLineDyn');
        vis.layer = anchor.layer;
        vis.setParent(anchor.parent);
        vis.setSiblingIndex(anchor.getSiblingIndex() + 1);
        const srcUit = anchor.getComponent(UITransform);
        const uit = vis.addComponent(UITransform);
        if (srcUit) {
            uit.setContentSize(srcUit.contentSize);
            uit.setAnchorPoint(srcUit.anchorPoint);
        }
        const sp = vis.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        if (srcSp) {
            sp.spriteFrame = srcSp.spriteFrame;
            sp.color       = srcSp.color.clone();
        }
        vis.setPosition(anchor.position);
        vis.setScale(anchor.scale);
        this._goLineVis = vis;
    }

    private _goLineSyncRound    = 1;
    private _goLineSyncElapsed  = 0;
    private _goLineLastAnchorY: number | null = null;

    /** Run the line sync only once the layout is STABLE: the anchor's world position must be
     *  unchanged for two consecutive frames. Covers the post-start() Canvas/Widget layout pass
     *  (setDesignResolutionSize runs AFTER start — see CoordConverter) and live browser resizes
     *  still in progress. Safety cap 2s, then sync anyway. Re-entrant: restarts the sampling. */
    private _syncGoLineWhenStable(round: number): void {
        this._goLineSyncRound   = round;
        this._goLineSyncElapsed = 0;
        this._goLineLastAnchorY = null;
        this.unschedule(this._goLineStableTick);
        this.schedule(this._goLineStableTick, 0);
    }

    private readonly _goLineStableTick = (dt: number): void => {
        this._goLineSyncElapsed += dt;
        const anchor = this._endlineNode;
        if (!anchor?.isValid) { this.unschedule(this._goLineStableTick); return; }
        const y = anchor.worldPosition.y;
        const stable = this._goLineLastAnchorY !== null && Math.abs(y - this._goLineLastAnchorY) < 0.25;
        this._goLineLastAnchorY = y;
        if (stable || this._goLineSyncElapsed > 2) {
            this.unschedule(this._goLineStableTick);
            this._syncGoLineToRound(this._goLineSyncRound, false);
        }
    };

    /** Apply the line raise for `round`. Animated descents run inside the round-up physics freeze;
     *  the LOGIC threshold snaps to the target immediately — a lower line is strictly more
     *  permissive, so logic ahead of visual can never hurt the player. */
    private _syncGoLineToRound(round: number, animate: boolean): void {
        const raisePx = this._goLineFracForRound(round) * TRACK_H;
        const prevPx  = this._goLineRaisePx;
        this._goLineRaisePx = raisePx;
        setGameOverLineRaisePx(raisePx);
        // A raise INCREASE (new game, debug round-down) can strand warriors below the new line:
        // their below-line counters are stale by definition — reset them.
        if (raisePx > prevPx) this.framesBelowLine.clear();

        const anchor = this._endlineNode;
        const vis    = this._goLineVis;
        if (!anchor?.isValid || !vis?.isValid || !anchor.parent?.isValid) return;
        Tween.stopAllByTarget(vis);
        // Convert "anchor raised by raisePx in world/canvas units" into parent-local space via the
        // real transform — manual scale arithmetic gets sign/factor wrong (TrackSprite's transform
        // chain is not trivial; see the ×2 in Track.buildWalls).
        const parentUit = anchor.parent.getComponent(UITransform);
        let targetY = anchor.position.y + raisePx / (anchor.parent.worldScale.y || 1);
        if (parentUit) {
            const raisedWorld = anchor.worldPosition.clone();
            raisedWorld.y += raisePx;
            targetY = parentUit.convertToNodeSpaceAR(raisedWorld).y;
        }
        const targetScaleX = anchor.scale.x * funnelWidthRatioAt(raisePx);
        if (animate && Math.abs(targetY - vis.position.y) > 0.5) {
            const fromY = vis.position.y;
            tween(vis)
                .to(GO_LINE_DESCENT_DUR,
                    { position: new Vec3(vis.position.x, targetY, 0), scale: new Vec3(targetScaleX, anchor.scale.y, 1) },
                    { easing: 'sineInOut' })
                .start();
            LineDescentEffect.play(vis, this.vfx.sparkleFrame, fromY, targetY, GO_LINE_DESCENT_DUR);
        } else {
            vis.setPosition(vis.position.x, targetY);
            vis.setScale(targetScaleX, anchor.scale.y, 1);
        }
    }

    private syncInputBounds(): void {
        this.inputCtrl.setTrackBounds(WALL_LB, WALL_LT, WALL_RB, WALL_RT);
    }

    /** Re-run the full layout: rebuild Box2D walls + refresh exported geometry and input bounds. */
    private _refreshTrackGeometry(): void {
        this.track?.relayout();
        this.inputCtrl?.relayout(LAYOUT_SCALE);
        this.syncInputBounds();
    }

    /**
     * TEST_FIRST_LAUNCH_GAMEOVER: force a game-over with a score guaranteed to qualify —
     * the current last (lowest) leaderboard entry + 1000. Falls back to 15000 on error.
     */
    private async _testForceGameOver(): Promise<void> {
        let target = 15000;
        try {
            const svc = LeaderboardProvider.get();
            await svc.init();
            const top = await svc.getTop(TOP_N);
            if (top.length > 0) target = top[top.length - 1].score + 1000;
        } catch { /* keep fallback */ }
        console.log(`[GameManager] TEST_FIRST_LAUNCH_GAMEOVER → forcing game-over @${target}`);
        this.score = target;
        this.updateScoreLabel();
        this.triggerGameOver();
    }

    private readonly _onVisibilityChange = (): void => {
        if (document.hidden) this._autoPause();
        else this._autoResume();
    };

    private readonly _onWindowBlur  = (): void => this._autoPause();
    private readonly _onWindowFocus = (): void => this._autoResume();

    private readonly _onGlobalError = (ev: ErrorEvent): void => {
        if (!ev.error) return; // ignore resource-load errors (no Error object attached)
        // Only surface errors thrown by OUR game bundle. 3rd-party/CDN scripts (e.g. the
        // Firebase leaderboard) live on a different file and must not pop the gameplay dialog.
        const file = ev.filename ?? '';
        const fromGame = file === '' || /index\.js|application\.js|\/assets\/|chunks/i.test(file);
        if (!fromGame) { console.warn('[GameManager] ignoring non-game error from', file, ev.error); return; }
        console.error('[GameManager] global error captured:', ev.error);
        this._handleRuntimeError('window.error', ev.error);
    };
    private readonly _onUnhandledRejection = (ev: PromiseRejectionEvent): void => {
        // Promise rejections are almost always async SDK/network noise (e.g. the leaderboard
        // Firestore calls). Log them but NEVER interrupt gameplay with the error dialog.
        console.warn('[GameManager] unhandled promise rejection (ignored for dialog):', ev.reason);
    };

    // resize / ResizeObserver: size-guarded (ignore spurious same-size fires).
    private readonly onBrowserResize = (): void => this._handleResize(false);
    // fullscreenchange: ALWAYS handle (a toggle is real even if innerWidth happens to match).
    private readonly onFullscreenChange = (): void => this._handleResize(true);

    private _handleResize(force: boolean): void {
        if (!sys.isBrowser) return;
        const w = window.innerWidth, h = window.innerHeight;
        // Ignore spurious resize/observer fires at a size we've already settled at.
        if (!force && !this._resizeFrozen && w === this._lastSettledW && h === this._lastSettledH) return;
        // Re-arm the one-shot geometry refresh: the responsive TrackSprite re-settles AFTER a fullscreen
        // toggle / resize (just like after start()), and the debounced _doUnfreeze refresh can run before
        // that settles. Re-arming makes the NEXT launch redo an authoritative _refreshTrackGeometry once
        // everything is final — so the Box2D world is always rebuilt after returning from fullscreen.
        this._didFirstLaunchRefresh = false;
        // Freeze physics + input and snapshot funnel-relative LOCAL positions NOW (before the layout
        // changes); re-apply on settle (DEBOUNCED, with a hard cap) to re-pin the b2World bodies to the
        // re-centred funnel. The layers themselves re-centre via their HCENTER Widgets — no manual snap.
        if (!this._resizeFrozen) this._beginResizeFreeze();
        this.unschedule(this._doUnfreeze);
        this.scheduleOnce(this._doUnfreeze, RESIZE_SETTLE_S);
        this._resizeLog(`signal${force ? '(fs)' : ''}  inner=${w}x${h}`);
    }

    private _beginResizeFreeze(): void {
        this._resizeFrozen = true;
        this._roundUpPauseBeforeResize = this.roundUpPause;
        this._inputBlockedBeforeResize = this.inputCtrl?.blocked ?? false;
        this.roundUpPause = true;                       // guards every physics op in update()
        PhysicsSystem2D.instance.enable = false;
        if (this.inputCtrl) this.inputCtrl.blocked = true;
        // Snapshot each warrior's box2dLayer-LOCAL position (stable funnel-relative frame). Skip if a
        // snapshot is already pending (e.g. a 2nd resize during the same paused dialog) — the warriors are
        // already displaced by then, so we must preserve the FIRST, still-correct capture.
        if (!this._warriorFreezePos) {
            const snap: { w: Warrior; x: number; y: number }[] = [];
            const cap = (w: Warrior | null): void => { if (w?.node?.isValid) snap.push({ w, x: w.node.position.x, y: w.node.position.y }); };
            for (const w of this.warriors) cap(w);
            if (this._activeLauncherWarrior && !this.warriors.includes(this._activeLauncherWarrior)) cap(this._activeLauncherWarrior);
            this._warriorFreezePos = snap;
        }
        this.scheduleOnce(this._doUnfreezeCap, RESIZE_MAX_S);  // hard safety cap — never stay frozen
        this._resizeLog('FREEZE begin');
    }

    private readonly _doUnfreezeCap = (): void => { this._resizeLog('unfreeze (CAP hit)'); this._doUnfreeze(); };

    private readonly _doUnfreeze = (): void => {
        if (!this._resizeFrozen) return;
        this.unschedule(this._doUnfreeze);
        this.unschedule(this._doUnfreezeCap);
        // Restore by GAME STATE (a stale snapshot once left input dead): input is blocked only where the
        // game itself blocks it; physics runs unless paused / mid round-up / auto-paused.
        this.roundUpPause = this._roundUpPauseBeforeResize;
        const blocked = this.state === GameState.GameOver || this.state === GameState.Paused;
        PhysicsSystem2D.instance.enable = !this.roundUpPause && this.state !== GameState.Paused && !this._autoPaused;
        if (this.inputCtrl) this.inputCtrl.blocked = blocked;
        this._resizeFrozen = false;
        this._lastSettledW = window.innerWidth; this._lastSettledH = window.innerHeight;
        // Re-pin bodies ONLY with physics ENABLED (re-pinning while OFF is futile — the node→b2Body sync runs
        // inside the step). We do NOT rebuild walls here: the static wall colliders already follow the Track's
        // Widget re-centre via the scene→physics sync, and DESTROYING/recreating colliders (_refreshTrack-
        // Geometry) in the same frame we move many bodies frees broadphase proxies that FindNewContacts then
        // walks → crash (b2BroadPhase.UpdatePairs / b2TreeNode.get). Geometry (TRACK_W) is rebuilt safely at
        // the NEXT launch via the re-armed _didFirstLaunchRefresh one-shot (clean frame, no mass body move).
        // If still paused (resize fired from inside the Settings modal) we DEFER the re-pin to the resume
        // hook (_exitSettingsPause), keeping the snapshot.
        if (PhysicsSystem2D.instance.enable) {
            this._restoreWarriorLocalPos();
            this._warriorFreezePos = null;
        }
        this._resizeLog(`UNFREEZE done  blocked=${blocked} state=${this.state} TRACK_W=${TRACK_W}`);
    };

    /** Re-apply the box2dLayer-LOCAL positions captured at freeze start (stable funnel-relative frame). */
    private _restoreWarriorLocalPos(): void {
        if (!this._warriorFreezePos) return;
        for (const { w, x, y } of this._warriorFreezePos) {
            if (!w?.node?.isValid) continue;
            if (w === this._activeLauncherWarrior) { w.node.setPosition(x, y, 0); continue; }
            w.setDragMode(true);
            w.node.setPosition(x, y, 0);
            w.setDragMode(false);
        }
    }

    /** Resize diagnostics → console only (the on-screen overlay was temporary instrumentation). */
    private _resizeLog(msg: string): void {
        if (DEBUG) console.log('[Resize]', msg);
    }

    // hud refs
    private scoreLabel: Label | null = null;
    private roundLabel: Label | null = null;
    private _debugPanelNode: Node | null = null;
    private _lastRoundTapAt = 0;
    private roundProgressBar: ProgressBar | null = null;
    private nextPreviewNode: Node | null = null;
    private nextNextWarriorNode: Node | null = null;
    private _nextPreviewGlowNode: Node | null = null;

    private nextLaunchWarrior: Warrior | null = null;
    private _activeLauncherWarrior: Warrior | null = null;
    private timerLabel: Label | null = null;
    private _scoreProxy = { val: 0 };
    private _scoreTween: Tween<{ val: number }> | null = null;

    start() {
        this._spawnLog.clear();
        AudioManager.instance; // trigger singleton init + asset preload as early as possible
        AudioManager.instance.playMusic(); // entering the Game scene: interrupt the menu loop now → main.mp3
        AudioManager.instance.ensureMusic(); // fallback: play on first gesture if browser blocked autoplay
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);
        initLayout();
        this.sceneName = director.getScene()?.name || 'Game';
        Warrior.linearDamping   = WARRIOR_LINEAR_DAMPING;
        Warrior.settledDamping  = WARRIOR_SETTLED_DAMPING;
        Warrior.viewYOffset = WARRIOR_VIEW_Y_OFFSET;
        PhysicsSystem2D.instance.enable = true;
        PhysicsSystem2D.instance.gravity = new Vec2(0, 0);
        PhysicsSystem2D.instance.debugDrawFlags = DEBUG_ENGINE
            ? EPhysics2DDrawFlags.Shape
            : EPhysics2DDrawFlags.None;

        const canvas = this.node.parent!;

        // World — single parent for all in-game nodes; apply transforms here to affect everything
        this.worldNode = canvas.getChildByName('World')
            ?? (() => { const n = new Node('World'); n.setParent(canvas); return n; })();
        this.vfxLayer = this.worldNode.getChildByName('VFXLayer')
            ?? (() => { const n = new Node('VFXLayer'); n.setParent(this.worldNode); return n; })();

        this.box2dLayer = this.worldNode.getChildByName('Box2DLayer')
            ?? (() => { console.warn('[GameManager] Box2DLayer not found in scene — created fresh (scaleY will be 1, not 0.5!)'); const n = new Node('Box2DLayer'); n.setParent(this.worldNode); return n; })();
        // Canvas repositions to designHeight/2 in world space after Widget layout, which runs after
        // start() — cannot read box2dLayer.worldPosition.y here; derive from design resolution instead.
        this.coords = new CoordConverter(this.box2dLayer.scale.y, view.getDesignResolutionSize().height / 2);

        if (DEBUG_ENGINE) {
            const overlayNode = new Node('DebugOverlay');
            overlayNode.setParent(this.box2dLayer);
            this.debugOverlay = overlayNode.addComponent(Graphics);
        }

        this.warriorsLayer = this.worldNode.getChildByName('WarriorsLayer')
            ?? (() => { console.warn('[GameManager] WarriorsLayer not found in scene — created fresh'); const n = new Node('WarriorsLayer'); n.setParent(this.worldNode); return n; })();

        this.uiLayer = canvas.getChildByName('UILayer')
            ?? (() => {
                const n = new Node('UILayer');
                n.setParent(canvas);
                n.addComponent(UITransform);
                const uiw = n.addComponent(Widget);
                uiw.isAlignLeft = uiw.isAlignRight = uiw.isAlignTop = uiw.isAlignBottom = true;
                uiw.left = uiw.right = uiw.top = uiw.bottom = 0;
                return n;
            })();
        // Ensure uiLayer renders on top of all game-world nodes
        this.uiLayer.setSiblingIndex(canvas.children.length - 1);

        this.vfx = new VFXManager(this.vfxLayer, this.uiLayer, this.worldNode, this.warriorsLayer);
        this.vfx.preloadSparkle();

        // Track.start() ran before this (higher in hierarchy) with wrong viewport — rebuild walls now
        this.track = this.worldNode.getChildByName('Track')?.getComponent(Track) ?? null;
        if (this.track) this.track.showDebugLine = DEBUG_ENGINE;
        this.track?.relayout();
        this.nextPreviewNode = this.track?.node.getChildByName('NextPreview') ?? null;
        this._endlineNode = this.track?.node.getChildByName('TrackSprite')?.getChildByName('GameOverLine') ?? null;
        this._wireGoLineVisual();
        this._syncGoLineWhenStable(this.currentRound);

        this.inputCtrl = this.node.addComponent(InputController);
        this.inputCtrl.ropeParent = this.worldNode;
        this.inputCtrl.onLaunch     = (w, forcePct) => this.onWarriorLaunched(w, forcePct);
        this.inputCtrl.onTap        = (w) => this.cycleLauncherLevel(w);
        this.inputCtrl.onAimStart   = () => { this.onboarding?.hideAimHint(); this.onboarding?.maybeShowMergeHint(); };
        this.inputCtrl.getWarriors  = () => this.warriors;
        this.inputCtrl.showBounds   = DEBUG_ENGINE;
        this.nextPreviewNode?.on(Node.EventType.TOUCH_END, () => this.swapNextWithLauncher(), this);
        this.inputCtrl.initialScale = LAYOUT_SCALE;
        this.syncInputBounds();

        this.spawnMgr = this.node.addComponent(SpawnManager);
        this.spawnMgr.init(this.box2dLayer, this.warriorsLayer, spawnTypesForRound(1), this.box2dLayer.scale.y);
        this.spawnMgr.onMergeReady    = (a, b) => this.mergeWarriors(a, b);
        this.spawnMgr.onNextGenerated = ()      => this.animateNextTransition();
        this.spawnMgr.getWarriors     = ()      => this.warriors;

        const loadingSpinner = this._showLoadingSpinner();

        WarriorSpriteCache.preload(() => {
            if (loadingSpinner.isValid) loadingSpinner.destroy();
            this.initHud();
            this._wireOnboardingReplayTap();
            this._wirePanels();
            this.debugLabel = DEBUG ? this.createDebugLabel() : null;
            this.bestScore = parseInt(SafeStorage.get('fw_best_score') ?? '0', 10) || 0;

            const restoring = GameManager._pendingRestore;
            GameManager._pendingRestore = false;
            if (!(restoring && this._restoreSnapshot())) {
                // Fresh game: clear any leftover snapshot, then start normally.
                this._clearSnapshot();
                const prefilled = this.spawnMgr.prefill();
                prefilled.forEach(w => this._recordSpawn(w.type, this.currentRound));
                this.warriors.push(...prefilled);
                const firstWarrior = this.createWarrior();
                this.activateWarrior(firstWarrior);
                this.onboarding?.maybeShowAimHint();  // first-turn "drag & release" gesture hint
            }

            if (DEBUG) this._debugPanelNode = this._spawnDebugPanel();
            if (LIVE_RESIZE && sys.isBrowser) {
                window.addEventListener('resize', this.onBrowserResize);
                // fullscreenchange fires BEFORE the canvas resizes (good early trigger on enter/exit);
                // a ResizeObserver on the canvas is the robust catch-all for size changes the events miss.
                document.addEventListener('fullscreenchange', this.onFullscreenChange);
                document.addEventListener('webkitfullscreenchange', this.onFullscreenChange as EventListener);
                if (typeof ResizeObserver !== 'undefined') {
                    const cv = (document.getElementById('GameCanvas') ?? document.querySelector('canvas')) as HTMLElement | null;
                    if (cv) {
                        this._resizeObserver = new ResizeObserver((entries) => {
                            const r = entries[0]?.contentRect; if (!r) return;
                            const w = Math.round(r.width), h = Math.round(r.height);
                            if (this._obsW < 0) { this._obsW = w; this._obsH = h; return; } // prime baseline, no trigger
                            if (w === this._obsW && h === this._obsH) return;
                            this._obsW = w; this._obsH = h;
                            this.onBrowserResize();
                        });
                        this._resizeObserver.observe(cv);
                    }
                }
            }
            if (sys.isBrowser) {
                document.addEventListener('visibilitychange', this._onVisibilityChange);
                window.addEventListener('blur',  this._onWindowBlur);
                window.addEventListener('focus', this._onWindowFocus);
                window.addEventListener('error', this._onGlobalError);
                window.addEventListener('unhandledrejection', this._onUnhandledRejection);
            }

            // Portal SDK: active play starts here (init is idempotent — covers the
            // dev-preview case where the Game scene loads without passing by MainMenu)
            const portal = PortalProvider.get();
            void portal.init().then(async () => {
                portal.gameLoadingFinished();
                // GameDistribution §2.1.1 mandates a PREROLL ad before gameplay begins.
                // PLAY enters the Game scene directly, so onLoad is the "after Play click"
                // moment. Gated to GD only — CrazyGames/Poki forbid an ad before the first
                // gameplay, so their flow is unchanged. Mute only while the ad actually plays.
                if (PORTAL === 'gamedistribution') {
                    await portal.commercialBreak(() => AudioManager.instance.muteForPause());
                    AudioManager.instance.unmuteForPause();
                }
                portal.gameplayStart();
            });
        });
    }

    onDestroy() {
        director.getScheduler().setTimeScale(1.0);
        if (LIVE_RESIZE && sys.isBrowser) {
            window.removeEventListener('resize', this.onBrowserResize);
            document.removeEventListener('fullscreenchange', this.onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange as EventListener);
            this._resizeObserver?.disconnect();
            this._resizeObserver = null;
        }
        if (sys.isBrowser) {
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            window.removeEventListener('blur',  this._onWindowBlur);
            window.removeEventListener('focus', this._onWindowFocus);
            window.removeEventListener('error', this._onGlobalError);
            window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
        }
    }

    private _autoPause(): void {
        if (this.state === GameState.GameOver || this.state === GameState.Paused || this.state === GameState.Idle) return;
        this._autoPaused = true;
        this._enterPause();
    }

    private _autoResume(): void {
        if (!this._autoPaused) return;
        this._autoPaused = false;
        if (this.state === GameState.Paused) this._resumeFromPause();
    }

    // ── IGameManagerDebug ──

    isTimerPaused(): boolean { return this.timerPaused; }

    setTimerPaused(v: boolean): void {
        this.timerPaused = v;
        this.inputCtrl.launchEnabled = !v;
        // Sospendi/ripristina merge logic su tutti i warrior in pista
        for (const w of this.warriors) {
            if (!w.crossedLine || !w.node?.isValid) continue;
            w.onMergeReady = v ? null : (a, b) => this.mergeWarriors(a, b);
        }
    }

    pauseGrabWarrior(w: Warrior): void { w.setDragMode(true); }
    pauseDropWarrior(w: Warrior): void { w.setDragMode(false); }

    getCurrentRound(): number { return this.currentRound; }

    setDebugRound(r: number): void {
        this.currentRound = Math.max(1, r);
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this._syncGoLineToRound(this.currentRound, false);
        this.updateRoundLabel();
    }

    getTotalMerges(): number { return this.totalMerges; }

    setTotalMerges(n: number): void {
        this.totalMerges = Math.max(0, n);
        this.updateRoundProgress();
    }

    getWarriors(): readonly Warrior[] { return this.warriors; }

    addDebugWarrior(type: number, level: number, x: number, y: number): Warrior {
        const w = Warrior.spawn(this.box2dLayer, this.warriorsLayer, type, level, x, y);
        w.crossedLine = true;
        w.fired = true;
        w.settle();
        w.onMergeReady = this.timerPaused ? null : (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(w);
        return w;
    }

    cycleDebugWarriorLevel(w: Warrior): void {
        if (!w.node?.isValid) return;
        const pos      = w.node.position.clone();
        const type     = w.type;
        const maxLevel = WARRIORS[type]?.maxLevel ?? 7;
        const newLevel = w.level < maxLevel ? w.level + 1 : 1;
        this.warriors  = this.warriors.filter(x => x !== w);
        this.framesAboveLine.delete(w);
        this.framesBelowLine.delete(w);
        w.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, type, newLevel, pos.x, pos.y);
        nw.crossedLine  = true;
        nw.fired        = true;
        nw.settle();
        nw.onMergeReady = this.timerPaused ? null : (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(nw);
    }

    saveDebugState(): void {
        const state = {
            warriors: this.warriors
                .filter(w => w.crossedLine && w.node?.isValid)
                .map(w => ({ type: w.type, level: w.level, x: w.node.position.x, y: w.node.position.y })),
            round: this.currentRound,
            totalMerges: this.totalMerges,
        };
        SafeStorage.set('fw_debug_state', JSON.stringify(state));
    }

    loadDebugState(): void {
        const raw = SafeStorage.get('fw_debug_state');
        if (!raw) { console.warn('[GameManager] debug: no saved state'); return; }
        const state = JSON.parse(raw) as { warriors: { type: number; level: number; x: number; y: number }[]; round: number; totalMerges: number };

        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
        });

        for (const s of state.warriors) this.addDebugWarrior(s.type, s.level, s.x, s.y);

        this.currentRound = Math.max(1, state.round);
        this.totalMerges  = Math.max(0, state.totalMerges);
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this._syncGoLineToRound(this.currentRound, false);
        this.updateRoundLabel();
        this.updateRoundProgress();
    }

    resetDebugState(): void {
        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
        });
        // this.warriors.push(...this.spawnMgr.prefill());

        this._expireBrotherhood();
        this._brCooldownLaunches = 0;
        this._brCooldownMerges   = 0;
        this._wrCooldownLaunches = 0;
        this._pfCooldownLaunches = 0;
        this.currentRound     = 1;
        this.totalMerges      = 0;
        this.mergesThisLaunch = 0;
        this.score            = 0;
        this._bestSingleScore = 0;
        this._bestSingleScoreDesc = '';
        this._spawnLog.clear();
        this._trackClearedBonusUsed = false;
        this._scoreTween?.stop();
        this._scoreTween = null;
        this._scoreProxy.val  = 0;
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(1));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(1));
        this.timerRemaining = launchTimerForRound(1);
        this._syncGoLineToRound(1, false);
        this.updateRoundLabel();
        this.updateRoundProgress();
        this.updateScoreLabel();
    }

    setLauncherBlocked(v: boolean): void {
        this.inputCtrl.blocked = v;
    }

    debugWin(): void { this.triggerVictory(); }

    debugLose(): void { this.triggerGameOver(); }

    toggleWildRiver(): void {
        this.wildRiverEnabled = !this.wildRiverEnabled;
        if (this._activeLauncherWarrior) {
            this._launcherWildRiverEffect?.detach();
            this._launcherWildRiverEffect = null;
            if (this.wildRiverEnabled) {
                this._launcherWildRiverEffect = WildRiverEffect.attach(
                    this._activeLauncherWarrior, this.vfx.sparkleFrame, this.vfx.auraFrame);
            }
        }
        this._updateNextPreviewPowerupGlow();
    }

    isWildRiverAvailable(): boolean {
        return this.warriors.filter(w => w.crossedLine && w.node?.isValid).length > 30;
    }
    isWildRiverEnabled(): boolean { return this.wildRiverEnabled; }

    activateAura(): void {
        const w = this._activeLauncherWarrior;
        if (!w?.node?.isValid) return;
        // Disattiva qualsiasi altro powerup attivo sul launcher
        if (this.wildRiverEnabled) {
            this._launcherWildRiverEffect?.detach();
            this._launcherWildRiverEffect = null;
            this.wildRiverEnabled = false;
        }
        if (this.psychoForceEnabled || w.psychoForce) {
            w.psychoForce?.detach();
            w.psychoForce = null;
            this.psychoForceEnabled = false;
        }
        if (this._brotherhoodCarrier === w) this._expireBrotherhood();
        this._auraEffect?.detach();
        this._auraEffect = AuraEffect.attach(w, this.vfx.auraFrame, this.vfx.sparkleFrame, this._auraRangeForType(w.type) * LAYOUT_SCALE);
        this._auraEffect.onExpired = () => { this._auraEffect?.detach(); this._restoreAuraScales(); this._auraWarrior = null; this._auraEffect = null; this._auraProxTimers.clear(); };
        this._auraWarrior = w;
    }

    activatePsychoForce(): void {
        if (this.psychoForceEnabled) return;
        const w = this._activeLauncherWarrior;
        if (!w?.node?.isValid) return;
        this.psychoForceEnabled = true;
        if (!w.psychoForce) {
            const pfe = PsychoForceEffect.attach(w, this.vfx.auraFrame, true);
            w.psychoForce = pfe;
        }
    }

    activateBrotherhood(): void {
        const w = this._activeLauncherWarrior;
        if (!w?.node?.isValid) return;
        this._expireBrotherhood();
        const ge = BrotherhoodEffect.attach(w, this.vfx.sparkleFrame, this.vfx.auraFrame);
        ge.onExpired = () => this._expireBrotherhood();
        w.onBrotherhoodContact = (s, t) => this._onBrotherhoodContact(s, t);
        this._brotherhoodCarrier   = w;
        this._brotherhoodEffect    = ge;
        this._brotherhoodTriggered = false;
        this._brotherhoodProxTimer = 0;
        this._brTimerStarted    = false;
        if (DEBUG) console.log('[Brotherhood] effect activated on launcher');
    }

    private _applyPendingPowerup(w: Warrior, powerup: 'aura' | 'psychoForce' | 'wildRiver' | 'brotherhood'): void {
        this._launcherWildRiverEffect?.detach();
        this._launcherWildRiverEffect = null;
        this.wildRiverEnabled = false;
        if (w.psychoForce) { w.psychoForce.detach(); w.psychoForce = null; }
        this.psychoForceEnabled = false;
        if (this._auraWarrior === w) {
            this._restoreAuraScales();
            this._auraEffect?.detach();
            this._auraEffect = null;
            this._auraWarrior = null;
            this._auraProxTimers.clear();
        }
        if (this._brotherhoodCarrier === w) this._expireBrotherhood();
        if (powerup === 'aura') {
            this._auraEffect = AuraEffect.attach(w, this.vfx.auraFrame, this.vfx.sparkleFrame, this._auraRangeForType(w.type) * LAYOUT_SCALE);
            this._auraEffect.onExpired = () => { this._auraEffect?.detach(); this._restoreAuraScales(); this._auraWarrior = null; this._auraEffect = null; this._auraProxTimers.clear(); };
            this._auraWarrior = w;
        } else if (powerup === 'psychoForce') {
            this.psychoForceEnabled = true;
            w.psychoForce = PsychoForceEffect.attach(w, this.vfx.auraFrame, true);
        } else if (powerup === 'wildRiver') {
            this.wildRiverEnabled = true;
            this._launcherWildRiverEffect = WildRiverEffect.attach(w, this.vfx.sparkleFrame, this.vfx.auraFrame);
        } else {
            const ge = BrotherhoodEffect.attach(w, this.vfx.sparkleFrame, this.vfx.auraFrame);
            ge.onExpired = () => this._expireBrotherhood();
            w.onBrotherhoodContact = (s, t) => this._onBrotherhoodContact(s, t);
            this._brotherhoodCarrier   = w;
            this._brotherhoodEffect    = ge;
            this._brotherhoodTriggered = false;
            this._brotherhoodProxTimer = 0;
            this._brTimerStarted    = false;
        }
    }

    // --- brotherhood powerup ---

    private _onBrotherhoodContact(source: Warrior, target: Warrior): void {
        if (this._brotherhoodTriggered) return;
        if (!source.node?.isValid || !target.node?.isValid) return;
        this._triggerBrotherhoodCascade(target.type);
    }

    private _expireBrotherhood(): void {
        if (this._brotherhoodCarrier) this._brotherhoodCarrier.onBrotherhoodContact = null;
        this._brotherhoodEffect?.detach();
        this._brotherhoodEffect    = null;
        this._brotherhoodCarrier   = null;
        this._brotherhoodTriggered = false;
        this._brotherhoodProxTimer = 0;
        this._brTimerStarted    = false;
        this._updateNextPreviewPowerupGlow();
    }

    private _tickBrotherhoodProximity(): void {
        const carrier = this._brotherhoodCarrier!;
        if (!carrier.node?.isValid) { this._expireBrotherhood(); return; }
        const cp = carrier.node.position;
        for (const w of this.warriors) {
            if (w === carrier || !w.node?.isValid || !w.crossedLine) continue;
            const wp = w.node.position;
            const dx = cp.x - wp.x, dy = cp.y - wp.y;
            const threshold = carrier.radius + w.radius + BROTHERHOOD_PROX_MARGIN * LAYOUT_SCALE;
            if (dx * dx + dy * dy <= threshold * threshold) {
                this._triggerBrotherhoodCascade(w.type);
                return;
            }
        }
    }

    private _triggerBrotherhoodCascade(targetType: number): void {
        if (this._brotherhoodTriggered) return;
        this._brotherhoodTriggered = true;
        if (DEBUG) console.log(`[Brotherhood] cascade on type=${targetType}`);

        this._brotherhoodEffect?.detach();
        this._brotherhoodEffect = null;

        const carrier = this._brotherhoodCarrier;
        if (carrier) carrier.onBrotherhoodContact = null;
        const cp = carrier?.node?.isValid ? carrier.node.position : null;

        const targets = this.warriors.filter(w =>
            w !== carrier && w.crossedLine && w.node?.isValid && w.type === targetType
        );

        if (cp) {
            targets.sort((a, b) => {
                const ap = a.node.position, bp = b.node.position;
                const da = (ap.x - cp.x) ** 2 + (ap.y - cp.y) ** 2;
                const db = (bp.x - cp.x) ** 2 + (bp.y - cp.y) ** 2;
                return da - db;
            });
        }

        for (let i = 0; i < targets.length; i++) {
            const w = targets[i];
            w.brotherhoodInfected = true;
            const infectDelay = i * BROTHERHOOD_CASCADE_DELAY;
            this.scheduleOnce(() => {
                if (!w.node?.isValid) { w.brotherhoodInfected = false; return; }
                const brs = BrotherhoodSparkleEffect.attach(w);
                this.scheduleOnce(() => this._implodeBrotherhoodWarrior(w, brs), BROTHERHOOD_IMPLODE_HOLD);
            }, infectDelay);
        }

        this._brotherhoodCarrier = null;
    }

    private _implodeBrotherhoodWarrior(w: Warrior, brs: BrotherhoodSparkleEffect): void {
        if (!w.node?.isValid) return;
        brs.detach();
        const pts = Math.round(12 * this.currentRound * Math.pow(2, w.level - 1));
        this.score += pts;
        this.updateScoreLabel();
        this.updateRoundProgress();
        const wx  = w.node.position.x;
        const wyC = this.coords.physToVisual(w.node.position.y);
        this.vfx.spawnFloatingScore(wx, wyC, pts);
        this._activeVortices.push({
            x:     wx,
            y:     w.node.position.y,
            range: VORTEX_RANGE_BASE * w.level * LAYOUT_SCALE,
            force: VORTEX_FORCE_BASE * w.level * LAYOUT_SCALE,
            ttl:   VORTEX_TTL_BASE + w.level * VORTEX_TTL_LEVEL,
        });
        const mapper = w.mapper;
        const finish = () => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
            this._logOnTrack('brotherhood-implode');
            this.checkTrackClearedBonus(wx, wyC);
        };
        if (mapper?.node?.isValid) {
            Tween.stopAllByTarget(mapper);
            tween(mapper)
                .to(0.10, { animScale: 1.5 }, { easing: 'quadOut' })
                .to(0.20, { animScale: 0.0 }, { easing: 'quadIn'  })
                .call(finish)
                .start();
        } else {
            finish();
        }
    }

    private _tickVortexForces(): void {
        const sx = this.box2dLayer.scale.x;
        const sy = this.box2dLayer.scale.y;
        for (const v of this._activeVortices) {
            for (const w of this.warriors) {
                if (!w.node?.isValid || w.merging) continue;
                const wp  = w.node.position;
                const dxL = v.x - wp.x;
                const dyL = v.y - wp.y;
                const dist = Math.sqrt((dxL * sx) ** 2 + (dyL * sy) ** 2);
                if (dist <= 0 || dist > v.range) continue;
                const t   = 1 - dist / v.range;
                const f   = v.force * t;
                const len = Math.sqrt(dxL * dxL + dyL * dyL) || 1;
                w.applyForce(new Vec2(dxL / len * f, dyL / len * f));
            }
        }
    }

    private _logOnTrack(event: string): void {
        if (!DEBUG) return;
        const n = this.warriors.filter(w => w.crossedLine && w.node?.isValid).length;
        console.log(`[track] ${event} → ${n} warrior${n !== 1 ? 's' : ''} on track`);
    }

    private _logSpeciesCounts(): void {
        if (!DEBUG) return;
        const typeCounts = new Map<number, number>();
        for (const w of this.warriors) typeCounts.set(w.type, (typeCounts.get(w.type) ?? 0) + 1);
        const log = [...typeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${WARRIORS[t]?.name ?? t}=${n}`)
            .join(' ');
        console.log(`[species] ${log}`);
    }

    update(dt: number) {
        this.vfx.tick(dt);
        this.tickSlowmo(dt);
        this._sortWarriorLayerByY();
        if (SHOW_ENDLINE_DEBUG) this._drawEndlineDebug();
        if (this.state === GameState.GameOver || this.state === GameState.Paused) return;
        if (!this.roundUpPause) this._checkProximityMerge(dt);
        if (this.debugOverlay) {
            const g = this.debugOverlay;
            g.clear();
            g.strokeColor = new Color(0, 255, 0, 180);
            g.lineWidth = 6;
            for (const w of this.warriors) {
                if (!w.node?.isValid) continue;
                const p   = w.node.position;
                const r   = w.radius;
                const rad = w.node.angle * Math.PI / 180;
                g.circle(p.x, p.y, r);
                g.stroke();
                g.moveTo(p.x, p.y);
                g.lineTo(p.x + Math.cos(rad) * r, p.y + Math.sin(rad) * r);
                g.stroke();
            }
        }
        try {
            if (this.warriors.some(w => !w?.node?.isValid)) {
                this.warriors = this.warriors.filter(w => {
                    if (!w?.node?.isValid) {
                        if (w) { this.framesAboveLine.delete(w); this.framesBelowLine.delete(w); }
                        return false;
                    }
                    return true;
                });
            }
            this.zSortWarriors();
            if (!this.roundUpPause) {
                const dtScale = dt * FORCE_FPS_REF;  // normalize per-frame forces to 60 fps
                if (!this.timerPaused) {
                    this.applyMagnetism(dtScale);
                    this.applyUpwardDrift(dtScale);
                }
                if (this.cohesionTimeLeft > 0) { this.applyCohesion(dtScale); this.cohesionTimeLeft -= dt; }
                if (this._auraWarrior?.node?.isValid && this._auraWarrior.crossedLine) {
                    this._applyAuraRepel(dt);
                }
                if (this.implosionCenter) this.applyVortexImplosion(dt);
                this.checkLineLogic(dt);
            }
            if (this._wrLaunchWarrior?.node?.isValid) {
                if (this._wrLaunchWarrior.velocity.length() < SETTLE_VELOCITY) {
                    this._wrLaunchWarrior.onWildRiverContact = null;
                    this._wrLaunchWarrior = null;
                    this._wrLaunchEffect?.detach();
                    this._wrLaunchEffect = null;
                    this.wildRiverEnabled = false;
                    this.scheduleOnce(() => this._startWRSCascade(), 0.3);
                }
            } else if (this._wrLaunchWarrior) {
                this._wrLaunchWarrior = null;
                this._wrLaunchEffect?.detach();
                this._wrLaunchEffect = null;
                this.wildRiverEnabled = false;
                this.scheduleOnce(() => this._startWRSCascade(), 0.3);
            }
            if (this._wrsActive.size > 0) {
                this._wrsProxTimer += dt;
                if (this._wrsProxTimer >= WRS_PROX_INTERVAL) {
                    this._wrsProxTimer = 0;
                    this._tickWRSProximity();
                }
            }
            if (this._pfLaunchWarrior?.node?.isValid) {
                if (this._pfLaunchWarrior.velocity.length() < SETTLE_VELOCITY) {
                    this._pfLaunchWarrior.onPsychoContact = null;
                    this._pfLaunchWarrior = null;
                    this.psychoForceEnabled = false;
                    this.scheduleOnce(() => this._startPFCascade(), 0.3);
                }
            } else if (this._pfLaunchWarrior) {
                this._pfLaunchWarrior = null;
                this.psychoForceEnabled = false;
                this.scheduleOnce(() => this._startPFCascade(), 0.3);
            }
            if (this._pfActive.size > 0) {
                this._pfProxTimer += dt;
                if (this._pfProxTimer >= PF_PROX_INTERVAL) {
                    this._pfProxTimer = 0;
                    this._tickPFProximity();
                }
            }
            if (this._brotherhoodCarrier?.node?.isValid && !this._brotherhoodTriggered) {
                if (!this._brTimerStarted &&
                    this._brotherhoodCarrier.crossedLine &&
                    this._brotherhoodCarrier.velocity.length() < SETTLE_VELOCITY) {
                    this._brTimerStarted = true;
                    this._brotherhoodEffect?.startTimer(BROTHERHOOD_EXPIRE_SEC);
                }
                this._brotherhoodProxTimer += dt;
                if (this._brotherhoodProxTimer >= BROTHERHOOD_PROX_INTERVAL) {
                    this._brotherhoodProxTimer = 0;
                    this._tickBrotherhoodProximity();
                }
            } else if (this._brotherhoodCarrier && !this._brotherhoodCarrier.node?.isValid) {
                this._expireBrotherhood();
            }
            if (this._activeVortices.length > 0) {
                for (let i = this._activeVortices.length - 1; i >= 0; i--) {
                    this._activeVortices[i].ttl -= dt;
                    if (this._activeVortices[i].ttl <= 0) this._activeVortices.splice(i, 1);
                }
                if (this._activeVortices.length > 0) this._tickVortexForces();
            }
            if (this.state === GameState.Settling) this.checkSettled();
            if (this.state === GameState.Aiming)   this.tickTimer(dt);
            this.updateDebugLabel();
        } catch (e) {
            console.error('[GameManager] update error (skipping frame):', e);
            this._handleRuntimeError('update', e);
        }
    }

    // --- spawn flow ---

    private createWarrior(): Warrior {
        const w = this.spawnMgr.spawnNext();
        this._recordSpawn(w.type, this.currentRound);
        const isFirstSpecies = this._checkFirstAura(w);
        if (w.mapper) w.mapper.animScale = 0;
        // PerspectiveMapper.lateUpdate hasn't run yet for this brand-new component — hide viewNode
        // immediately so it doesn't flash at (0,0) for the first rendered frame.
        if (w.viewNode?.isValid) w.viewNode.setScale(0, 0, 1);
        this.warriors.push(w);
        this.nextLaunchWarrior = w;
        if (this._nextPowerup) {
            this._nextPowerupPending = true;
        } else if (isFirstSpecies) {
            this._nextPowerup = 'aura';
            this._nextPowerupPending = true;
        }
        return w;
    }

    private activateWarrior(w: Warrior): void {
        this._activeLauncherWarrior = w;
        this.inputCtrl.setWarrior(w);
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this.mergesThisLaunch = 0;
        this.state = GameState.Aiming;
        this.updateTimerLabel();

        // Detach aura if it's still on the incoming launcher (e.g. re-activation edge case)
        if (this._auraWarrior === w) {
            this._restoreAuraScales();
            this._auraEffect?.detach();
            this._auraEffect  = null;
            this._auraWarrior = null;
            this._auraProxTimers.clear();
        }

        this._launcherWildRiverEffect?.detach();
        this._launcherWildRiverEffect = null;

        // Brotherhood auto: ≥25 warrior sul track, cooldown 10 tiri + 10 merge
        const onTrack = this.warriors.filter(ww => ww.crossedLine && ww.node?.isValid).length;
        if (onTrack >= 25 && this._brCooldownLaunches === 0 && this._brCooldownMerges === 0 && !this._brotherhoodCarrier && this._nextPowerup === null) {
            this._expireBrotherhood();
            const ge = BrotherhoodEffect.attach(w, this.vfx.sparkleFrame, this.vfx.auraFrame);
            ge.onExpired = () => this._expireBrotherhood();
            w.onBrotherhoodContact = (s, t) => this._onBrotherhoodContact(s, t);
            this._brotherhoodCarrier   = w;
            this._brotherhoodEffect    = ge;
            this._brotherhoodTriggered = false;
            this._brotherhoodProxTimer = 0;
            this._brTimerStarted    = false;
        }

        // WildRiver (debug toggle only)
        if (this.wildRiverEnabled) {
            this._launcherWildRiverEffect = WildRiverEffect.attach(w, this.vfx.sparkleFrame, this.vfx.auraFrame);
        }

        // PsychoForce auto-activation disabled
        this.psychoForceEnabled = false;
        if (this.psychoForceEnabled) {
            const pfe = PsychoForceEffect.attach(w, this.vfx.auraFrame, true);
            w.psychoForce = pfe;
        }

        if (this._nextPowerupPending && this._nextPowerup) {
            this._nextPowerupPending = false;
            this._applyPendingPowerup(w, this._nextPowerup);
            this._nextPowerup = null;
        }

        this._updateNextPreviewPowerupGlow();

        // Snapshot the turn-start situation so a runtime error can be recovered to exactly here.
        this._saveSnapshot();
    }

    private onWarriorLaunched(w: Warrior, forcePct = 1): void {
        this.onboarding?.hideAimHint();          // safety: also covers timer auto-launch (no drag fired)
        this.onboarding?.fadeMergeHintAfterLaunch();  // merge hint lingered during the drag; fade it now
        // First launch: force one last full relayout so the Box2D walls, exported wall
        // geometry (WALL_*), game-over line and input bounds are all final before flight —
        // the responsive TrackSprite size may have settled only after Track/GameManager start().
        if (!this._didFirstLaunchRefresh) {
            this._didFirstLaunchRefresh = true;
            this._refreshTrackGeometry();
            if (TEST_FIRST_LAUNCH_GAMEOVER) {
                void this._testForceGameOver();
                return;
            }
        }
        const launchY = w.node.position.y;
        if (launchY >= this.gameOverLineLocal) {
            console.error(`[GameManager] LAUNCH ERROR: warrior localY=${launchY.toFixed(1)} >= gameOverLineLocal=${this.gameOverLineLocal.toFixed(1)} — aborting launch`);
            return;
        }
        // Flight trail — self-detaches when the warrior stops, merges or dies
        this._trailEffect?.detach();
        this._trailEffect = TrailEffect.attach(w, this.vfxLayer, this.vfx.sparkleFrame, y => this.coords.physToVisual(y));
        this._launcherWildRiverEffect?.detach();
        this._launcherWildRiverEffect = null;
        if (this.wildRiverEnabled) {
            this._wrCooldownLaunches = 10;
            this._wrsOrder = [];
            this._wrsImploding = false;
            this._wrsImplodeK = 1;
            w.isWRLauncher = true;
            w.onWildRiverContact = (s, t) => this._onWildRiverContact(s, t);
            this._wrLaunchWarrior = w;
            this._wrLaunchEffect = WildRiverSparkleEffect.attach(w);
        } else if (this._wrCooldownLaunches > 0) {
            this._wrCooldownLaunches--;
        }
        if (this._brotherhoodCarrier === w) {
            this._brCooldownLaunches = 10;
            this._brCooldownMerges   = 10;
        } else if (this._brCooldownLaunches > 0) {
            this._brCooldownLaunches--;
        }
        if (this.psychoForceEnabled) {
            this._pfCooldownLaunches = 10;
            this._pfOrder      = [];
            this._pfImploding  = false;
            this._pfImplodeK   = 1;
            w.onPsychoContact  = (s, t) => this._onPFContact(s, t);
            this._pfLaunchWarrior = w;
        } else if (this._pfCooldownLaunches > 0) {
            this._pfCooldownLaunches--;
        }
        // Strip powerup visuals from any warrior already on track — residual effects continue on their own
        if (this._auraWarrior && this._auraWarrior !== w && this._auraWarrior.crossedLine) {
            this._auraEffect?.detach();
            this._auraEffect = null;
            this._restoreAuraScales();
            this._auraWarrior = null;
            this._auraProxTimers.clear();
        }
        if (this._pfLaunchWarrior && this._pfLaunchWarrior !== w && this._pfLaunchWarrior.crossedLine) {
            this._pfLaunchWarrior.psychoForce?.detach();
            this._pfLaunchWarrior.psychoForce = null;
        }
        if (this._auraWarrior === w) this._auraEffect?.startTimer();

        this.state = GameState.Inflight;
        this.inflightWarrior = w;
        this._lastTickSec = -1;

        AudioManager.instance.play(SFX.LAUNCH, Math.max(0.3, forcePct));
        this.scheduleOnce(() => this.checkLaunchResult(w), LAUNCH_CHECK_DELAY);
        this._logSpeciesCounts();
    }

    private checkSettled(): void {
        if (this.roundUpPause) return;
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        inPlay.forEach(w => { if (w.velocity.length() < SETTLE_VELOCITY) w.forceStop(); });
        if (!inPlay.every(w => w.velocity.length() < SETTLE_VELOCITY)) return;
        if (this._wrsActive.size > 0 || this._wrLaunchWarrior !== null || this._pfActive.size > 0 || this._pfLaunchWarrior !== null) return;

        AudioManager.instance.play(SFX.LAND, 0.5);
        this.activateWarrior(this.createWarrior());
    }

    // --- line / game over logic ---

    private checkLaunchResult(w: Warrior): void {
        if (!w.node?.isValid || w.crossedLine || this.state === GameState.GameOver) return;
        if (this.inflightWarrior !== w) return;
        if (this.roundUpPause) { this.scheduleOnce(() => this.checkLaunchResult(w), 0.3); return; }
        if (w.node.position.y >= this.gameOverLineLocal) return;
        if (w.velocity.length() < SETTLE_VELOCITY) {
            if (w.hitOtherWarrior) {
                w.playGameOverEffect();
                this.triggerGameOver();
            } else {
                this.penaliseAndReturn(w);
            }
        } else {
            this.scheduleOnce(() => this.checkLaunchResult(w), 0.3);
        }
    }

    private penaliseAndReturn(w: Warrior): void {
        this.score = Math.max(0, this.score - FAILED_LAUNCH_MALUS);
        this.vfx.screenShake(5, 0.18);
        AudioManager.instance.play(SFX.MALUS);
        this.vfx.spawnFloatingScore(w.node.position.x, this.coords.physToVisual(w.node.position.y), -FAILED_LAUNCH_MALUS);
        this.updateScoreLabel();

        // Powerup lost on failed launch
        if (this._pfLaunchWarrior === w) {
            w.psychoForce?.detach();
            w.psychoForce = null;
            w.onPsychoContact = null;
            this._pfLaunchWarrior = null;
            this.psychoForceEnabled = false;
        }
        if (this._wrLaunchWarrior === w) {
            this._wrLaunchEffect?.detach();
            this._wrLaunchEffect = null;
            w.isWRLauncher = false;
            w.onWildRiverContact = null;
            this._wrLaunchWarrior = null;
            this.wildRiverEnabled = false;
        }
        if (this._brotherhoodCarrier === w) this._expireBrotherhood();

        w.launched = false;
        w.forceStop();
        w.setDragMode(true);

        const spawnY = (GAME_OVER_LINE_Y + TRACK_BOTTOM_Y) / 2;
        tween(w.node)
            .to(0.55, { position: new Vec3(0, spawnY, 0) }, { easing: 'quadOut' })
            .call(() => {
                if (!w.node?.isValid) return;
                w.setDragMode(false);
                w.resetPhysics();
                this.activateWarrior(w);
            })
            .start();
    }

    private checkLineLogic(dt: number): void {
        let anyDanger = false;
        const gol = this.gameOverLineLocal;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging) continue;
            const y = w.node.position.y;

            if (!w.crossedLine && w.launched) {
                if (y >= gol) {
                    // Require sustained above-line to prevent a brief graze from committing crossedLine
                    const n = (this.framesAboveLine.get(w) ?? 0) + 1;
                    this.framesAboveLine.set(w, n);
                    if (n >= CROSS_LINE_FRAMES) {
                        this.framesAboveLine.delete(w);
                        this.framesBelowLine.delete(w);
                        w.crossedLine = true;
                        w.settled = true;
                        if (w.onPsychoContact === null && this._pfLaunchWarrior === w) {
                            w.onPsychoContact = (s, t) => this._onPFContact(s, t);
                        }
                        if (this.state === GameState.Inflight) {
                            if (this.waitForSettling || this._wrLaunchWarrior !== null || this._wrsActive.size > 0 || this._pfLaunchWarrior !== null || this._pfActive.size > 0) {
                                this.state = GameState.Settling;
                            } else {
                                this.activateWarrior(this.createWarrior());
                            }
                        }
                    }
                } else {
                    this.framesAboveLine.delete(w);
                }
            } else if (w.crossedLine && w.settled && w.fired) {
                // Danger pulse when the warrior's bottom edge reaches the line.
                if (w !== this.inflightWarrior && (y - w.radius) <= gol) anyDanger = true;
                // Game over only when the warrior has sunk well below the line so its base has fully
                // passed it. The perspective compresses Y by 4× (sprite moves ¼ of the physics delta),
                // so the centre must drop GAME_OVER_DESCENT_RADII radii before the visual base clears.
                if (y < gol - GAME_OVER_DESCENT_RADII * w.radius) {
                    // Require sustained below-line to avoid single-frame physics-jitter game over
                    const n = (this.framesBelowLine.get(w) ?? 0) + 1;
                    this.framesBelowLine.set(w, n);
                    if (n >= GAME_OVER_FRAMES) {
                        this.framesBelowLine.delete(w);
                        this.penaltyExplode(w);
                        return;
                    }
                } else {
                    this.framesBelowLine.delete(w);
                }
            }
        }
        this.track?.setLinePulse(anyDanger);
        if (anyDanger) {
            this._dangerCooldown -= dt;
            if (this._dangerCooldown <= 0) {
                this._dangerCooldown = 0.9;
                AudioManager.instance.play(SFX.DANGER, 0.6);
            }
        } else {
            this._dangerCooldown = 0;
        }
    }

    private penaltyExplode(w: Warrior): void {
        if (this.timerPaused) return;
        w.playGameOverEffect();
        this.triggerGameOver();
    }

    private cycleLauncherLevel(w: Warrior): void {
        const maxLevel = Object.keys(LEVEL_CONFIG).length;
        const newLevel = (w.level % maxLevel) + 1;
        const pos = w.node.position;
        this.warriors = this.warriors.filter(x => x !== w);
        this.framesAboveLine.delete(w);
        this.framesBelowLine.delete(w);
        w.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, w.type, newLevel, pos.x, pos.y);
        this.warriors.push(nw);
        this.inputCtrl.setWarrior(nw);
        if (nw.mapper) nw.mapper.animScale = 0;
        if (nw.viewNode?.isValid) nw.viewNode.setScale(0, 0, 1);
        this.nextLaunchWarrior = nw;
        if (nw.mapper) {
            tween(nw.mapper)
                .to(0.18, { animScale: 1.2 }, { easing: 'quadOut' })
                .to(0.08, { animScale: 0.9 })
                .to(0.06, { animScale: 1.0 })
                .call(() => { if (this.nextLaunchWarrior === nw) this.nextLaunchWarrior = null; })
                .start();
        }
    }

    private swapNextWithLauncher(): void {
        if (this.state !== GameState.Aiming || !this.inputCtrl.launchEnabled) return;
        const cur = this._activeLauncherWarrior;
        if (!cur?.node?.isValid) return;

        const curType  = cur.type;
        const curLevel = cur.level;
        const { type: nextType, level: nextLevel } = this.spawnMgr.next;

        const spawnX = cur.node.position.x;
        const spawnY = cur.node.position.y;

        // Powerup on cur follows it to the next slot; save what was pending for nw (from a previous swap)
        const curPowerup: 'aura' | 'psychoForce' | 'wildRiver' | 'brotherhood' | null =
            (this._auraWarrior === cur)      ? 'aura' :
            (cur.psychoForce != null)        ? 'psychoForce' :
            this.wildRiverEnabled            ? 'wildRiver' :
            (this._brotherhoodCarrier === cur)  ? 'brotherhood' : null;
        const pendingForNw = this._nextPowerup;
        this._nextPowerup  = curPowerup;

        if (this._auraWarrior === cur) {
            this._restoreAuraScales();
            this._auraEffect?.detach();
            this._auraEffect  = null;
            this._auraWarrior = null;
            this._auraProxTimers.clear();
        }
        if (curPowerup === 'psychoForce') {
            cur.psychoForce?.detach();
            this.psychoForceEnabled = false;
        }
        if (curPowerup === 'wildRiver') {
            this.wildRiverEnabled = false;
        }
        if (curPowerup === 'brotherhood') {
            this._brotherhoodEffect?.detach();
            this._brotherhoodEffect    = null;
            this._brotherhoodCarrier   = null;
            this._brotherhoodTriggered = false;
            this._brTimerStarted    = false;
        }

        this.warriors = this.warriors.filter(w => w !== cur);
        this.framesAboveLine.delete(cur);
        this.framesBelowLine.delete(cur);
        cur.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, nextType, nextLevel, spawnX, spawnY);
        nw.onMergeReady = (a, b) => this.mergeWarriors(a, b);
        if (nw.mapper) nw.mapper.animScale = 0;
        if (nw.viewNode?.isValid) nw.viewNode.setScale(0, 0, 1);
        this.warriors.push(nw);
        this._activeLauncherWarrior = nw;
        this.nextLaunchWarrior = nw;

        const isFirstSpeciesNw = this._checkFirstAura(nw);

        this._launcherWildRiverEffect?.detach();
        this._launcherWildRiverEffect = null;
        if (pendingForNw) {
            this._applyPendingPowerup(nw, pendingForNw);
        } else if (isFirstSpeciesNw) {
            this._applyPendingPowerup(nw, 'aura');
        } else if (this.wildRiverEnabled) {
            this._launcherWildRiverEffect = WildRiverEffect.attach(nw, this.vfx.sparkleFrame, this.vfx.auraFrame);
        }

        this.inputCtrl.setWarrior(nw);

        if (nw.mapper) {
            tween(nw.mapper)
                .to(0.15, { animScale: 1.15 }, { easing: 'quadOut' })
                .to(0.07, { animScale: 0.9 })
                .to(0.06, { animScale: 1.0 })
                .call(() => { if (this.nextLaunchWarrior === nw) this.nextLaunchWarrior = null; })
                .start();
        }

        this.spawnMgr.setNext(curType, curLevel);
        this.updateNextPreview(true);
        AudioManager.instance.play(SFX.SPAWN, 0.6);
    }

    private triggerGameOver(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        this._slowmoTimer = 0;
        this._slowmoScale = 1.0;
        director.getScheduler().setTimeScale(1.0);
        this._activeLauncherWarrior = null;
        this.inputCtrl.blocked = true;  // inhibit all controls until the panel is shown
        // Schedule the screen FIRST: triggerGameOver runs inside update()'s try/catch, which
        // swallows exceptions. If a side-effect below threw before this line, the game would
        // freeze on state=GameOver with no screen ever shown (red warrior, no message).
        // The panel appears only once pending merges and the score odometer have settled.
        this._revealEndPanelWhenSettled(() => this.showGameOverScreen(), END_PANEL_DELAY);
        PortalProvider.get().gameplayStop();
        try {
            this.vfx.screenShake(12, 0.35);
            this.inputCtrl.clearWarrior();
            AudioManager.instance.stopMusic();
            AudioManager.instance.play(SFX.GAME_OVER);
            this._newBest = this.bestScore > 0 && this.score > this.bestScore && this.score > NEW_BEST_MIN_SCORE;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                SafeStorage.set('fw_best_score', String(this.bestScore));
            }
            this._logSpawnReport();
        } catch (e) {
            console.error('[GameManager] triggerGameOver side-effect failed (screen still shown):', e);
        }
    }

    /**
     * Resolve the leaderboard qualification at end of game and, if the score makes the
     * top-N, arm the name-entry handoff (LeaderboardPanel.pendingScore) — WITHOUT navigating.
     * Done while the game settles, BEFORE the end panel becomes interactive, so the panel's
     * Continue button can route to the Ranking scene with the name-entry already armed and
     * never race the async network call. No-op when the leaderboard is off or on error.
     */
    private async _prepareLeaderboard(score: number): Promise<void> {
        if (!LEADERBOARD_ENABLED) return;
        const svc = LeaderboardProvider.get();
        try {
            await svc.init();
            if (!(await svc.qualifies(score))) return;
        } catch {
            return;
        }
        LeaderboardPanel.pendingScore = score;
        LeaderboardPanel.pendingRound = this.currentRound;
        LeaderboardPanel.pendingVersion = VERSION;
    }

    private triggerVictory(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        this._slowmoTimer = 0;
        this._slowmoScale = 1.0;
        director.getScheduler().setTimeScale(1.0);
        PortalProvider.get().gameplayStop();
        this.inputCtrl.clearWarrior();
        this.inputCtrl.blocked = true;  // inhibit all controls until the panel is shown
        this.vfx.screenShake(18, 0.6);
        this._activeLauncherWarrior = null;
        this._newBest = this.bestScore > 0 && this.score > this.bestScore && this.score > NEW_BEST_MIN_SCORE;
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            SafeStorage.set('fw_best_score', String(this.bestScore));
        }

        // Cascade-explode all warriors in play, scoring 50×level each
        const toExplode = this.warriors.filter(w => w.node?.isValid && w.crossedLine);
        let bonus = 0;
        toExplode.forEach((w, i) => {
            bonus += 50 * w.level;
            this.scheduleOnce(() => {
                if (!w.node?.isValid) return;
                const wx  = w.node.position.x;
                const wyC = this.coords.physToVisual(w.node.position.y);
                this.vfx.spawnBlackhole(wx, wyC, w.radius, LEVEL_CONFIG[w.level]?.vfxColor ?? new Color(255, 200, 50, 255));
                this.vfx.spawnFloatingScore(wx, wyC, 50 * w.level);
                this.framesAboveLine.delete(w);
                this.framesBelowLine.delete(w);
                w.node.destroy();
            }, i * 0.08);
        });
        const explodeSet = new Set(toExplode);
        this.warriors = this.warriors.filter(w => !explodeSet.has(w));
        this.score += bonus;
        this.updateScoreLabel();

        // The panel appears only once the cascade explosions, pending merges and the score
        // odometer have all completed (at least END_PANEL_DELAY after the cascade timeline).
        const cascadeEnd = toExplode.length * 0.08 + 0.6;
        // Scheduled before the fragile audio/log calls so a thrown side-effect (swallowed by
        // update()'s try/catch) can't freeze the game with no screen.
        this._revealEndPanelWhenSettled(() => {
            AudioManager.instance.unduckMusic();
            this.showVictoryScreen();
        }, Math.max(END_PANEL_DELAY, cascadeEnd));
        try {
            AudioManager.instance.duckMusicTo(0.15);
            AudioManager.instance.play(SFX.WIN);
            this._logSpawnReport();
        } catch (e) {
            console.error('[GameManager] triggerVictory side-effect failed (screen still shown):', e);
        }
    }

    /**
     * Reveal an end-of-game panel only once the game has fully settled: at least `minDelay`
     * seconds elapsed (covers the shake / explosion-cascade timeline) AND no merge is in flight
     * AND the score odometer tween has finished. A safety cap shows it regardless after 10s.
     * Controls are already inhibited by the caller (state=GameOver + inputCtrl.blocked).
     * Once settled, the leaderboard qualification is resolved (arming the name-entry handoff)
     * BEFORE the panel is shown, so its Continue button never races the async network call.
     */
    private _revealEndPanelWhenSettled(show: () => void, minDelay: number): void {
        // Start the leaderboard prep NOW, in parallel — it arms the name-entry handoff without
        // navigating. The panel display must NOT depend on this network call (it can take seconds
        // in the editor preview); only the Continue button awaits it (see _wirePanels).
        this._lbReady = this._prepareLeaderboard(this.score);
        const STEP = 0.1;
        const SAFETY_CAP = 10.0;
        let elapsed = 0;
        // Schedule a single repeating selector (NOT re-scheduling itself each tick, which trips
        // Cocos' "selector already scheduled" warning); unschedule it once settled.
        const tick = (): void => {
            elapsed += STEP;
            const mergesInFlight = this.warriors.some(w => !!w.node?.isValid && w.merging);
            const scoreSettling  = this._scoreTween !== null;
            if ((elapsed >= minDelay && !mergesInFlight && !scoreSettling) || elapsed >= SAFETY_CAP) {
                this.unschedule(tick);
                show();
            }
        };
        this.schedule(tick, STEP);
    }

    private showVictoryScreen(): void {
        if (this.victoryPanel) {
            this.victoryPanel.show(this.score, this.currentRound, this.bestScore, this._newBest);
        } else {
            console.warn('[GameManager] VictoryPanel not found — no end screen shown');
        }
    }

    private showGameOverScreen(): void {
        if (this.gameOverPanel) {
            this.gameOverPanel.show(this.score, this.currentRound, this.bestScore, this._newBest);
        } else {
            console.warn('[GameManager] GameOverPanel not found — no end screen shown');
        }
    }

    // --- merge ---

    private mergeWarriors(a: Warrior, b: Warrior): void {
        if (this.timerPaused) { a.merging = false; b.merging = false; return; }
        if (this.roundUpPause) {
            // Physics may be disabled during round-up — defer until it's stable again.
            // Creating/destroying Box2D bodies while PhysicsSystem2D is off leaves stale
            // broadphase proxies that cause explosive behaviour on re-enable.
            this.scheduleOnce(() => {
                if (a.node?.isValid && b.node?.isValid) this.mergeWarriors(a, b);
                else { a.merging = false; b.merging = false; }
            }, 0.1);
            return;
        }

        // If the currently-inflight warrior (launched, not yet crossed) merges before reaching the
        // game-over line, checkLineLogic will never fire for it — we must activate the next warrior here.
        const inflightMerged = this.state === GameState.Inflight &&
            ((a.launched && !a.crossedLine) || (b.launched && !b.crossedLine));

        const midX  = (a.node.position.x + b.node.position.x) / 2;  // local (scaleX=1 → canvas)
        const midY  = (a.node.position.y + b.node.position.y) / 2;  // local
        const midYC = this.coords.physToVisual(midY);                 // canvas Y for UI/VFX

        // PsychoForce cross-type merge: result uses the receiver's type (the one not carrying the aura)
        const isPsychoMerge    = a.type !== b.type && (a.psychoForce !== null || b.psychoForce !== null);
        const parentWasPsycho  = a.psychoForce !== null || b.psychoForce !== null;
        const aType            = isPsychoMerge
            ? (b.psychoForce !== null && a.psychoForce === null ? a.type : b.type)
            : a.type;

        const newLevel = a.level + 1;
        const maxLevel = WARRIORS[aType]?.maxLevel ?? 7;
        const vx = (a.velocity.x + b.velocity.x) * 0.5 * 0.75;
        const vy = (a.velocity.y + b.velocity.y) * 0.5 * 0.75;

        this.framesAboveLine.delete(a); this.framesBelowLine.delete(a);
        this.framesAboveLine.delete(b); this.framesBelowLine.delete(b);

        const isEffectMerge = isPsychoMerge ||
            a.wildRiverSparkle != null || b.wildRiverSparkle != null;
        if (!isEffectMerge) {
            this.totalMerges++;
            if (this._brCooldownMerges > 0) this._brCooldownMerges--;
            this.checkRoundAdvance();
        }
        this.mergesThisLaunch++;
        const points = 10 * (1 << (newLevel - 1)) * this.currentRound * (1 << (this.mergesThisLaunch - 1));
        this.score += points;
        this._trackBestSingle(points, this.mergesThisLaunch > 1
            ? `×${this.mergesThisLaunch} combo`
            : `${WARRIORS[a.type]?.name ?? '?'} lv.${newLevel}`);
        this.vfx.spawnFloatingScore(midX, midYC, points, this.mergesThisLaunch > 1);
        this._maybeScoreSlowmo(points);
        this.updateScoreLabel();
        this.updateRoundProgress();

        const MERGE_OUT_DUR = 0.12;
        a.playMergeOutEffect(midX, midY, MERGE_OUT_DUR);
        b.playMergeOutEffect(midX, midY, MERGE_OUT_DUR);
        const ghostFrame  = a.viewNode?.isValid ? a.viewNode.getComponent(Sprite)?.spriteFrame ?? null : null;
        const ghostSize   = a.viewNode?.isValid ? (a.viewNode.getComponent(UITransform)?.contentSize.width ?? 0) : 0;
        const ghostX      = a.viewNode?.isValid && b.viewNode?.isValid
            ? (a.viewNode.worldPosition.x + b.viewNode.worldPosition.x) / 2 : midX;
        const ghostY      = a.viewNode?.isValid && b.viewNode?.isValid
            ? (a.viewNode.worldPosition.y + b.viewNode.worldPosition.y) / 2 : midYC;

        this.scheduleOnce(() => {
            this._cleanupWRS(a);
            this._cleanupWRS(b);
            this._cleanupPF(a);
            this._cleanupPF(b);
            const auraInvolved = a === this._auraWarrior || b === this._auraWarrior;
            if (auraInvolved) {
                this._auraEffect?.detach();
                this._auraEffect = null;
                this._auraProxTimers.clear();
            }
            if (a.node.isValid) a.node.destroy();
            if (b.node.isValid) b.node.destroy();
            this.warriors = this.warriors.filter(x => x !== a && x !== b);
            this.framesAboveLine.delete(a); this.framesBelowLine.delete(a);
            this.framesAboveLine.delete(b); this.framesBelowLine.delete(b);

            if (newLevel > maxLevel) {
                // Both at max level — blackhole, no new warrior spawned
                const lvConf  = LEVEL_CONFIG[maxLevel];
                const color   = lvConf?.vfxColor ?? new Color(255, 200, 50, 255);
                const bonus   = lvConf?.bonus ?? 0;
                const tier    = Math.max(1, Math.min(3, maxLevel - 2)) as 1 | 2 | 3;

                const wrSfxs = [SFX.MERGE_1, SFX.MERGE_2, SFX.MERGE_3, SFX.MERGE_4, SFX.MERGE_5, SFX.MERGE_6];
                AudioManager.instance.play(wrSfxs[Math.min(maxLevel, wrSfxs.length - 1)]);
                const expSfx = newLevel >= 7 ? SFX.EXPLOSION_3 : newLevel >= 6 ? SFX.EXPLOSION_2 : SFX.EXPLOSION_1;
                this.scheduleOnce(() => AudioManager.instance.play(expSfx), 0.25);

                this.vfx.screenShake(tier >= 3 ? 20 : tier >= 2 ? 14 : 8, tier >= 3 ? 0.50 : tier >= 2 ? 0.40 : 0.28);
                this.activateSlowmo(tier >= 3 ? 0.15 : tier >= 2 ? 0.25 : 0.40, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);

                this.score += bonus;
                this.updateScoreLabel();
                if (bonus > 0) {
                    this._trackBestSingle(bonus, `${WARRIORS[aType]?.name ?? '?'} ${LEVEL_CONFIG[maxLevel]?.label ?? 'explosion'}`);
                    this.vfx.spawnFloatingScore(midX, midYC + 30, bonus);
                }
                if (ghostFrame && ghostSize > 0) this.vfx.flashMergeGhost(ghostX, ghostY, ghostFrame, ghostSize, WARRIORS[aType]?.color);
                this.vfx.spawnBlackhole(midX, midYC + a.radius * 0.9, a.radius, color, tier, maxLevel);
                this.vfx.spawnImplosionVFX(midX, midYC, color, tier / 3, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);
                const impDur   = tier >= 3 ? 2.5 : tier >= 2 ? 2.0 : 1.5;
                const impForce = (200 + tier * 60) * LAYOUT_SCALE;
                this.implosionCenter    = new Vec2(midX, midY);
                this.implosionDuration  = impDur;
                this.implosionTimeLeft  = impDur;
                this.implosionPeakForce = impForce;
                this.vfx.spawnExplosionLabel(midX, midYC + 10, lvConf?.label ?? '', color);
                this._vibrate(120);

                if (WARRIORS[aType]?.type === 'dragon') {
                    this.scheduleOnce(() => this.triggerVictory(), 0.5);
                    return;
                }
                this.checkTrackClearedBonus(midX, midYC);
                this._logOnTrack('explosion');
                if (auraInvolved) { this._restoreAuraScales(); this._auraWarrior = null; }
                if (inflightMerged) this.activateAfterInflightMerge();
                return;
            }

            const merged = Warrior.spawn(this.box2dLayer, this.warriorsLayer, aType, newLevel, midX, midY);
            merged.crossedLine = true;
            merged.fired = true;
            merged.settle();
            merged.onMergeReady = (x, y) => this.mergeWarriors(x, y);
            merged.velocity = new Vec2(vx, vy);
            this.warriors.push(merged);
            if (merged.mapper) merged.mapper.animScale = 0;
            merged.playMergeInEffect(0.35);
            if (parentWasPsycho) this._applyPF(merged);
            if (auraInvolved) {
                this._restoreAuraScales();
                this._auraEffect = AuraEffect.attach(merged, this.vfx.auraFrame, this.vfx.sparkleFrame, this._auraRangeForType(merged.type) * LAYOUT_SCALE);
                this._auraEffect.onExpired = () => { this._auraEffect?.detach(); this._restoreAuraScales(); this._auraWarrior = null; this._auraEffect = null; this._auraProxTimers.clear(); };
                this._auraEffect.startTimer();
                this._auraWarrior = merged;
            }

            const mergeSfxs = [SFX.MERGE_1, SFX.MERGE_2, SFX.MERGE_3, SFX.MERGE_4];
            AudioManager.instance.play(mergeSfxs[Math.min(newLevel - 2, mergeSfxs.length - 1)]);
            this.vfx.flashMerge(merged.mapper);
            this._vibrate(40);
            this._logOnTrack('merge');

            if (inflightMerged) this.activateAfterInflightMerge();
        }, MERGE_OUT_DUR);
    }

    // --- psycho force ---

    private _cleanupPF(w: Warrior): void {
        if (this._pfActive.has(w)) {
            const sp = this._pfActive.get(w) ?? null;
            this._pfActive.delete(w);
            if (sp?.node?.isValid) {
                Tween.stopAllByTarget(sp);
                tween(sp).to(0.25, { color: new Color(255, 255, 255, 255) }).start();
            }
        } else {
            w.psychoForce?.detach(); // launcher: rimuove PsychoForceEffect
        }
        w.psychoForce = null;
        w.onPsychoContact = null;
        if (this._pfLaunchWarrior === w) {
            this._pfLaunchWarrior = null;
            this.psychoForceEnabled = false;
        }
        this._pfOrder = this._pfOrder.filter(x => x !== w);
        this._pfProxTimers.delete(w);
    }

    private _applyPF(target: Warrior): void {
        if (this._pfActive.has(target)) return;
        if (this._pfImploding) return;
        if (target === this._pfLaunchWarrior) return;
        if (!target.node?.isValid || !target.crossedLine) return;
        if (DEBUG) console.log(`[PF] infect type=${target.type} lv=${target.level}`);

        // Tinta ciano direttamente sullo sprite del warrior (no overlay)
        const sp = target.viewNode?.getComponent(Sprite) ?? null;
        if (sp) {
            Tween.stopAllByTarget(sp);
            tween(sp).to(0.25, { color: new Color(0, 200, 255, 255) }).start();
        }

        // psychoForce stub: serve per abilitare merge cross-specie e per il check cleanup
        target.psychoForce = { detach: () => {}, resetTimer: () => {} };
        target.onPsychoContact = (s, t) => this._onPFSpread(s, t);
        this._pfActive.set(target, sp);
        this._pfOrder.push(target);
        this._playPFInfectAnim(target);
    }

    private _spawnPFLaser(canvasY: number): void {
        if (!this.psychoSparklePrefab || !this.warriorsLayer?.isValid) return;
        const n = instantiate(this.psychoSparklePrefab);
        n.setParent(this.warriorsLayer);
        n.layer = this.warriorsLayer.layer;
        n.setPosition(0, canvasY, 0);
        n.children.forEach(c => { c.layer = this.warriorsLayer.layer; });
        const atom = n.getChildByName('atom');
        if (atom) {
            const ut = atom.getComponent(UITransform);
            if (ut) ut.setContentSize(TRACK_W * 3, 126);
        }
        const op = atom?.getComponent(UIOpacity) ?? atom?.addComponent(UIOpacity) ?? null;
        if (op) {
            op.opacity = 230;
            tween(op).delay(0.05).to(0.30, { opacity: 0 })
                .call(() => { if (n.isValid) n.destroy(); }).start();
        } else {
            this.scheduleOnce(() => { if (n.isValid) n.destroy(); }, 0.40);
        }
    }

    private _isHorizontalContact(dx: number, dy: number): boolean {
        return dx > dy;
    }

    private _onPFContact(source: Warrior, target: Warrior): void {
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (source === target || !target.crossedLine) return;
        const dx = Math.abs(target.node.position.x - source.node.position.x);
        const dy = Math.abs(target.node.position.y - source.node.position.y);
        if (this._isHorizontalContact(dx, dy) || target.type === source.type) {
            this._applyPF(target);
            const vy = target.viewNode?.isValid
                ? target.viewNode.position.y
                : this.coords.physToVisual(target.node.position.y);
            this._spawnPFLaser(vy);
        }
    }

    private _onPFSpread(source: Warrior, target: Warrior): void {
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (source === target || !target.crossedLine) return;
        const dx = Math.abs(target.node.position.x - source.node.position.x);
        const dy = Math.abs(target.node.position.y - source.node.position.y);
        if (this._isHorizontalContact(dx, dy) || target.type === source.type) {
            this._applyPF(target);
        }
    }

    private _tickPFProximity(): void {
        const inRange = new Map<Warrior, Warrior>();

        for (const [pfW] of this._pfActive) {
            if (!pfW.node?.isValid) continue;
            const pos = pfW.node.position;
            for (const w of this.warriors) {
                if (w === pfW || w === this._pfLaunchWarrior) continue;
                if (!w.node?.isValid || !w.crossedLine) continue;
                if (this._pfActive.has(w)) continue;
                const wp  = w.node.position;
                const dx  = Math.abs(pos.x - wp.x);
                const dy  = Math.abs(pos.y - wp.y);
                const thr = pfW.radius + w.radius + PF_PROX_MARGIN * LAYOUT_SCALE;
                if (dx * dx + dy * dy <= thr * thr) {
                    if (this._isHorizontalContact(dx, dy) || w.type === pfW.type) {
                        if (!inRange.has(w)) inRange.set(w, pfW);
                    }
                }
            }
        }

        for (const w of this._pfProxTimers.keys()) {
            if (!inRange.has(w) || this._pfActive.has(w)) this._pfProxTimers.delete(w);
        }
        for (const [w] of inRange) {
            if (this._pfActive.has(w) || this._pfImploding) continue;
            const t = (this._pfProxTimers.get(w) ?? 0) + PF_PROX_INTERVAL;
            if (t >= PF_CONTACT_DELAY) {
                this._pfProxTimers.delete(w);
                this._applyPF(w);
            } else {
                this._pfProxTimers.set(w, t);
            }
        }
    }

    private _startPFCascade(): void {
        if (this._pfImploding) return;
        if (this.state === GameState.GameOver) return;
        this._pfImploding = true;
        const toImplode = [...this._pfOrder].reverse();
        let delay = 0;
        for (const w of toImplode) {
            this.scheduleOnce(() => this._implodePFWarrior(w), delay);
            delay += 0.12;
        }
    }

    private _implodePFWarrior(w: Warrior): void {
        if (!w.node?.isValid || !this._pfActive.has(w)) return;
        this._cleanupPF(w);
        const pts = Math.round(8 * this.currentRound * this._pfImplodeK);
        this.score += pts;
        this.updateScoreLabel();
        this.updateRoundProgress();
        const wx  = w.node.position.x;
        const wyC = this.coords.physToVisual(w.node.position.y);
        this.vfx.spawnFloatingScore(wx, wyC, pts);
        this._pfImplodeK += 1.5;
        const mapper = w.mapper;
        const finish = () => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
            this._logOnTrack('pf-implode');
            this.checkTrackClearedBonus(wx, wyC);
        };
        if (mapper?.node?.isValid) {
            Tween.stopAllByTarget(mapper);
            tween(mapper)
                .to(0.10, { animScale: 1.5 }, { easing: 'quadOut' })
                .to(0.20, { animScale: 0.0 }, { easing: 'quadIn' })
                .call(finish)
                .start();
        } else {
            finish();
        }
    }

    private _playPFInfectAnim(w: Warrior): void {
        const mapper = w.mapper;
        if (!mapper?.node?.isValid) return;

        // Y hop via bounceY (PerspectiveMapper applica l'offset in lateUpdate)
        tween(mapper)
            .to(0.18, { bounceY: 35 }, { easing: 'quadOut' })
            .to(0.20, { bounceY: 0  }, { easing: 'quadIn'  })
            .start();

        // Squash-and-stretch sincronizzato col hop
        tween(mapper)
            .to(0.05, { animScale: 0.82, squashX: 1.22 })                           // squash (anticipo)
            .to(0.13, { animScale: 1.22, squashX: 0.86 })                           // stretch (salto)
            .to(0.08, { animScale: 0.88, squashX: 1.18 })                           // squash (atterraggio)
            .to(0.24, { animScale: 1.0,  squashX: 1.0  }, { easing: 'elasticOut' }) // settle
            .start();
    }

    // --- wildRiver sparkle ---

    private _cleanupWRS(w: Warrior): void {
        const wrs = this._wrsActive.get(w);
        if (wrs) { wrs.detach(); this._wrsActive.delete(w); }
        w.wildRiverSparkle = null;
        w.onWildRiverContact = null;
    }

    private _applyWRS(target: Warrior, source?: Warrior): void {
        if (this._wrsActive.has(target)) return;
        if (this._wrsImploding) return;
        if (target.isWRLauncher) return;
        if (!target.node?.isValid) return;
        if (DEBUG) console.log(`[WRS] contagio: src type=${source?.type ?? 'WR'} lv=${source?.level ?? '-'} → tgt type=${target.type} lv=${target.level}`);
        const spreadFn = (s: Warrior, t: Warrior) => this._onWRSSpread(s, t);
        target.onWildRiverContact = spreadFn;
        const wrs = WildRiverSparkleEffect.attach(target);
        target.wildRiverSparkle = wrs;
        this._wrsActive.set(target, wrs);
        this._wrsOrder.push(target);
        wrs.onExpired = () => {
            target.wildRiverSparkle = null;
            if (target.onWildRiverContact === spreadFn) target.onWildRiverContact = null;
            this._wrsActive.delete(target);
        };
    }

    private _onWildRiverContact(source: Warrior, target: Warrior): void {
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (source === target) return;
        this._applyWRS(target, source);
    }

    private _onWRSSpread(source: Warrior, target: Warrior): void {
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (source === target || source.type !== target.type) return;
        this._applyWRS(target, source);
    }

    private _tickWRSProximity(): void {
        const inRange = new Map<Warrior, Warrior>(); // candidate → source WRS warrior

        for (const [wrsW] of this._wrsActive) {
            if (!wrsW.node?.isValid) continue;
            const pos = wrsW.node.position;
            for (const w of this.warriors) {
                if (w === wrsW || w.type !== wrsW.type || !w.node?.isValid) continue;
                if (this._wrsActive.has(w)) continue;
                const wp = w.node.position;
                const dx = pos.x - wp.x, dy = pos.y - wp.y;
                const threshold = wrsW.radius + w.radius + WRS_PROX_MARGIN * LAYOUT_SCALE;
                if (dx * dx + dy * dy <= threshold * threshold) {
                    if (!inRange.has(w)) inRange.set(w, wrsW);
                }
            }
        }

        for (const w of this._wrsProxTimers.keys()) {
            if (!inRange.has(w) || this._wrsActive.has(w)) this._wrsProxTimers.delete(w);
        }
        for (const [w, wrsW] of inRange) {
            if (this._wrsActive.has(w) || this._wrsImploding) continue;
            const t = (this._wrsProxTimers.get(w) ?? 0) + WRS_PROX_INTERVAL;
            if (t >= WRS_CONTACT_DELAY) {
                this._wrsProxTimers.delete(w);
                this._applyWRS(w, wrsW);
            } else {
                this._wrsProxTimers.set(w, t);
            }
        }
    }

    private _startWRSCascade(): void {
        if (this._wrsImploding) return;
        if (this.state === GameState.GameOver) return;
        this._wrsImploding = true;
        const toImplode = [...this._wrsOrder].reverse();
        let delay = 0;
        for (const w of toImplode) {
            this.scheduleOnce(() => this._implodeWarrior(w), delay);
            delay += 0.15;
        }
    }

    private _implodeWarrior(w: Warrior): void {
        if (!w.node?.isValid || !this._wrsActive.has(w)) return;
        this._cleanupWRS(w);
        this._wrsOrder = this._wrsOrder.filter(x => x !== w);
        this._wrsProxTimers.delete(w);
        const pts = Math.round(10 * this.currentRound * this._wrsImplodeK);
        this.score += pts;
        this.updateScoreLabel();
        const wx  = w.node.position.x;
        const wyC = this.coords.physToVisual(w.node.position.y);
        this.vfx.spawnFloatingScore(wx, wyC, pts);
        this._wrsImplodeK += 1.5;
        const mapper = w.mapper;
        const finish = () => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
            this._logOnTrack('wrs-implode');
            this.checkTrackClearedBonus(wx, wyC);
        };
        if (mapper?.node?.isValid) {
            Tween.stopAllByTarget(mapper);
            tween(mapper)
                .to(0.10, { animScale: 1.5 }, { easing: 'quadOut' })
                .to(0.20, { animScale: 0.0 }, { easing: 'quadIn' })
                .call(finish)
                .start();
        } else {
            finish();
        }
    }

    // --- aura powerup ---

    private _auraRangeForType(type: number): number {
        // Dragon (type 6, top of 7 species) = 160 px baseline; range scales quadratically
        // so lower species are sharply weaker:
        //   Frog≈2% Cat≈8% Chicken≈18% Wolf≈33% Eagle≈51% Lion≈73% Dragon=100%.
        const k = (type + 1) / WARRIORS.length;
        return AURA_REPEL_RANGE * k * k;
    }

    private _restoreAuraScales(): void {
        const targets = new Set<Warrior>([
            ...this._zapTargetEnergy.keys(),
            ...(this._auraWarrior ? [this._auraWarrior] : []),
        ]);
        for (const w of targets) {
            if (w.mapper && w.node?.isValid && Math.abs(w.mapper.animScale - 1.0) > 0.01) {
                tween(w.mapper).to(0.15, { animScale: 1.0 }, { easing: 'quadOut' }).start();
            }
        }
    }

    private _applyAuraRepel(dt: number): void {
        const src   = this._auraWarrior!;
        const sp    = src.node.position;
        const sx    = this.box2dLayer.scale.x;
        const sy    = this.box2dLayer.scale.y;
        const range = this._auraRangeForType(src.type) * LAYOUT_SCALE;
        const baseF = AURA_REPEL_FORCE * LAYOUT_SCALE * dt * FORCE_FPS_REF;  // normalize to 60 fps
        const canZap = src.type >= AURA_ZAP_MIN_TYPE;
        const toZap: Warrior[] = [];

        for (const w of this.warriors) {
            if (w === src || !w.node?.isValid || !w.crossedLine || w.merging) continue;
            const wp  = w.node.position;
            const dxL = wp.x - sp.x;
            const dyL = wp.y - sp.y;
            const dist = Math.sqrt((dxL * sx) ** 2 + (dyL * sy) ** 2);
            if (dist <= 0 || dist > range) {
                this._auraProxTimers.delete(w);
                continue;
            }
            const t   = 1 - dist / range;
            const f   = baseF * t;
            const len = Math.sqrt(dxL * dxL + dyL * dyL) || 1;
            w.applyForce(new Vec2(dxL / len * f, dyL / len * f));

            if (!canZap) continue;
            const elapsed = (this._auraProxTimers.get(w) ?? 0) + dt;
            if (elapsed >= AURA_ZAPP_HOLD) {
                toZap.push(w);
                this._auraProxTimers.delete(w);
            } else {
                this._auraProxTimers.set(w, elapsed);
            }
        }

        for (const w of toZap) this._zappWarrior(w);
    }

    private _zappWarrior(w: Warrior): void {
        if (!w.node?.isValid || w.merging) return;
        w.merging = true;
        w.forceStop();
        w.setDragMode(true);

        const wType   = w.type;
        const wEnergy = 1 << (w.level - 1);
        const x  = w.node.position.x;
        const yC = this.coords.physToVisual(w.node.position.y);

        const startSpark = () => {
            this.warriors = this.warriors.filter(ww => ww !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();

            if (!this.vfx.sparkleFrame || !this.warriorsLayer?.isValid) return;

            // Spark color from species
            const baseCol  = WARRIORS[wType]?.color;
            const sparkCol = baseCol ? new Color(baseCol.r, baseCol.g, baseCol.b, 255) : new Color(255, 220, 60, 255);

            const sparkSize = Math.round(120 * Math.pow(wEnergy, 0.35));
            const spark = new Node('ZappSpark');
            spark.setParent(this.warriorsLayer);
            spark.setPosition(x, yC, 0);
            spark.addComponent(UITransform).setContentSize(sparkSize, sparkSize);
            const sp = spark.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this.vfx.sparkleFrame;
            sp.color       = sparkCol;
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
            const sparkOp = spark.addComponent(UIOpacity);
            sparkOp.opacity = 230;
            // Twinkle: brightness flicker simulates star shimmer (additive blend makes it visually pop)
            tween(sparkOp)
                .repeatForever(tween<UIOpacity>()
                    .to(0.11, { opacity: 135 }, { easing: 'sineInOut' })
                    .to(0.11, { opacity: 230 }, { easing: 'sineInOut' }))
                .start();

            // Find target: same species, on track, not merging, highest Y (topmost)
            let target: Warrior | null = null;
            let maxY = -Infinity;
            for (const cand of this.warriors) {
                if (!cand.crossedLine || !cand.node?.isValid || cand.merging) continue;
                if (cand.type !== wType) continue;
                const cy = this.coords.physToVisual(cand.node.position.y);
                if (cy > maxY) { maxY = cy; target = cand; }
            }

            // Register energy + assign global stagger index; freeze timer on first spark of batch
            let sparkIdx = 0;
            if (target) {
                const wasEmpty = this._zapTargetEnergy.size === 0;
                const rec = this._zapTargetEnergy.get(target) ?? { energy: 0, count: 0 };
                rec.count++;
                this._zapTargetEnergy.set(target, rec);
                if (wasEmpty) {
                    GameManager._zapSparkGlobalIdx = 0;
                    if (!this.timerPaused) { this._zapTimerFrozen = true; this.setTimerPaused(true); }
                }
                sparkIdx = GameManager._zapSparkGlobalIdx++;
            }

            // Rise 150px, flash, then staggered fly — re-search target at fly time
            tween(spark)
                .by(0.9, { position: new Vec3(0, 150, 0) }, { easing: 'quadOut' })
                .call(() => {
                    if (!spark.isValid) return;
                    tween(spark)
                        .to(0.08, { scale: new Vec3(2.0, 2.0, 1) })
                        .to(0.07, { scale: new Vec3(1.0, 1.0, 1) })
                        .call(() => {
                            if (!spark.isValid) return;
                            if (target) {
                                const doFly = () => {
                                    if (!spark.isValid) { this._onSparkHit(target!, wEnergy); return; }
                                    // Re-search: if original target gone, redirect to best available
                                    const flyTarget = target!.node?.isValid
                                        ? target!
                                        : this._redirectSparkTarget(target!, wType);
                                    if (!flyTarget) { if (spark.isValid) spark.destroy(); return; }
                                    this._flySparkToTarget(spark, flyTarget, wEnergy);
                                };
                                // cumulative delay: gap(k)=0.5×0.6^k → sum = 1.25×(1−0.6^i)
                                const flyDelay = sparkIdx > 0 ? 1.25 * (1 - Math.pow(0.6, sparkIdx)) : 0;
                                if (flyDelay > 0) this.scheduleOnce(doFly, flyDelay);
                                else doFly();
                            } else {
                                tween(sparkOp)
                                    .to(0.3, { opacity: 0 })
                                    .call(() => { if (spark.isValid) spark.destroy(); })
                                    .start();
                            }
                        })
                        .start();
                })
                .start();
        };

        if (w.mapper) {
            tween(w.mapper)
                .to(0.06, { animScale: 1.5 }, { easing: 'quadOut' })
                .to(0.12, { animScale: 0.0 }, { easing: 'quadIn'  })
                .call(startSpark)
                .start();
        } else {
            startSpark();
        }
    }

    private _redirectSparkTarget(oldTarget: Warrior, wType: number): Warrior | null {
        // Decrement old target's pending count (it won't receive this spark)
        const oldRec = this._zapTargetEnergy.get(oldTarget);
        if (oldRec) {
            oldRec.count--;
            if (oldRec.count <= 0) {
                this._zapTargetEnergy.delete(oldTarget);
                if (this._zapTargetEnergy.size === 0 && this._zapTimerFrozen) {
                    this._zapTimerFrozen = false;
                    this.setTimerPaused(false);
                }
            }
        }
        // Find new best target
        let newTarget: Warrior | null = null;
        let maxY = -Infinity;
        for (const cand of this.warriors) {
            if (!cand.crossedLine || !cand.node?.isValid || cand.merging) continue;
            if (cand.type !== wType) continue;
            const cy = this.coords.physToVisual(cand.node.position.y);
            if (cy > maxY) { maxY = cy; newTarget = cand; }
        }
        if (newTarget) {
            const rec = this._zapTargetEnergy.get(newTarget) ?? { energy: 0, count: 0 };
            rec.count++;
            this._zapTargetEnergy.set(newTarget, rec);
        } else if (this._zapTargetEnergy.size === 0 && this._zapTimerFrozen) {
            this._zapTimerFrozen = false;
            this.setTimerPaused(false);
        }
        return newTarget;
    }

    private _flySparkToTarget(spark: Node, target: Warrior, energy: number): void {
        if (!this.warriorsLayer?.isValid) return;

        const sx = spark.position.x;
        const sy = spark.position.y;
        const tx = target.node.position.x;
        const ty = this.coords.physToVisual(target.node.position.y);

        const side = Math.random() < 0.5 ? 1 : -1;
        const midX = (sx + tx) / 2 + side * 55;
        const midY = Math.max(sy, ty) + 60;

        const dist   = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
        const flyDur = Math.min(1.2, Math.max(0.45, dist / 380));
        const half   = flyDur * 0.5;

        const sparkSprCol = spark.getComponent(Sprite)?.color ?? new Color(255, 220, 60, 255);
        const trailCol    = new Color(sparkSprCol.r, sparkSprCol.g, sparkSprCol.b, 180);

        let trailActive = true;
        const spawnTrailDot = () => {
            if (!trailActive || !spark.isValid || !this.warriorsLayer?.isValid) return;
            const dot = new Node('ZappTrail');
            dot.setParent(this.warriorsLayer);
            dot.setPosition(spark.position.x, spark.position.y, 0);
            dot.addComponent(UITransform).setContentSize(112, 112);
            const dsp = dot.addComponent(Sprite);
            dsp.sizeMode    = Sprite.SizeMode.CUSTOM;
            dsp.spriteFrame = this.vfx.sparkleFrame!;
            dsp.color       = trailCol;
            dsp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
            const dop = dot.addComponent(UIOpacity);
            dop.opacity = 150;
            tween(dop).to(0.22, { opacity: 0 }).call(() => { if (dot.isValid) dot.destroy(); }).start();
            this.scheduleOnce(spawnTrailDot, 0.06);
        };
        this.scheduleOnce(spawnTrailDot, 0.04);

        tween(spark)
            .to(half, { position: new Vec3(midX, midY, 0) }, { easing: 'quadOut' })
            .to(half, { position: new Vec3(tx, ty, 0) }, { easing: 'quadIn' })
            .call(() => {
                trailActive = false;
                this._onSparkHit(target, energy);
                if (spark.isValid) spark.destroy();
            })
            .start();
    }

    private _onSparkHit(target: Warrior, energy: number): void {
        const rec = this._zapTargetEnergy.get(target);
        if (!rec) return;

        // Yellow tint flash + visual hop
        if (target.node?.isValid) {
            const spr = target.viewNode?.getComponent(Sprite);
            if (spr) {
                const orig = spr.color.clone();
                spr.color = new Color(255, 240, 60, 255);
                this.scheduleOnce(() => { if (target.node?.isValid && spr.isValid) spr.color = orig; }, 0.14);
            }
            if (target.mapper) {
                tween(target.mapper)
                    .to(0.10, { bounceY: 28 }, { easing: 'quadOut' })
                    .to(0.16, { bounceY: 0  }, { easing: 'quadIn'  })
                    .start();
                // Scale pulse proportional to spark energy
                const scalePeak = 1.0 + 0.10 * Math.pow(energy, 0.35);
                tween(target.mapper)
                    .to(0.08, { animScale: scalePeak }, { easing: 'quadOut' })
                    .to(0.16, { animScale: 1.0       }, { easing: 'quadIn'  })
                    .start();
            }
        }

        // Zap score: 5 × round × 2^(level−1), assegnato all'impatto sul target
        if (target.node?.isValid) {
            const zapPts = 5 * this.currentRound * energy;
            this.score += zapPts;
            this.updateScoreLabel();
            const tx = target.node.position.x;
            const tyC = this.coords.physToVisual(target.node.position.y);
            this.vfx.spawnFloatingScore(tx, tyC, zapPts);
        }

        rec.energy += energy;
        rec.count--;

        if (rec.count <= 0) {
            this._zapTargetEnergy.delete(target);
            if (this._zapTargetEnergy.size === 0 && this._zapTimerFrozen) {
                this._zapTimerFrozen = false;
                this.setTimerPaused(false);
            }
            if (target.node?.isValid) this._evolveWarrior(target, rec.energy);
        }
    }

    private _evolveWarrior(target: Warrior, accEnergy: number): void {
        if (!target.node?.isValid) return;

        const aType      = target.type;
        const posX       = target.node.position.x;
        const posY       = target.node.position.y;
        const posYC      = this.coords.physToVisual(posY);
        const radius     = target.radius;
        const initLevel  = target.level;
        const initEnergy = 1 << (initLevel - 1);
        const finalLevel = Math.floor(Math.log2(initEnergy + accEnergy)) + 1;
        const maxLevel   = WARRIORS[aType]?.maxLevel ?? 7;

        this._cleanupWRS(target);
        this._cleanupPF(target);
        this.warriors = this.warriors.filter(w => w !== target);
        this.framesAboveLine.delete(target);
        this.framesBelowLine.delete(target);
        if (target.node.isValid) target.node.destroy();

        if (finalLevel > maxLevel) {
            const lvConf = LEVEL_CONFIG[maxLevel];
            const color  = lvConf?.vfxColor ?? new Color(255, 200, 50, 255);
            const tier   = Math.max(1, Math.min(3, maxLevel - 2)) as 1 | 2 | 3;
            const expSfx = finalLevel >= 7 ? SFX.EXPLOSION_3 : finalLevel >= 6 ? SFX.EXPLOSION_2 : SFX.EXPLOSION_1;
            AudioManager.instance.play(expSfx);
            this.vfx.screenShake(tier >= 3 ? 20 : tier >= 2 ? 14 : 8, 0.35);
            this.activateSlowmo(tier >= 3 ? 0.15 : tier >= 2 ? 0.25 : 0.40, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);
            this.vfx.spawnBlackhole(posX, posYC + radius * 0.9, radius, color, tier, maxLevel);
            this.vfx.spawnImplosionVFX(posX, posYC, color, tier / 3, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);
            const impDur = tier >= 3 ? 2.5 : tier >= 2 ? 2.0 : 1.5;
            this.implosionCenter    = new Vec2(posX, posY);
            this.implosionDuration  = impDur;
            this.implosionTimeLeft  = impDur;
            this.implosionPeakForce = (200 + tier * 60) * LAYOUT_SCALE;
            if (lvConf?.label) this.vfx.spawnExplosionLabel(posX, posYC + 10, lvConf.label, color);
            this._vibrate(120);
            const evoPts = 20 * this.currentRound * Math.max(0, finalLevel - initLevel);
            if (evoPts > 0) {
                this.score += evoPts;
                this.updateScoreLabel();
                this.vfx.spawnFloatingScore(posX, posYC + 40, evoPts);
            }
            if (WARRIORS[aType]?.type === 'dragon') this.scheduleOnce(() => this.triggerVictory(), 0.5);
            else this.checkTrackClearedBonus(posX, posYC);
            return;
        }

        const evoPts = 20 * this.currentRound * Math.max(0, finalLevel - initLevel);
        if (evoPts > 0) {
            this.score += evoPts;
            this.updateScoreLabel();
            this.updateRoundProgress();
            this.vfx.spawnFloatingScore(posX, posYC + 40, evoPts);
        }

        const evolved = Warrior.spawn(this.box2dLayer, this.warriorsLayer, aType, finalLevel, posX, posY);
        evolved.crossedLine = true;
        evolved.fired       = true;
        evolved.settle();
        evolved.onMergeReady = (x, y) => this.mergeWarriors(x, y);
        this.warriors.push(evolved);
        if (evolved.mapper) evolved.mapper.animScale = 0;
        evolved.playMergeInEffect(0.35);
        const sfxs = [SFX.MERGE_1, SFX.MERGE_2, SFX.MERGE_3, SFX.MERGE_4];
        AudioManager.instance.play(sfxs[Math.min(finalLevel - 2, sfxs.length - 1)]);
        this.vfx.flashMerge(evolved.mapper);
        // Bubble pop after flashMerge settles
        this.scheduleOnce(() => {
            if (!evolved.mapper?.node?.isValid) return;
            tween(evolved.mapper)
                .to(0.16, { animScale: 1.38 }, { easing: 'quadOut' })
                .to(0.11, { animScale: 0.88 }, { easing: 'quadIn'  })
                .to(0.09, { animScale: 1.05 })
                .to(0.07, { animScale: 1.0  })
                .start();
        }, 0.35);
        this._logOnTrack('aura-evolve');
    }

    private _checkFirstAura(w: Warrior): boolean {
        if (!AuraEffect.isEligible(w.type)) return false;
        if (this._firstLaunchSpecies.has(w.type)) return false;
        this._firstLaunchSpecies.add(w.type);
        if (DEBUG) console.log(`[AuraEffect] first appearance: type=${w.type}`);
        return true;
    }

    private checkTrackClearedBonus(x: number, yC: number): void {
        if (this._trackClearedBonusUsed) return;
        const onTrack = this.warriors.filter(w => w.crossedLine && w.node?.isValid);
        if (onTrack.length > 0) return;
        this._trackClearedBonusUsed = true;
        const bonus = 1000 * this.currentRound;
        this.score += bonus;
        this._trackBestSingle(bonus, `Track Cleared! ×${this.currentRound}`);
        this.updateScoreLabel();
        this.vfx.spawnTrackClearedBanner(x, yC, bonus);
        this._maybeScoreSlowmo(bonus);
    }

    private activateAfterInflightMerge(): void {
        if (this.state === GameState.GameOver || this.state === GameState.Paused) return;
        if (this.waitForSettling) {
            this.state = GameState.Settling;
        } else {
            this.activateWarrior(this.createWarrior());
        }
    }

    // --- HUD ---

    /** Double-tap on the ROUND HUD section toggles the debug panel (kept for standalone/playtest
     *  builds). Disabled on any portal submission build (CrazyGames / GameDistribution / Poki). */
    private _wireDebugPanelGesture(roundSec: Node): void {
        if (PORTAL !== 'none') return;
        roundSec.on(Node.EventType.TOUCH_END, () => {
            const now = Date.now();
            if (now - this._lastRoundTapAt < 350) {
                this._lastRoundTapAt = 0;
                this._toggleDebugPanel();
            } else {
                this._lastRoundTapAt = now;
            }
        }, this);
    }

    private _toggleDebugPanel(): void {
        if (this._debugPanelNode?.isValid) {
            this._debugPanelNode.destroy();
            this._debugPanelNode = null;
            return;
        }
        this._debugPanelNode = this._spawnDebugPanel();
    }

    private _spawnDebugPanel(): Node {
        const debugNode = new Node('DebugPanel');
        debugNode.setParent(this.uiLayer);
        const panel = debugNode.addComponent(DebugPanel);
        panel.layerScaleY = this.box2dLayer.scale.y;
        panel.init(this);
        return debugNode;
    }

    private initHud(): void {
        // Launch timer: editor node Track > LaunchTimer (Label inside). Position/scale are
        // editor-authoritative — code only updates the value and the colour (updateTimerLabel).
        this.timerLabel = this.track?.node.getChildByName('LaunchTimer')?.getComponentInChildren(Label) ?? null;
        if (this.timerLabel) this.timerLabel.string = String(LAUNCH_TIMER);

        const existingHud = this.uiLayer.getChildByName('HUD');
        if (existingHud) {
            this.scoreLabel      = existingHud.getChildByName('ScoreSec')  ?.getChildByName('ScoreValue')  ?.getComponent(Label) ?? null;
            this.roundLabel      = existingHud.getChildByName('RoundSec')  ?.getChildByName('RoundValue')  ?.getComponent(Label) ?? null;

            const versionLabel = existingHud.getChildByName('VersionSec')?.getChildByName('VersionValue')?.getComponent(Label);
            if (versionLabel) versionLabel.string = `v${VERSION}`;
            this.updateNextPreview();
            // Create ring nodes programmatically on existing HUD
            const roundSec = existingHud.getChildByName('RoundSec');
            if (roundSec) {
                this.roundProgressBar = roundSec.getChildByName('ProgressBar')
                    ?.getComponent(ProgressBar) ?? null;
                this._wireDebugPanelGesture(roundSec);
            }
            // Settings dialog is centralized in the Settings component on the Dialog node.
            // GameManager only supplies the game-specific pause/resume hooks.
            // Settings can live on any node under the Canvas (its own node, or an always-active one).
            this._settings = (this.uiLayer.parent ?? this.uiLayer).getComponentInChildren(Settings) ?? null;
            if (this._settings) {
                this._settings.canOpen      = () => this.state !== GameState.GameOver && this.state !== GameState.Paused;
                this._settings.onBeforeOpen = () => this._enterSettingsPause();
                this._settings.onAfterClose = () => this._exitSettingsPause();
                this._settings.onQuit       = () => { void this._withCommercialBreak(() => director.loadScene(MAIN_MENU_SCENE)); };
            }
            return;
        }
        const hud = new Node('HUD');
        hud.setParent(this.uiLayer);
        const vs = view.getVisibleSize();
        hud.addComponent(UITransform).setContentSize(vs.width, vs.height);
        const MH = 80;
        const MV = 40;

        // ── Top-left: SCORE ───────────────────────────────────────────────
        const scoreSec = this.makeCornerGroup(hud, 'ScoreSec', true, true, MH, MV);
        this.makeLabel(scoreSec, 'SCORE', 0, -12, 28, new Color(180, 180, 180, 255));
        this.scoreLabel = this.makeLabel(scoreSec, '0', 0, -56, 46, new Color(255, 220, 50, 255));
        this.scoreLabel.isBold = true;

        // ── Top-right: ROUND ──────────────────────────────────────────────
        const roundSec = this.makeCornerGroup(hud, 'RoundSec', false, true, MH, MV);
        this.makeLabel(roundSec, 'ROUND', 0, -12, 28, new Color(180, 180, 180, 255));
        this.roundLabel = this.makeLabel(roundSec, String(this.currentRound), 0, -56, 46, new Color(100, 200, 255, 255));
        this.roundLabel.isBold = true;
        this._wireDebugPanelGesture(roundSec);

        this.updateNextPreview();
        // Timer label comes from the editor node Track > LaunchTimer (resolved at the top of initHud).

        // ── Version (top-center) ─────────────────────────────────────────
        const verSec = new Node('VerSec');
        verSec.setParent(hud);
        verSec.addComponent(UITransform).setContentSize(1, 1);
        const vw = verSec.addComponent(Widget);
        vw.isAlignTop = true; vw.top = MV;
        vw.updateAlignment();
        this.makeLabel(verSec, `v${VERSION}`, 0, 0, 24, new Color(255, 255, 255, 210));
    }

    private makeCornerGroup(parent: Node, name: string, alignLeft: boolean, alignTop: boolean, marginH: number, marginV: number): Node {
        const node = new Node(name);
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(1, 1);
        const w = node.addComponent(Widget);
        if (alignLeft) { w.isAlignLeft   = true; w.left   = marginH; }
        else           { w.isAlignRight  = true; w.right  = marginH; }
        if (alignTop)  { w.isAlignTop    = true; w.top    = marginV; }
        else           { w.isAlignBottom = true; w.bottom = marginV; }
        w.updateAlignment();
        return node;
    }

    /** Public pause toggle (pause button / debug): show the PausePanel or resume. */
    togglePause(): void {
        if (this.state === GameState.GameOver) return;
        if (this.state === GameState.Paused) this._resumeFromPause();
        else this._enterPause();
    }

    /** Pause the game and fade the PausePanel in. Shared by the pause button and auto-pause. */
    private _enterPause(): void {
        if (this.state === GameState.Paused) return;
        this._enterSettingsPause();              // state=Paused, physics off, audio muted, input blocked
        if (this.pausePanel) this.pausePanel.open();
        else console.warn('[GameManager] PausePanel not found — paused without UI');
    }

    /** Resume from pause: close the panel (its onResume restores the game) or restore directly. */
    private _resumeFromPause(): void {
        if (this.pausePanel?.isOpen) this.pausePanel.close();  // close() → onResume → _exitSettingsPause
        else this._exitSettingsPause();
    }

    private _lastScoreTap = 0;

    /** Double-tap the SCORE value to replay the onboarding hints (QA + "replay tutorial" gesture).
     *  Disabled on any portal submission build (CrazyGames / GameDistribution / Poki). */
    private _wireOnboardingReplayTap(): void {
        if (PORTAL !== 'none') return;
        const node = this.scoreLabel?.node;
        if (!node) return;
        node.on(Node.EventType.TOUCH_END, () => {
            const now = Date.now();
            if (now - this._lastScoreTap < 350) { this._lastScoreTap = 0; this.onboarding?.replay(); }
            else this._lastScoreTap = now;
        }, this);
    }

    /** Resolve the modal panels (prefer the editor @property binding, else find by name under UILayer)
     *  and wire their buttons to the game-navigation hooks. */
    private _wirePanels(): void {
        if (!this.pausePanel)   this.pausePanel   = this.uiLayer.getComponentInChildren(PausePanel);
        if (!this.gameOverPanel || !this.victoryPanel) {
            for (const ep of this.uiLayer.getComponentsInChildren(EndPanel)) {
                if (/victor|win/i.test(ep.node.name)) { if (!this.victoryPanel)  this.victoryPanel  = ep; }
                else                                   { if (!this.gameOverPanel) this.gameOverPanel = ep; }
            }
        }
        // Every between-sessions navigation passes through a commercial break (no-op
        // on standalone builds). Never called during gameplay — Poki requirement.
        const reload = (): void => { void this._withCommercialBreak(() => director.loadScene(this.sceneName)); };
        const menu   = (): void => { void this._withCommercialBreak(() => director.loadScene(MAIN_MENU_SCENE)); };
        if (this.pausePanel) {
            this.pausePanel.onResume  = () => this._exitSettingsPause();
            this.pausePanel.onRestart = reload;
            this.pausePanel.onMenu    = menu;
        }
        // WIN / GAME OVER: single forward action. Sequence WIN/LOSE → LEADERBOARD (if on) → MENU.
        // Wait for the leaderboard prep (started at end-game, usually already done) so the name-entry
        // handoff is armed before navigating — capped at 3s so a slow/stuck network can't block it.
        const advance = async (): Promise<void> => {
            if (this._lbReady) {
                await Promise.race([this._lbReady, new Promise<void>(res => this.scheduleOnce(res, 3.0))]);
            }
            await this._withCommercialBreak(() => director.loadScene(LEADERBOARD_ENABLED ? RANKING_SCENE : MAIN_MENU_SCENE));
        };
        for (const ep of [this.gameOverPanel, this.victoryPanel]) {
            if (!ep) continue;
            ep.onContinue = () => { void advance(); };
        }
    }

    /** Run a commercial break between sessions (no-op on standalone builds), then continue.
     *  Audio is muted only when the ad actually starts (onAdStart) and unmuted unconditionally. */
    private async _withCommercialBreak(next: () => void): Promise<void> {
        try { await PortalProvider.get().commercialBreak(() => AudioManager.instance.muteForPause()); }
        finally {
            AudioManager.instance.unmuteForPause();
            next();
        }
    }

    /** Settings.onBeforeOpen hook — pause game, physics, audio and input while the dialog is up. */
    private _enterSettingsPause(): void {
        this._stateBeforePause = this.state;
        this.state = GameState.Paused;
        PhysicsSystem2D.instance.enable = false;
        AudioManager.instance.muteForPause();
        this.inputCtrl.blocked = true;
        PortalProvider.get().gameplayStop();
    }

    /** Settings.onAfterClose hook — resume everything paused by _enterSettingsPause. */
    private _exitSettingsPause(): void {
        this.state = this._stateBeforePause ?? GameState.Aiming;
        this._stateBeforePause = null;
        PhysicsSystem2D.instance.enable = true;
        AudioManager.instance.unmuteForPause();
        this.inputCtrl.blocked = false;
        // A resize that fired while the dialog was up (e.g. the Fullscreen toggle) froze us and/or left a
        // pending re-pin we deferred because physics was off. Now that physics is back on, re-pin the
        // warriors to the (Widget-)re-centred funnel before simulation resumes — no visible jump. We do NOT
        // rebuild walls here (it would free broadphase proxies and crash UpdatePairs while we move bodies);
        // the wall geometry is rebuilt safely at the next launch via the re-armed one-shot.
        if (this._resizeFrozen) {
            this._doUnfreeze();
        } else if (this._warriorFreezePos) {
            this._restoreWarriorLocalPos();
            this._warriorFreezePos = null;
        }
        if (this.state !== GameState.GameOver) PortalProvider.get().gameplayStart();
    }

    // ── Resumable state: save / restore / reset ──────────────────────────────

    private _powerupOf(w: Warrior | null): PowerupKind | null {
        if (!w?.node?.isValid) return null;
        if (this._auraWarrior === w) return 'aura';
        if (w.psychoForce != null) return 'psychoForce';
        if (this.wildRiverEnabled && this._launcherWildRiverEffect) return 'wildRiver';
        if (this._brotherhoodCarrier === w) return 'brotherhood';
        return null;
    }

    private _serializeSpawnLog(): [number, [number, number][]][] {
        const out: [number, [number, number][]][] = [];
        const log = this._spawnLog;
        if (!log || typeof log.forEach !== 'function') return out;
        log.forEach((m, r) => { out.push([r, m ? [...m] : []]); });
        return out;
    }

    private _deserializeSpawnLog(data: [number, [number, number][]][] | undefined): Map<number, Map<number, number>> {
        const out = new Map<number, Map<number, number>>();
        for (const [r, entries] of data ?? []) out.set(r, new Map(entries));
        return out;
    }

    /** Persist the full turn-start situation to localStorage. Called on every warrior activation. */
    private _saveSnapshot(): void {
        if (this.state === GameState.GameOver) return;
        // The snapshot is a non-critical side effect: it must NEVER bubble an error into the
        // game loop. The whole body (object construction included) is guarded.
        try {
            const launcher = this._activeLauncherWarrior;
            const snap: GameSnapshot = {
                version:     VERSION,
                score:       this.score,
                round:       this.currentRound,
                totalMerges: this.totalMerges,
                cooldowns:   { wr: this._wrCooldownLaunches, pf: this._pfCooldownLaunches, br: this._brCooldownLaunches, brMerges: this._brCooldownMerges },
                firstLaunchSpecies:    [...this._firstLaunchSpecies],
                trackClearedBonusUsed: this._trackClearedBonusUsed,
                bestSingle:  { score: this._bestSingleScore, desc: this._bestSingleScoreDesc },
                spawnLog:    this._serializeSpawnLog(),
                launcher: launcher?.node?.isValid
                    ? { type: launcher.type, level: launcher.level, powerup: this._powerupOf(launcher) }
                    : { type: this.spawnMgr.next.type, level: this.spawnMgr.next.level, powerup: null },
                nextPowerup: this._nextPowerup,
                next:        { type: this.spawnMgr.next.type, level: this.spawnMgr.next.level },
                warriors:    this.warriors
                    .filter(w => w.crossedLine && w !== launcher && w.node?.isValid)
                    .map(w => {
                        const s: WarriorSnap = { type: w.type, level: w.level, x: w.node.position.x, y: w.node.position.y };
                        if (this._auraWarrior === w) s.pu = 'aura';
                        return s;
                    }),
            };
            sys.localStorage.setItem(STATE_KEY, JSON.stringify(snap));
        } catch (e) {
            console.warn('[GameManager] snapshot save failed (ignored):', e);
        }
    }

    private _clearSnapshot(): void {
        try { sys.localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
    }

    private _reattachAura(w: Warrior): void {
        if (!w?.node?.isValid) return;
        this._auraEffect?.detach();
        this._auraEffect = AuraEffect.attach(w, this.vfx.auraFrame, this.vfx.sparkleFrame, this._auraRangeForType(w.type) * LAYOUT_SCALE);
        this._auraEffect.onExpired = () => { this._auraEffect?.detach(); this._restoreAuraScales(); this._auraWarrior = null; this._auraEffect = null; this._auraProxTimers.clear(); };
        this._auraEffect.startTimer();
        this._auraWarrior = w;
    }

    /** Rebuild the board from the saved snapshot. Returns false (→ fresh game) if none/invalid. */
    private _restoreSnapshot(): boolean {
        const raw = SafeStorage.get(STATE_KEY);
        if (!raw) return false;
        let snap: GameSnapshot;
        try { snap = JSON.parse(raw) as GameSnapshot; } catch { return false; }
        if (!snap || typeof snap.round !== 'number' || !snap.launcher || !snap.next) return false;

        try {
            this.currentRound  = Math.max(1, snap.round);
            this.totalMerges   = Math.max(0, snap.totalMerges ?? 0);
            this.score         = Math.max(0, snap.score ?? 0);
            this._scoreProxy.val = this.score;
            this._wrCooldownLaunches = snap.cooldowns?.wr ?? 0;
            this._pfCooldownLaunches = snap.cooldowns?.pf ?? 0;
            this._brCooldownLaunches = snap.cooldowns?.br ?? 0;
            this._brCooldownMerges   = snap.cooldowns?.brMerges ?? 0;
            this._firstLaunchSpecies    = new Set(snap.firstLaunchSpecies ?? []);
            this._trackClearedBonusUsed = !!snap.trackClearedBonusUsed;
            this._bestSingleScore       = snap.bestSingle?.score ?? 0;
            this._bestSingleScoreDesc   = snap.bestSingle?.desc ?? '';
            this._spawnLog              = this._deserializeSpawnLog(snap.spawnLog);

            this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
            this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
            // Re-arms the stability sampler started in start() with the restored round
            // (the scene has just reloaded — layout may still be settling here too).
            this._syncGoLineWhenStable(this.currentRound);

            // On-track warriors
            const created: Warrior[] = (snap.warriors ?? []).map(s => this.addDebugWarrior(s.type, s.level, s.x, s.y));

            const launcherPU = snap.launcher.powerup ?? null;

            // Re-attach residual aura to its on-track carrier (skip if the launcher also takes aura).
            if (launcherPU !== 'aura') {
                const auraIdx = (snap.warriors ?? []).findIndex(s => s.pu === 'aura');
                if (auraIdx >= 0 && created[auraIdx]?.node?.isValid) this._reattachAura(created[auraIdx]);
            }

            // Next-preview queue
            this.spawnMgr.setNext(snap.next.type, snap.next.level);

            // Launcher — spawned at the launch position, then activated with its powerup.
            const launcher = this.spawnMgr.spawnAt(snap.launcher.type, snap.launcher.level);
            if (launcher.mapper) launcher.mapper.animScale = 0;
            if (launcher.viewNode?.isValid) launcher.viewNode.setScale(0, 0, 1);
            this.warriors.push(launcher);
            this.nextLaunchWarrior = launcher;

            this._nextPowerup        = launcherPU;
            this._nextPowerupPending = launcherPU != null;
            this.activateWarrior(launcher); // applies launcherPU and re-saves the snapshot

            // _nextPowerup is consumed for the launcher above — restore the genuine pending value.
            this._nextPowerup = snap.nextPowerup ?? null;

            this.updateScoreLabel();
            this.updateRoundLabel();
            this.updateRoundProgress();
            this.updateNextPreview();
            this._updateNextPreviewPowerupGlow();
            this._saveSnapshot();
            console.log('[GameManager] state restored from snapshot');
            return true;
        } catch (e) {
            console.error('[GameManager] restore failed, starting fresh:', e);
            return false;
        }
    }

    // ── Unexpected-error dialog ──────────────────────────────────────────────

    private _handleRuntimeError(source: string, err?: unknown): void {
        if (this._errorDialogShown || this._errorSuppressed || this.state === GameState.GameOver) return;
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? 'unknown');
        this._lastErrorText = `[${source}] ${msg}`;
        // Persist the full stack so it can be retrieved later via localStorage.getItem('fw_last_error').
        try {
            const full = `[${source}] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
            sys.localStorage.setItem('fw_last_error', full);
        } catch { /* ignore */ }
        try { this._showErrorDialog(); }
        catch (e) { console.error('[GameManager] failed to show error dialog:', e); }
    }

    private _showErrorDialog(): void {
        if (this._errorDialogShown) return;
        this._errorDialogShown = true;

        // Freeze the game so the failing code path stops re-running every frame.
        if (this.state !== GameState.Paused) this._stateBeforePause = this.state;
        this.state = GameState.Paused;
        try { PhysicsSystem2D.instance.enable = false; } catch { /* ignore */ }
        if (this.inputCtrl) this.inputCtrl.blocked = true;

        const panel = new Node('ErrorPanel');
        panel.layer = this.uiLayer.layer;
        panel.setParent(this.uiLayer);
        panel.setSiblingIndex(this.uiLayer.children.length - 1); // top-most → receives touches first
        const bg = panel.addComponent(Graphics);
        const vs = view.getVisibleSize();
        bg.fillColor = new Color(0, 0, 0, 210);
        bg.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
        bg.fill();

        this.makeLabel(panel, 'Errore non previsto', 0, 150, 42, new Color(255, 90, 90, 255));
        this.makeLabel(panel, 'Qualcosa è andato storto durante il gioco.', 0, 104, 22, new Color(210, 210, 210, 255));

        // Show the actual error so it can be diagnosed.
        const det = this.makeLabel(panel, this._lastErrorText, 0, 40, 16, new Color(255, 175, 175, 255));
        det.overflow = Label.Overflow.RESIZE_HEIGHT;
        det.enableWrapText = true;
        det.getComponent(UITransform)?.setContentSize(600, 90);

        const contBtn = this._makeDialogButton(panel, 'CONTINUA', 0, -40, new Color(35, 110, 60, 255));
        const onCont = () => this._dismissErrorDialog();
        contBtn.on(Node.EventType.TOUCH_START, onCont, this);
        contBtn.on(Node.EventType.MOUSE_DOWN,  onCont, this);

        const restoreBtn = this._makeDialogButton(panel, 'RIPRISTINA', 0, -120, new Color(150, 80, 20, 255));
        const onRestore = () => {
            GameManager._pendingRestore = true;
            director.loadScene(this.sceneName);
        };
        restoreBtn.on(Node.EventType.TOUCH_START, onRestore, this);
        restoreBtn.on(Node.EventType.MOUSE_DOWN,  onRestore, this);

        this._errorPanel = panel;
    }

    private _dismissErrorDialog(): void {
        if (this._errorPanel?.isValid) this._errorPanel.destroy();
        this._errorPanel = null;
        this._errorDialogShown = false;
        this.state = this._stateBeforePause ?? GameState.Aiming;
        this._stateBeforePause = null;
        try { PhysicsSystem2D.instance.enable = true; } catch { /* ignore */ }
        if (this.inputCtrl) this.inputCtrl.blocked = false;
        // Brief grace period so a recurring error doesn't instantly re-pop the dialog.
        this._errorSuppressed = true;
        this.scheduleOnce(() => { this._errorSuppressed = false; }, 1.5);
    }

    private _makeDialogButton(parent: Node, text: string, x: number, y: number, color: Color): Node {
        const node = new Node(text);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        const w = 300, h = 64;
        node.addComponent(UITransform).setContentSize(w, h);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 170);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();
        const lbl = this.makeLabel(node, text, 0, 0, 30, new Color(255, 255, 255, 255));
        lbl.isBold = true;
        lbl.node.layer = node.layer;
        return node;
    }

    private _checkProximityMerge(dt: number): void {
        const activePairs = new Set<string>();

        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || !(a.launched || a.crossedLine) || a.merging || !a.onMergeReady) continue;
            for (let j = i + 1; j < this.warriors.length; j++) {
                const b = this.warriors[j];
                if (!b.node?.isValid || !(b.launched || b.crossedLine) || b.merging) continue;
                if (a.type !== b.type || a.level !== b.level) continue;
                const dx   = a.node.position.x - b.node.position.x;
                const dy   = a.node.position.y - b.node.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < (a.radius + b.radius) * 0.85) {
                    a.merging = true;
                    b.merging = true;
                    this._proximityTimers.clear();
                    a.onMergeReady(a, b);
                    return;
                }

                if (dist < (a.radius + b.radius) * 1.05) {
                    const uA = a.node.uuid, uB = b.node.uuid;
                    const key = uA < uB ? `${uA}|${uB}` : `${uB}|${uA}`;
                    activePairs.add(key);
                    const elapsed = (this._proximityTimers.get(key) ?? 0) + dt;
                    this._proximityTimers.set(key, elapsed);
                    if (elapsed >= 2.0) {
                        a.merging = true;
                        b.merging = true;
                        this._proximityTimers.delete(key);
                        a.onMergeReady(a, b);
                        return;
                    }
                }
            }
        }

        for (const key of this._proximityTimers.keys()) {
            if (!activePairs.has(key)) this._proximityTimers.delete(key);
        }
    }

    private _sortWarriorLayerByY(): void {
        const sorted = [...this.warriorsLayer.children]
            .sort((a, b) => b.worldPosition.y - a.worldPosition.y);
        sorted.forEach((child, i) => child.setSiblingIndex(i));
    }

    /** TEMP debug: purple dashed line on WarriorsLayer marking the real game-over threshold. */
    private _drawEndlineDebug(): void {
        if (!this.warriorsLayer?.isValid || !this.coords) return;
        if (!this._endlineDebugNode?.isValid) {
            const n = new Node('EndlineDebug');
            n.layer = this.warriorsLayer.layer;
            n.setParent(this.warriorsLayer);
            n.addComponent(Graphics);
            this._endlineDebugNode = n;
        }
        const g = this._endlineDebugNode.getComponent(Graphics)!;
        g.clear();
        g.lineWidth   = 5;
        g.strokeColor = new Color(190, 70, 255, 230); // purple
        const y = this.coords.physToVisual(this.gameOverLineLocal);
        const dash = 16, gap = 10;
        let x = -TRACK_W / 2;
        while (x < TRACK_W / 2) {
            g.moveTo(x, y);
            g.lineTo(Math.min(x + dash, TRACK_W / 2), y);
            x += dash + gap;
        }
        g.stroke();
        this._endlineDebugNode.setSiblingIndex(this.warriorsLayer.children.length - 1);
    }

    private _vibrate(ms: number): void {
        if (!Settings.vibrationEnabled || !sys.isBrowser) return;
        (navigator as any).vibrate?.(ms);
    }

    private tickTimer(dt: number): void {
        if (this.timerPaused) return;
        if (this.implosionCenter !== null) return; // freeze during blackhole explosion
        this.timerRemaining -= dt;
        this.updateTimerLabel();
        if (this.timerRemaining <= 0) {
            this.state = GameState.Inflight; // prevent re-entry before onWarriorLaunched fires
            this.inputCtrl.autoLaunch();
        }
    }

    private updateTimerLabel(): void {
        if (!this.timerLabel) return;
        const secs = Math.max(0, Math.ceil(this.timerRemaining));
        this.timerLabel.string = String(secs);
        this.timerLabel.color = secs <= 5
            ? new Color(255, 80, 80, 255)
            : new Color(200, 200, 200, 200);
        // With short round timers (≤5s total) a 5s threshold would tick for the whole
        // turn — restrict the tick to the final 2 seconds in that case.
        const tickFrom = launchTimerForRound(this.currentRound) <= 5 ? 2 : 5;
        if (secs <= tickFrom && secs > 0 && secs !== this._lastTickSec) {
            this._lastTickSec = secs;
            AudioManager.instance.play(SFX.TIMER_TICK);
        }
    }

    private _trackBestSingle(points: number, desc: string): void {
        if (points > this._bestSingleScore) {
            this._bestSingleScore = points;
            this._bestSingleScoreDesc = desc;
        }
    }

    private _recordSpawn(type: number, round: number): void {
        let rm = this._spawnLog.get(round);
        if (!rm) { rm = new Map(); this._spawnLog.set(round, rm); }
        rm.set(type, (rm.get(type) ?? 0) + 1);
    }

    private _logSpawnReport(): void {
        if (!DEBUG) return;
        const rounds = [...this._spawnLog.keys()].sort((a, b) => a - b);
        const totals = new Map<number, number>();
        const lines: string[] = ['[SpawnLog] ── Spawn report ──'];
        for (const r of rounds) {
            const rm = this._spawnLog.get(r)!;
            const parts: string[] = [];
            for (const [type, count] of [...rm.entries()].sort((a, b) => a[0] - b[0])) {
                const n = WARRIORS[type]?.name ?? `type${type}`;
                parts.push(`${n}×${count}`);
                totals.set(type, (totals.get(type) ?? 0) + count);
            }
            lines.push(`  Round ${r}: ${parts.join(', ')}`);
        }
        const totalParts = [...totals.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([type, count]) => `${WARRIORS[type]?.name ?? `type${type}`}×${count}`);
        lines.push(`  Total: ${totalParts.join(', ')}`);
        console.log(lines.join('\n'));
    }

    private updateScoreLabel(): void {
        if (!this.scoreLabel) return;
        const target = this.score;
        this._scoreTween?.stop();
        const delta = Math.abs(target - this._scoreProxy.val);
        const duration = Math.min(0.55, Math.max(0.15, delta / 2000));
        this._scoreTween = tween(this._scoreProxy)
            .to(duration, { val: target }, {
                easing: 'quadOut',
                onUpdate: (obj?: { val: number }) => {
                    if (this.scoreLabel && obj) this.scoreLabel.string = String(Math.round(obj.val));
                },
            })
            .call(() => {
                if (this.scoreLabel) this.scoreLabel.string = String(target);
                this._scoreTween = null;
            })
            .start();
    }

    /** GDD score tiers 5/6: a single huge score event slows time briefly. */
    private _maybeScoreSlowmo(points: number): void {
        if (this.state === GameState.GameOver || this.roundUpPause) return;
        if (points >= SCORE_TIER6_PTS)      this.activateSlowmo(0.5, 1.2);
        else if (points >= SCORE_TIER5_PTS) this.activateSlowmo(0.8, 0.9);
    }

    private activateSlowmo(scale: number, duration: number): void {
        if (this._slowmoTimer <= 0 || scale < this._slowmoScale) {
            this._slowmoScale = scale;
            director.getScheduler().setTimeScale(scale);
        }
        this._slowmoTimer = Math.max(this._slowmoTimer, duration);
    }

    private tickSlowmo(dt: number): void {
        if (this._slowmoTimer <= 0) return;
        this._slowmoTimer -= dt / this._slowmoScale; // dt is already scaled — convert to real time
        if (this._slowmoTimer <= 0) {
            this._slowmoTimer = 0;
            this._slowmoScale = 1.0;
            director.getScheduler().setTimeScale(1.0);
            AudioManager.instance.unduckMusic();
        }
    }

    private updateRoundLabel(): void {
        if (this.roundLabel) this.roundLabel.string = String(this.currentRound);
        this.updateRoundProgress();
    }

    private updateRoundProgress(): void {
        if (!this.roundProgressBar) return;
        const cur = this.currentRound;
        const prev = this._roundThreshold(cur - 1);
        const next = this._roundThreshold(cur);
        const factor = Math.max(0, Math.min(1, (this.totalMerges - prev) / (next - prev)));
        this.roundProgressBar.progress = factor;
    }

    // --- round progression ---

    private _roundThreshold(round: number): number {
        return (ROUND_THRESHOLDS[round] as number | undefined) ?? round * 20;
    }

    private checkRoundAdvance(): void {
        if (this.totalMerges >= this._roundThreshold(this.currentRound)) {
            this.advanceRound();
        }
    }

    private advanceRound(): void {
        this.currentRound++;
        this._trackClearedBonusUsed = false;
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.updateRoundLabel();
        this.roundUpPause = true;
        this.inputCtrl.freezeInput();
        AudioManager.instance.play(SFX.ROUND_UP);
        AudioManager.instance.duckMusicTo(0.15);
        this._slowmoTimer = 0;
        this._slowmoScale = 1.0;
        director.getScheduler().setTimeScale(1.0);
        // Defer physics freeze: the triggering merge's playMergeOutEffect (MERGE_OUT_DUR=0.12s)
        // changes rb.type=Static and queues body destruction — all must complete with physics
        // enabled, otherwise Box2D's m_moveBuffer holds stale proxies that crash UpdatePairs.
        this.scheduleOnce(() => {
            PhysicsSystem2D.instance.enable = false;
            this.showRoundUpBanner();
            // New species unlocked → game-over line steps down as part of the reward.
            // Runs inside the physics freeze: warriors are static while the line moves,
            // and a descending line can only GRANT crossings, never cause game over/malus.
            if (WARRIORS.some(w => w.introRound === this.currentRound)) {
                this._syncGoLineToRound(this.currentRound, true);
            }
            this.scheduleOnce(() => {
                PhysicsSystem2D.instance.enable = true;
                this.inputCtrl.unfreezeInput();
                this.roundUpPause = false;
                AudioManager.instance.unduckMusic();
            }, 2.16);
        }, 0.17);
    }


    // --- vortex implosion ---


    private applyVortexImplosion(dt: number): void {
        this.implosionTimeLeft -= dt;
        if (this.implosionTimeLeft <= 0) {
            this.implosionCenter = null;
            return;
        }

        // Curva a campana: 0 → picco a metà → 0, sempre inward
        const elapsed  = this.implosionDuration - this.implosionTimeLeft;
        const progress = Math.sin(Math.PI * elapsed / this.implosionDuration);
        const force    = this.implosionPeakForce * progress * dt * FORCE_FPS_REF;  // normalize to 60 fps

        const cx = this.implosionCenter!.x;
        const cy = this.implosionCenter!.y;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging || !w.crossedLine) continue;
            // Only pull warriors that are below the implosion center — they all get pulled upward
            if (w.node.position.y >= cy) continue;
            const dx = cx - w.node.position.x;
            const dy = cy - w.node.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            w.applyForce(new Vec2(nx * force, ny * force));
        }
    }

    private applyCohesion(dtScale: number): void {
        const COHESION_RANGE  = 120 * LAYOUT_SCALE;
        const COHESION_FORCE  = 12  * LAYOUT_SCALE * dtScale;
        const r1sq = ((LEVEL_CONFIG[1]?.radius ?? 20) * LAYOUT_SCALE) ** 2;
        const sx = this.box2dLayer.scale.x;
        const sy = this.box2dLayer.scale.y;

        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || a.merging || !a.crossedLine) continue;
            for (let j = i + 1; j < this.warriors.length; j++) {
                const b = this.warriors[j];
                if (!b.node?.isValid || b.merging || !b.crossedLine) continue;
                // Convert to canvas space for gap comparison (radius and COHESION_RANGE are in canvas pixels)
                const dxL  = b.node.position.x - a.node.position.x;
                const dyL  = b.node.position.y - a.node.position.y;
                const dist = Math.sqrt((dxL * sx) ** 2 + (dyL * sy) ** 2);
                const gap  = Math.max(0, dist - a.radius - b.radius);
                if (gap <= 0 || gap > COHESION_RANGE) continue;
                const t    = 1 - gap / COHESION_RANGE;
                const f    = COHESION_FORCE * t;
                // Direction in local space for Box2D force application
                const len  = Math.sqrt(dxL * dxL + dyL * dyL) || 1;
                const nx   = dxL / len;
                const ny   = dyL / len;
                const msA  = (a.radius * a.radius) / r1sq;
                const msB  = (b.radius * b.radius) / r1sq;
                a.applyForce(new Vec2( nx * f * msA,  ny * f * msA));
                b.applyForce(new Vec2(-nx * f * msB, -ny * f * msB));
            }
        }
    }

    private showRoundUpBanner(): void {
        const newSpeciesIdx = WARRIORS.findIndex(w => w.introRound === this.currentRound);
        const silhouetteFrame = newSpeciesIdx >= 0
            ? WarriorSpriteCache.get(WARRIORS[newSpeciesIdx].type, 1)
            : null;
        this.vfx.showRoundUpBanner(this.currentRound, silhouetteFrame);
    }

    private updateNextPreview(animate = false): void {
        if (!this.nextPreviewNode?.isValid) return;
        const { type, level } = this.spawnMgr.next;
        const frame = WarriorSpriteCache.get(WARRIORS[type]?.type ?? '', level);

        if (!this.nextNextWarriorNode?.isValid) {
            const icon = new Node('NextWarrior');
            icon.setParent(this.nextPreviewNode);
            icon.addComponent(UITransform).setContentSize(100, 100);
            this.nextNextWarriorNode = icon;
        }
        const sp = this.nextNextWarriorNode.getComponent(Sprite) ?? this.nextNextWarriorNode.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame ?? null!;

        if (animate) {
            Tween.stopAllByTarget(this.nextNextWarriorNode);
            this.nextNextWarriorNode.setScale(0.05, 0.05, 1);
            tween(this.nextNextWarriorNode)
                .to(0.18, { scale: new Vec3(1.22, 1.22, 1) }, { easing: 'quadOut' })
                .to(0.08, { scale: new Vec3(0.93, 0.93, 1) })
                .to(0.07, { scale: new Vec3(1.0,  1.0,  1) })
                .start();
        }

        this._updateNextPreviewPowerupGlow();
    }

    private _updateNextPreviewPowerupGlow(): void {
        if (!this.nextNextWarriorNode?.isValid) return;

        let powerup: 'aura' | 'psychoForce' | 'wildRiver' | 'brotherhood' | null = this._nextPowerup;
        if (!powerup && this.wildRiverEnabled) powerup = 'wildRiver';
        if (!powerup && this._brCooldownLaunches === 0 && this._brCooldownMerges === 0 && !this._brotherhoodCarrier) {
            const onTrack = this.warriors.filter(w => w.crossedLine && w.node?.isValid).length;
            if (onTrack >= 25) powerup = 'brotherhood';
        }

        if (!powerup) {
            if (this._nextPreviewGlowNode?.isValid) {
                const op = this._nextPreviewGlowNode.getComponent(UIOpacity)!;
                Tween.stopAllByTarget(op);
                tween(op).to(0.2, { opacity: 0 }).start();
            }
            return;
        }

        if (!this._nextPreviewGlowNode?.isValid) {
            const n = new Node('NextPowerupGlow');
            n.setParent(this.nextNextWarriorNode);
            n.setSiblingIndex(0);
            n.addComponent(UITransform).setContentSize(86, 86);
            const s = n.addComponent(Sprite);
            s.sizeMode    = Sprite.SizeMode.CUSTOM;
            s.spriteFrame = this.vfx.auraFrame;
            s.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] },
            });
            const op = n.addComponent(UIOpacity);
            op.opacity = 0;
            this._nextPreviewGlowNode = n;
        }

        const glowSp = this._nextPreviewGlowNode.getComponent(Sprite)!;
        const glowOp = this._nextPreviewGlowNode.getComponent(UIOpacity)!;
        glowSp.color  = powerup === 'aura'        ? new Color(255, 200, 50,  255) :
                        powerup === 'psychoForce'  ? new Color(60,  230, 255, 255) :
                        powerup === 'wildRiver'    ? new Color(220,  60,  60, 255) :
                                                    new Color(180,  60, 240, 255); // brotherhood
        Tween.stopAllByTarget(glowOp);
        tween(glowOp)
            .to(0.3, { opacity: 160 }, { easing: 'quadOut' })
            .to(0.6, { opacity: 70  })
            .to(0.6, { opacity: 160 })
            .union()
            .repeatForever()
            .start();
    }

    private animateNextTransition(): void {
        // Zoom-in warrior at launcher (deferred one frame — nextLaunchWarrior set after spawnNext returns)
        this.scheduleOnce(() => {
            const w = this.nextLaunchWarrior;
            if (!w?.node?.isValid || !w.mapper) return;
            w.mapper.animScale = 0;
            AudioManager.instance.play(SFX.SPAWN, 0.8);
            tween(w.mapper)
                .to(0.18, { animScale: 1.2 }, { easing: 'quadOut' })
                .to(0.08, { animScale: 0.9 })
                .to(0.06, { animScale: 1.0 })
                .call(() => { if (this.nextLaunchWarrior === w) this.nextLaunchWarrior = null; })
                .start();
        }, 0);

        if (this.nextNextWarriorNode?.isValid) {
            Tween.stopAllByTarget(this.nextNextWarriorNode);
            tween(this.nextNextWarriorNode)
                .to(0.12, { scale: new Vec3(0, 0, 1) }, { easing: 'quadIn' })
                .delay(0.18)
                .call(() => this.updateNextPreview(true))
                .start();
        } else {
            this.scheduleOnce(() => this.updateNextPreview(true), 0.30);
        }
    }

    private makeLabel(parent: Node, text: string, x: number, y: number, fontSize: number, color: Color): Label {
        const node = new Node(text);
        node.setParent(parent);
        node.setPosition(x, y);
        const lbl = node.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.color = color;
        lbl.enableOutline = true;
        lbl.outlineColor  = new Color(0, 0, 0, 220);
        lbl.outlineWidth  = 2;
        return lbl;
    }

    // --- physics helpers ---

    private zSortWarriors(): void {
        [...this.warriors]
            .sort((a, b) => b.node.position.y - a.node.position.y)
            .forEach((w, i) => {
                w.node.setSiblingIndex(i);
                if (w.viewNode?.isValid) w.viewNode.setSiblingIndex(i);
            });
    }

    private applyUpwardDrift(dtScale: number): void {
        const force = UPWARD_DRIFT_BASE * LAYOUT_SCALE * dtScale;
        const r1sq  = ((LEVEL_CONFIG[1]?.radius ?? 20) * LAYOUT_SCALE) ** 2;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging || !w.crossedLine) continue;
            const massScale = (w.radius * w.radius) / r1sq;
            w.applyForce(new Vec2(0, force * massScale));
        }
    }

    private applyMagnetism(dtScale: number): void {
        const magnetGap   = MAGNET_GAP_BASE   * LAYOUT_SCALE;
        const magnetForce = MAGNET_FORCE_BASE  * LAYOUT_SCALE;
        const r1    = (LEVEL_CONFIG[1]?.radius ?? 20) * LAYOUT_SCALE;
        const r1sq  = r1 * r1;
        // box2dLayer has non-uniform scale (scaleY=0.5): node.position is local, not canvas.
        // Convert to canvas space for gap comparison (radius and magnetGap are in canvas pixels).
        // Force direction stays in local space since Box2D operates there.
        const sx = this.box2dLayer.scale.x;
        const sy = this.box2dLayer.scale.y;
        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || a.merging) continue;

            let nearestGap = Infinity;
            let nearest: Warrior | null = null;

            for (let j = 0; j < this.warriors.length; j++) {
                if (i === j) continue;
                const b = this.warriors[j];
                if (!b.node?.isValid || b.merging || b.type !== a.type || b.level !== a.level) continue;

                const dx = (b.node.position.x - a.node.position.x) * sx;
                const dy = (b.node.position.y - a.node.position.y) * sy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const gap = Math.max(0, dist - a.radius - b.radius);
                if (gap < magnetGap && gap < nearestGap) {
                    nearestGap = gap;
                    nearest = b;
                }
            }

            if (nearest) {
                const dir = new Vec2(
                    nearest.node.position.x - a.node.position.x,
                    nearest.node.position.y - a.node.position.y
                ).normalize();
                const t = 1 - (nearestGap / magnetGap);
                const massScale = (a.radius * a.radius) / r1sq;
                a.applyForce(dir.multiplyScalar(magnetForce * (1 + t * t * 8) * massScale * dtScale));
            }
        }
    }


    private _showLoadingSpinner(): Node {
        const spinner = new Node('LoadingSpinner');
        spinner.setParent(this.uiLayer);

        const arc = new Node('Arc');
        arc.setParent(spinner);
        const g = arc.addComponent(Graphics);
        g.lineWidth   = 8;
        g.strokeColor = new Color(255, 220, 50, 230);
        g.arc(0, 0, 36, 0, Math.PI * 1.5, false);
        g.stroke();

        const dot = new Node('Dot');
        dot.setParent(spinner);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = new Color(255, 220, 50, 230);
        dg.circle(0, -36, 5);
        dg.fill();

        const spin = () => {
            if (!arc.isValid) return;
            tween(arc).by(0.65, { angle: -360 }).call(spin).start();
            tween(dot).by(0.65, { angle: -360 }).start();
        };
        spin();
        return spinner;
    }

    private createDebugLabel(): Label {
        const node = new Node('DebugLabel');
        node.setParent(this.uiLayer);
        node.setPosition(-TRACK_W / 2 + 10, GAME_OVER_LINE_Y - 20);
        const label = node.addComponent(Label);
        label.fontSize = 18;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.color = new Color(255, 220, 0, 255);
        return label;
    }

    private updateDebugLabel(): void {
        if (!this.debugLabel) return;
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        const moving = inPlay.filter(w => w.velocity.length() >= SETTLE_VELOCITY).length;
        const angleDeg = this.inputCtrl.aimAngleDeg;
        const angleStr = (angleDeg >= 0 ? '+' : '') + angleDeg + '°';
        this.debugLabel.string = `state: ${GameState[this.state]}  moving: ${moving}/${inPlay.length}  angle: ${angleStr}  force: ${this.inputCtrl.aimForcePct}%`;
    }
}
