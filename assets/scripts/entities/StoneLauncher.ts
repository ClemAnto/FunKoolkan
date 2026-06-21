import { _decorator, Component, Node, Vec2, Vec3, UITransform, input, Input, EventTouch, EventMouse, CCFloat, Prefab, Graphics, Color, instantiate } from 'cc';
import { Stone } from './Stone';
import { Rune } from './Rune';
import { ArenaBounds } from './ArenaBounds';
import { projectX, projectY, sizeXFactor, sizeYFactor, unprojectX, unprojectY } from '../config/Perspective';

const { ccclass, property } = _decorator;

const MAX_AIM_ANGLE = 67.5 * Math.PI / 180;   // aim cone from straight-up (±75% toward horizontal)
const SIM_DT = 1 / 60;
const SIM_MAX_STEPS = 6000;
const SIM_MIN_SPEED = 0.5;   // simulate further into the slow tail → longer, more visible trajectory
const SIM_REST_THRESHOLD = 20;
const SIM_RECORD_DIST = 18;
const _tmp = new Vec3();

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
 * _groundDir (the homography couples X and Y). The preview integrates the SAME physics as the launched
 * stone, so it tracks reality.
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

    @property({ type: [Color], tooltip: 'Trajectory-dot colour per gem type (index = gem type). Tune to match the gem art.' })
    gemColors: Color[] = [new Color(90, 210, 90), new Color(245, 210, 70), new Color(235, 80, 80)];   // green / yellow / red (gem_green/yellow/red)
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
    private _loadedType = 0;            // gem type resting on the launcher (fires on the next release)
    private _loadedRune: Rune | null = null;   // the stone resting on the launcher (about to fire)
    private _loadAnimT = 1;             // 0..1 progress within the current loaded phase
    private _loadPhase: 0 | 1 | 2 = 0;  // 0 settled, 1 pop-out, 2 pop-in
    private _loadArmed = false;         // in pop-in: hold until the load delay elapses (launch reload)
    private _loadDelayT = 0;            // s left before the armed loaded pop-in is released
    private _pendingLoadType = -1;      // gem type to show on the loaded once it has popped out (swap)
    private _cur = new Vec2();          // current touch, UI coords
    private _preview: Graphics | null = null;
    private _segs: Seg[] | null = null;
    private _segsSrc: readonly Vec2[] | null = null;   // boundaryPhysics ref the cache was built from
    private _path: Vec2[] = [];
    private _trajPhase = 0;
    private _dotColor = new Color(120, 220, 255, 200);   // reused in _drawDots (no per-frame alloc)

    /** True while the loaded stone's pop is running (the coordinator gates a swap on it). */
    get isLoadAnimating(): boolean { return this._loadPhase !== 0; }
    /** Gem type currently loaded (what fires next). */
    get loadedType(): number { return this._loadedType; }

    onEnable(): void {
        Stone.debugDraw = this.debugStones;
        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE,  this._onTouchMove,  this);
        input.on(Input.EventType.TOUCH_END,   this._onTouchEnd,   this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onCancel,    this);
        input.on(Input.EventType.MOUSE_DOWN,  this._onMouseDown,  this);
        input.on(Input.EventType.MOUSE_MOVE,  this._onMouseMove,  this);
        input.on(Input.EventType.MOUSE_UP,    this._onMouseUp,    this);
    }
    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE,  this._onTouchMove,  this);
        input.off(Input.EventType.TOUCH_END,   this._onTouchEnd,   this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onCancel,    this);
        input.off(Input.EventType.MOUSE_DOWN,  this._onMouseDown,  this);
        input.off(Input.EventType.MOUSE_MOVE,  this._onMouseMove,  this);
        input.off(Input.EventType.MOUSE_UP,    this._onMouseUp,    this);
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
        this._loadPhase = 2; this._loadAnimT = 0; this._loadArmed = true; this._loadDelayT = this.loadPopDelay;
        this._positionLoadedStone();   // collapse to scale 0 now (no 1-frame full-size flash)
    }

    /** Swap (tap on NEXT): pop the loaded OUT, reveal the swapped gem, pop straight back IN (no delay). */
    swapLoaded(newType: number): void {
        this._loadedType = newType;
        this._pendingLoadType = newType;   // revealed once the loaded has popped out
        this._loadPhase = 1; this._loadAnimT = 0; this._loadArmed = false;
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
        r.node.setPosition(lp.x, lp.y, 0);
        r.node.setScale(base * sizeXFactor(gy) * pop, base * sizeYFactor(gy) * pop, 1);
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
        this._updateLoadedPop(dt);
        this._positionLoadedStone();   // keep the resting stone glued to the launcher (survives resize)
        if (!this._aiming) return;
        this._trajPhase = (this._trajPhase + 160 * dt) % 30;
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
        if (this.onAimPress?.(x, y)) return;   // consumed by the coordinator (e.g. tap on NEXT → swap)
        this._aiming = true; this._cur.set(x, y); this._resim();
    }

    private _updateAim(x: number, y: number): void { if (!this._aiming) return; this._cur.set(x, y); this._resim(); }

    private _release(x: number, y: number): void {
        if (!this._aiming) return;
        this._aiming = false; this._path = [];
        this._clearPreview();
        if (this.launcherNode) this.launcherNode.angle = 0;
        if (!this.arena) return;
        const pull = this._pull(x, y);
        const len = Math.hypot(pull.x, pull.y);
        if (len < this.minDrag) return;
        const power = Math.min(len, this.maxDrag) / this.maxDrag;
        const eff = this._aimDir(-pull.x, -pull.y);   // slingshot: fire OPPOSITE the pull (visual dir)
        const vel = this._groundDir(eff.x, eff.y).multiplyScalar(this.launchSpeed * power);
        Stone.spawn({
            arena: this.arena,
            layer: this.stoneLayer,
            viewPrefab: this.runePrefab,
            pos: this._spawnPhysics(),
            velocity: vel,
            radius: this.stoneRadius,
            viewScale: this.stoneViewScale,
            restitution: this.stoneRestitution,
            friction: this.stoneFriction,
            linearDamping: this.stoneDamping,
            gemType: this._loadedType,
            name: 'LaunchedStone',
        });
        // The coordinator advances the queue and calls armReload()/next.reload() (collapses the loaded now).
        this.onLaunch?.(this._loadedType);
    }

    private _abort(): void { this._aiming = false; this._path = []; this._clearPreview(); if (this.launcherNode) this.launcherNode.angle = 0; }

    /** Recompute aim + trajectory from the CURRENT touch, relative to the launcher. */
    private _resim(): void {
        if (!this._aiming) return;
        const pull = this._pull(this._cur.x, this._cur.y);
        const len = Math.hypot(pull.x, pull.y);
        const eff = this._aimDir(-pull.x, -pull.y);   // slingshot: fire OPPOSITE the pull
        if (this.launcherNode) this.launcherNode.angle = -Math.atan2(eff.x, eff.y) * 180 / Math.PI * this.bowFollowFactor;
        const g = this._ensurePreview();
        if (!g) { return; }
        g.clear();
        if (len < this.minDrag) { this._path = []; return; }
        const power = Math.min(len, this.maxDrag) / this.maxDrag;
        const d0 = this._groundDir(eff.x, eff.y);
        this._path = this._simulate(this._spawnPhysics(), d0.multiplyScalar(this.launchSpeed * power));
        this._drawDots(g, this._path);
    }

    private _redraw(): void {
        const g = this._ensurePreview();
        if (!g) return;
        g.clear();
        if (this._path.length >= 2) this._drawDots(g, this._path);
    }

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
        const dampFactor = 1 / (1 + this.stoneDamping * SIM_DT);
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
        const tint = this.gemColors[this._loadedType];   // dots match the gem about to fire
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
                    col.a = Math.round(165 + 75 * (1 - (cum + dist) / maxLen));   // floor 165: the tail stays clearly visible
                    g.fillColor = col;
                    const py = fpy + (tpy - fpy) * t;   // depth at this dot
                    const rx = dotR * sizeXFactor(py);  // shrink with depth; 0.5 = ground tilt → flat disc
                    g.ellipse(fvx + ux * dist, fvy + uy * dist, rx, rx * 0.5);
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
