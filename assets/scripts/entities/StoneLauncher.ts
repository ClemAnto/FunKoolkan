import { _decorator, Component, Node, Vec2, Vec3, UITransform, input, Input, EventTouch, EventMouse, CCFloat, CCInteger, Prefab, Graphics, Color, instantiate } from 'cc';
import { Stone } from './Stone';
import { Rune } from './Rune';
import { ArenaBounds } from './ArenaBounds';
import { projectX, projectY, sizeXFactor, unprojectX, unprojectY } from '../config/Perspective';

const { ccclass, property } = _decorator;

const MAX_AIM_ANGLE = 67.5 * Math.PI / 180;   // aim cone from straight-up (±75% toward horizontal)
const SIM_DT = 1 / 60;
const SIM_MAX_STEPS = 600;
const SIM_MIN_SPEED = 10;
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
 * Stone launcher anchored entirely at the launcher node. The launcher's position drives:
 *  - the spawn point of the launched stone,
 *  - the trajectory preview origin,
 *  - the launch direction (SLINGSHOT: opposite the pull — drag away from the target, release toward it, ±110° cone).
 * Power ∝ pull distance (launcher → touch). The StoneLauncherArm follows the shot direction.
 *
 * Everything is computed in arena-local space (the launcher is a child of Arena); the spawn
 * point is de-projected via unprojectX/unprojectY and the launch/preview velocity via _groundDir
 * (the inverse-map direction at the launcher — the homography couples X and Y). The preview
 * integrates the SAME physics as the launched stone (damping/restitution/friction), so it tracks reality.
 */
@ccclass('StoneLauncher')
export class StoneLauncher extends Component {
    @property({ type: Node, tooltip: 'Arena container (stones spawn as its children; the preview lives here too).' })
    arena: Node | null = null;
    @property({ type: Node, tooltip: 'WarriorsLayer where the stone sprites are placed.' })
    warriorsLayer: Node | null = null;
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

    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Stone restitution (mixed with the wall as max()).' })
    stoneRestitution = 0.04;
    @property({ type: CCFloat, slide: true, range: [0, 1, 0.01], tooltip: 'Stone friction (mixed with the wall as sqrt()).' })
    stoneFriction = 0.3;
    @property({ type: CCFloat, slide: true, range: [0, 5, 0.05], tooltip: 'Stone linear damping.' })
    stoneDamping = 0.5;
    @property({ tooltip: 'Debug: draw a flat ellipse + rotation radius on each launched stone.' })
    debugStones = false;

    @property({ type: Node, tooltip: 'NEXT preview container — a Rune prefab is instantiated here to show the upcoming gem.' })
    nextPreview: Node | null = null;
    @property({ type: CCInteger, tooltip: 'Number of gem types (random pick per launch).' })
    numGemTypes = 2;
    @property({ type: CCFloat, tooltip: 'Scale of the rune shown in the NEXT preview.' })
    nextPreviewScale = 0.6;

    private _aiming = false;
    private _currentType = 0;          // gem type that fires on the next release
    private _nextType = 0;             // gem type shown in the NEXT preview
    private _nextRune: Rune | null = null;
    private _cur = new Vec2();         // current touch, UI coords
    private _preview: Graphics | null = null;
    private _segs: Seg[] | null = null;
    private _segsSrc: readonly Vec2[] | null = null;   // boundaryPhysics ref the cache was built from
    private _path: Vec2[] = [];
    private _trajPhase = 0;
    private _dotColor = new Color(120, 220, 255, 200);   // reused in _drawDots (no per-frame alloc)

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

    start(): void {
        this._currentType = this._randomType();
        this._nextType = this._randomType();
        this._buildNextPreview();
    }

    private _randomType(): number { return Math.floor(Math.random() * Math.max(1, this.numGemTypes)); }

    /** Instantiate a static Rune (once) in the NEXT container and show the upcoming gem type.
     *  Keeps any existing children (e.g. a frame) — only adds the rune. */
    private _buildNextPreview(): void {
        if (!this._nextRune?.isValid) {
            if (!this.nextPreview?.isValid || !this.runePrefab) return;
            const r = instantiate(this.runePrefab) as unknown as Node;
            r.setParent(this.nextPreview);
            r.setPosition(0, 0, 0);
            r.setScale(this.nextPreviewScale, this.nextPreviewScale, 1);
            this._nextRune = r.getComponent(Rune);
        }
        this._nextRune?.setType(this._nextType);
    }

    update(dt: number): void {
        if (!this._aiming) return;
        this._trajPhase = (this._trajPhase + 160 * dt) % 30;
        this._redraw();
    }

    private _onTouchStart(e: EventTouch): void { const p = e.getUILocation(); this._beginAim(p.x, p.y); }
    private _onTouchMove(e: EventTouch):  void { const p = e.getUILocation(); this._updateAim(p.x, p.y); }
    private _onTouchEnd(e: EventTouch):   void { const p = e.getUILocation(); this._release(p.x, p.y); }
    private _onCancel():                  void { this._abort(); }
    private _onMouseDown(e: EventMouse):  void { const p = e.getUILocation(); this._beginAim(p.x, p.y); }
    private _onMouseMove(e: EventMouse):  void { if (this._aiming) { const p = e.getUILocation(); this._updateAim(p.x, p.y); } }
    private _onMouseUp(e: EventMouse):    void { const p = e.getUILocation(); this._release(p.x, p.y); }

    private _beginAim(x: number, y: number): void { this._aiming = true; this._cur.set(x, y); this._resim(); }
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
            layer: this.warriorsLayer,
            viewPrefab: this.runePrefab,
            pos: this._spawnPhysics(),
            velocity: vel,
            radius: this.stoneRadius,
            viewScale: this.stoneViewScale,
            restitution: this.stoneRestitution,
            friction: this.stoneFriction,
            linearDamping: this.stoneDamping,
            gemType: this._currentType,
            name: 'LaunchedStone',
        });
        // advance the queue: NEXT becomes current, draw a new NEXT
        this._currentType = this._nextType;
        this._nextType = this._randomType();
        this._nextRune?.setType(this._nextType);
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

    /** Clamp a desired shot direction (visual, unit) into the ±110° cone from straight up. */
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
        const step = 30, dotR = 8;
        const col = this._dotColor;                 // reused; only alpha changes per dot
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
                    const t = dist / segLen;
                    col.a = Math.round(200 * (1 - (cum + dist) / total));
                    g.fillColor = col;
                    const py = fpy + (tpy - fpy) * t;   // depth at this dot
                    const rx = dotR * sizeXFactor(py);  // shrink with depth; 0.5 = ground tilt → flat disc
                    g.ellipse(fvx + ux * dist, fvy + uy * dist, rx, rx * 0.5);
                    g.fill();
                    dist += step;
                }
                phase = Math.max(0, dist - segLen);
                cum += segLen;
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
        this._preview = n.addComponent(Graphics);
        return this._preview;
    }

    private _clearPreview(): void { this._preview?.clear(); }
}
