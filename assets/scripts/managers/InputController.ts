import { _decorator, Component, Input, input, EventTouch, EventMouse, Vec2, Node, Graphics, Color, sys, view, UITransform } from 'cc';
import { Warrior } from '../entities/Warrior';
import { LEVEL_CONFIG, WARRIORS } from '../data/WarriorConfig';
import { AudioManager, SFX } from './AudioManager';
const { ccclass } = _decorator;

// Base values at design width 720 — multiplied by _scale at runtime
const MIN_DRAG_BASE    = 20;
const MAX_DRAG_BASE    = 96;   // 3 × lv-1 diameter
const MAX_IMPULSE_BASE = 1150;
const CROSSBOW_ARM_W   = 72;   // design-px half-width of bow arms (= lv1r*4 = bowW/2)
const TRAJ_MAX_DIST    = 500; // design-px total trajectory length before cutoff
const TRAJ_DOT_STEP    = 16;   // design-px between trajectory dots
const TRAJ_DOT_R       = 10;  // design-px dot radius
const TRAJ_DOT_COLOR   = new Color(60, 180, 255);
const TRAJ_DOT_ALPHA_START = 200;
const TRAJ_DOT_ALPHA_END   = 0;


@ccclass('InputController')
export class InputController extends Component {
    onLaunch: ((warrior: Warrior, force: number) => void) | null = null;
    onTap:    ((warrior: Warrior) => void) | null = null;
    onAimStart: (() => void) | null = null;  // fired when a real aiming drag begins (onboarding hook)
    getWarriors: (() => readonly Warrior[]) | null = null;
    ropeParent: Node | null = null;
    launchEnabled = true;
    blocked = false;       // set true by DebugPanel while it owns a drag gesture
    showBounds = false;
    showRope   = false;
    initialScale = 1;

    aimAngleDeg = 0;
    aimForcePct = 0;

    private _scale = 1;
    private _lwA: Vec2 | null = null;
    private _lwB: Vec2 | null = null;
    private _rwA: Vec2 | null = null;
    private _rwB: Vec2 | null = null;

    private warrior: Warrior | null = null;
    private dragging: boolean = false;
    private rope: Graphics | null = null;
    private crossbowNode: Node | null = null;
    private launcherNode: Node | null = null;
    private lastTouchPos: Vec2 | null = null;
    private tapStartPos: Vec2 | null = null;
    private trajPhase = 0;
    private snapAnim: {
        elapsed: number; duration: number;
        la: Vec2; ra: Vec2; ctrl: Vec2; startAngle: number;
    } | null = null;

    relayout(scale?: number): void {
        if (scale !== undefined) this._scale = scale;
        if (this.launchEnabled) this.showCrossbowDefault();
    }

    setTrackBounds(lwA: Vec2, lwB: Vec2, rwA: Vec2, rwB: Vec2): void {
        this._lwA = lwA; this._lwB = lwB;
        this._rwA = rwA; this._rwB = rwB;
    }

    setWarrior(w: Warrior): void {
        this.snapAnim = null;
        this.warrior = w;
        this.dragging = false;
        this.lastTouchPos = null;
        this.aimAngleDeg = 0;
        this.aimForcePct = 0;
        if (this.crossbowNode) {
            const wp = this.crossbowNode.worldPosition;
            w.node.setWorldPosition(wp.x, wp.y * 2, 0);
        }
        this.ropeToTop();
        this.clearRope();
        if (this.launchEnabled) this.showCrossbowDefault();
    }

    clearWarrior(): void {
        this.warrior = null;
        this.dragging = false;
        this.clearRope();
        if (this.launcherNode) this.launcherNode.angle = 0;
    }

    freezeInput(): void {
        this.launchEnabled = false;
        this.dragging = false;
        this.clearRope();
        if (this.launcherNode) this.launcherNode.angle = 0;
    }

    unfreezeInput(): void {
        this.launchEnabled = true;
        if (this.warrior) this.showCrossbowDefault();
    }

    autoLaunch(): void {
        if (!this.warrior) return;
        this.dragging = false;
        this.clearRope();

        const wPos    = this.warriorPos();
        const minDrag = MIN_DRAG_BASE * this._scale;
        let dir: Vec2;

        if (this.lastTouchPos) {
            const drag = new Vec2(this.lastTouchPos.x - wPos.x, this.lastTouchPos.y - wPos.y);
            dir = drag.length() >= minDrag
                ? new Vec2(-drag.x, -drag.y).normalize()
                : new Vec2(0, 1);
        } else {
            dir = new Vec2(0, 1);
        }

        dir = this.clampLaunchDir(dir);
        const launched    = this.warrior;
        const halfImpulse = this.maxImpulse() * 0.5;
        this.warrior = null;
        this.lastTouchPos = null;
        launched.applyImpulse(dir.multiplyScalar(halfImpulse));
        this.onLaunch?.(launched, 0.5);
    }

    start() {
        this._scale = this.initialScale;
        const parent = this.ropeParent ?? this.node.parent!;

        const cbNode = parent.getChildByName('Crossbow');
        if (!cbNode) { console.warn('[InputController] Crossbow node not found — input disabled'); return; }
        this.crossbowNode = cbNode;

        this.launcherNode = cbNode.getChildByName('CrossbowLauncher');

        // Rope is a Graphics node the rope is drawn onto. Auto-create it if it's not in the scene,
        // so the scene doesn't have to carry it (matching the original local scale of 1, 0.5, 1).
        let ropeNode = cbNode.getChildByName('Rope');
        if (!ropeNode) {
            ropeNode = new Node('Rope');
            ropeNode.layer = cbNode.layer;
            ropeNode.setParent(cbNode);
            ropeNode.setScale(1, 0.5, 1);
            ropeNode.addComponent(Graphics);
        }
        this.rope = ropeNode.getComponent(Graphics);

        input.on(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
        input.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
        input.on(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
        input.on(Input.EventType.MOUSE_DOWN,   this.onMouseDown,   this);
        input.on(Input.EventType.MOUSE_MOVE,   this.onMouseMove,   this);
        input.on(Input.EventType.MOUSE_UP,     this.onMouseUp,     this);

    }

    update(dt: number): void {
        if (this.snapAnim) {
            this.snapAnim.elapsed += dt;
            const progress = Math.min(this.snapAnim.elapsed / this.snapAnim.duration, 1);
            this.drawRopeSnap(progress);
            if (progress >= 1) { this.snapAnim = null; this.clearRope(); }
            return;
        }

        if (this.dragging && this.lastTouchPos) {
            const step = TRAJ_DOT_STEP * this._scale;
            this.trajPhase = (this.trajPhase + 90 * this._scale * dt) % step;
            this.drawRope(this.lastTouchPos);
        } else {
            this.drawRopeDefault();
        }
        if (this.showBounds) this.drawDebugBounds();
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
        input.off(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
        input.off(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
        input.off(Input.EventType.MOUSE_DOWN,   this.onMouseDown,   this);
        input.off(Input.EventType.MOUSE_MOVE,   this.onMouseMove,   this);
        input.off(Input.EventType.MOUSE_UP,     this.onMouseUp,     this);
    }

    private onTouchStart(e: EventTouch): void { this.handleDragStart(this.toWorld(e.getUILocation())); }
    private onTouchMove(e: EventTouch):  void { this.handleDragMove(this.toWorld(e.getUILocation())); }
    private onTouchEnd(e: EventTouch):   void { this.handleDragEnd(this.toWorld(e.getUILocation())); }

    private onMouseDown(e: EventMouse):  void { this.handleDragStart(this.toWorld(e.getUILocation())); }
    private onMouseMove(e: EventMouse):  void { this.handleDragMove(this.toWorld(e.getUILocation())); }
    private onMouseUp(e: EventMouse):    void { this.handleDragEnd(this.toWorld(e.getUILocation())); }

    private handleDragStart(touch: Vec2): void {
        if (this.blocked || !this.warrior || this.dragging) return;
        if (!this.launchEnabled) {
            const wPos = this.warriorPos();
            const dx   = touch.x - wPos.x;
            const dy   = touch.y - wPos.y;
            const hitR = (this.warrior.radius + 20) * 2;
            if (Math.sqrt(dx * dx + dy * dy) <= hitR) this.tapStartPos = new Vec2(touch.x, touch.y);
            return;
        }
        if (this._isInsideTrack(touch)) {
            this.dragging = true;
            this.onAimStart?.();
            AudioManager.instance.play(SFX.DRAW, 0.7);
        }
    }

    private handleDragMove(touch: Vec2): void {
        if (this.blocked) { if (this.dragging) { this.dragging = false; this.clearRope(); } return; }
        if (!this.dragging || !this.warrior) return;
        this.lastTouchPos = touch;
        this.drawRope(touch);
    }

    private handleDragEnd(touch: Vec2): void {
        if (this.blocked) { this.dragging = false; this.clearRope(); return; }
        if (!this.launchEnabled && this.warrior && this.tapStartPos) {
            const dx = touch.x - this.tapStartPos.x;
            const dy = touch.y - this.tapStartPos.y;
            this.tapStartPos = null;
            if (Math.sqrt(dx * dx + dy * dy) < MIN_DRAG_BASE * this._scale) {
                this.onTap?.(this.warrior);
            }
            return;
        }
        this.tapStartPos = null;
        if (!this.dragging || !this.warrior) return;
        this.dragging = false;

        const wPos    = this.warriorPos();
        const drag    = new Vec2(touch.x - wPos.x, touch.y - wPos.y);
        const len     = drag.length();
        const minDrag = MIN_DRAG_BASE * this._scale;
        const maxDrag = MAX_DRAG_BASE * this._scale;

        if (len < minDrag) {
            this.showCrossbowDefault();
            return;
        }

        const t            = Math.min(len, maxDrag) / maxDrag;
        const dir          = this.clampLaunchDir(new Vec2(-drag.x, -drag.y).normalize());
        const effectiveDir = this._halfDir(dir);
        const impulse      = effectiveDir.multiplyScalar(t * this.maxImpulse());

        // Snap capture — all coords in Crossbow local space
        const uit    = this.launcherNode?.getComponent(UITransform);
        const armHW  = (uit ? uit.contentSize.width * 0.5 : CROSSBOW_ARM_W) * (this.launcherNode?.scale.x ?? 1);
        const perp   = new Vec2(-effectiveDir.y, effectiveDir.x);
        const lc     = this.launcherNode?.position ?? { x: 0, y: 0 };
        const la     = new Vec2(lc.x + perp.x * armHW, lc.y + perp.y * armHW);
        const ra     = new Vec2(lc.x - perp.x * armHW, lc.y - perp.y * armHW);
        const rawNx  = len > 0 ? drag.x / len : 0;
        const rawNy  = len > 0 ? drag.y / len : -1;
        const clamp  = Math.min(len, maxDrag);
        const ctrl   = this.worldToLocal(new Vec2(wPos.x + rawNx * clamp, wPos.y + rawNy * clamp));
        this.snapAnim = { elapsed: 0, duration: 0.22, la, ra, ctrl, startAngle: this.launcherNode?.angle ?? 0 };

        const launched = this.warrior;
        this.warrior = null;
        launched.applyImpulse(impulse);
        if (sys.isMobile) navigator.vibrate?.(18);
        this.onLaunch?.(launched, t);
    }

    private drawRope(touch: Vec2): void {
        if (!this.rope || !this.warrior) return;
        const wPos    = this.warriorPos();
        const dx      = touch.x - wPos.x;
        const dy      = touch.y - wPos.y;
        const rawLen  = Math.sqrt(dx * dx + dy * dy);
        const maxDrag = MAX_DRAG_BASE * this._scale;
        const len     = Math.min(rawLen, maxDrag);
        const t       = len / maxDrag;
        const nx      = rawLen > 0 ? dx / rawLen : 0;
        const ny      = rawLen > 0 ? dy / rawLen : -1;
        const launchDir  = this.clampLaunchDir(new Vec2(-nx, -ny));
        const effectiveDir = this._halfDir(launchDir);

        this.aimAngleDeg = Math.round(Math.atan2(effectiveDir.x, effectiveDir.y) * 180 / Math.PI);
        this.aimForcePct = Math.round(t * 100);

        if (this.launcherNode) {
            this.launcherNode.angle = -Math.atan2(effectiveDir.x, effectiveDir.y) * 180 / Math.PI;
        }

        const uit    = this.launcherNode?.getComponent(UITransform);
        const armHW  = (uit ? uit.contentSize.width * 0.5 : CROSSBOW_ARM_W) * (this.launcherNode?.scale.x ?? 1);
        const perp   = new Vec2(-effectiveDir.y, effectiveDir.x);
        const lc     = this.launcherNode?.position ?? { x: 0, y: 0 }; // launcher center in Crossbow-local
        const la     = new Vec2(lc.x + perp.x * armHW, lc.y + perp.y * armHW);
        const ra     = new Vec2(lc.x - perp.x * armHW, lc.y - perp.y * armHW);
        const dragPt = this.worldToLocal(new Vec2(wPos.x + nx * len, wPos.y + ny * len));

        this.rope.clear();
        this.rope.lineJoin = Graphics.LineJoin.ROUND;
        this.rope.lineCap  = Graphics.LineCap.ROUND;

        const drawString = (width: number, color: Color) => {
            this.rope!.lineWidth   = width;
            this.rope!.strokeColor = color;
            this.rope!.moveTo(la.x, la.y);
            this.rope!.quadraticCurveTo(dragPt.x, dragPt.y, ra.x, ra.y);
            this.rope!.stroke();
        };

        if (this.showRope) {
            drawString(7, new Color(55, 28, 8, 245));
            this.rope!.fillColor = new Color(55, 28, 8, 245);
            this.rope!.circle(la.x, la.y, 3.5); this.rope!.fill();
            this.rope!.circle(ra.x, ra.y, 3.5); this.rope!.fill();
        }

        if (rawLen >= MIN_DRAG_BASE * this._scale) {
            const startCp = this.crossbowNode?.position ?? this.warrior!.node.position;
            this.drawTrajectory(new Vec2(startCp.x, startCp.y), effectiveDir, t);
        }
    }

    private worldToLocal(world: Vec2): Vec2 {
        if (!this.crossbowNode) return new Vec2(world.x, world.y);
        const cp = this.crossbowNode.position;
        const cs = this.crossbowNode.scale;
        return new Vec2((world.x - cp.x) / cs.x, (world.y - cp.y) / cs.y);
    }

    private drawTrajectory(startW: Vec2, dir: Vec2, forcePct: number = 1): void {
        if (!this._lwA || !this._lwB || !this._rwA || !this._rwB) return;
        const g        = this.rope!;
        const step     = TRAJ_DOT_STEP * this._scale;
        const dotR     = TRAJ_DOT_R;
        const dotColor = WARRIORS[this.warrior?.type ?? 0]?.color ?? TRAJ_DOT_COLOR;

        // Simulate in canvas-centered world space — wall bounds are already in that space
        const lwA = this._lwA, lwB = this._lwB;
        const rwA = this._rwA, rwB = this._rwB;

        const lwDx = lwB.x - lwA.x; const lwDy = lwB.y - lwA.y;
        const rwDx = rwB.x - rwA.x; const rwDy = rwB.y - rwA.y;
        const lwNx = lwDy;  const lwNy = -lwDx; const lwMag = Math.sqrt(lwNx * lwNx + lwNy * lwNy);
        const rwNx = rwDy;  const rwNy = -rwDx; const rwMag = Math.sqrt(rwNx * rwNx + rwNy * rwNy);

        // Offset walls inward by warrior radius so the trajectory treats the warrior as a circle
        const radius = this.warrior?.radius ?? 0;
        const lwNu = lwNx / lwMag; const lwNv = lwNy / lwMag;
        const rwNu = rwNx / rwMag; const rwNv = rwNy / rwMag;
        const lwAr = new Vec2(lwA.x + radius * lwNu, lwA.y + radius * lwNv);
        const lwBr = new Vec2(lwB.x + radius * lwNu, lwB.y + radius * lwNv);
        const rwAr = new Vec2(rwA.x - radius * rwNu, rwA.y - radius * rwNv);
        const rwBr = new Vec2(rwB.x - radius * rwNu, rwB.y - radius * rwNv);

        // Top of track as hard stop (prevents ray disappearing on center shots)
        const trackTopY = lwB.y - radius;
        const warriors  = this.getWarriors?.() ?? [];

        const maxDist  = TRAJ_MAX_DIST * this._scale * forcePct;
        const segments: Array<[Vec2, Vec2]> = [];
        let p        = new Vec2(startW.x, startW.y);
        let d        = new Vec2(dir.x, dir.y);
        let traveled = 0;

        for (let bounce = 0; bounce <= 1; bounce++) {
            let minT = Infinity; let hitNx = 0; let hitNy = 0; let isStop = false;

            const tl = raySegT(p, d, lwAr, lwBr);
            if (tl < minT) { minT = tl; hitNx = lwNu; hitNy = lwNv; isStop = false; }

            const tr = raySegT(p, d, rwAr, rwBr);
            if (tr < minT) { minT = tr; hitNx = rwNu; hitNy = rwNv; isStop = false; }

            // Stop at track top when shooting upward
            if (d.y > 0.001) {
                const tt = (trackTopY - p.y) / d.y;
                if (tt > 0.001 && tt < minT) { minT = tt; isStop = true; }
            }

            // Stop on first warrior hit
            for (const w of warriors) {
                if (w === this.warrior || !w.node?.isValid) continue;
                const wc = w.node.position;
                const tw = rayCircleT(p, d, new Vec2(wc.x, wc.y), w.radius + this.warrior!.radius);
                if (tw < minT) { minT = tw; isStop = true; }
            }

            // Clamp to remaining budget
            const remaining = maxDist - traveled;
            if (minT === Infinity || minT > remaining) { minT = remaining; isStop = true; }

            const hitPt = new Vec2(p.x + d.x * minT, p.y + d.y * minT);
            segments.push([new Vec2(p.x, p.y), hitPt]);
            traveled += minT;
            if (isStop || bounce >= 1) break;

            const dot2 = 2 * (d.x * hitNx + d.y * hitNy);
            d = new Vec2(d.x - dot2 * hitNx, d.y - dot2 * hitNy);
            p = hitPt;
        }

        let totalLen = 0;
        for (const [from, to] of segments) {
            const ex = to.x - from.x; const ey = to.y - from.y;
            totalLen += Math.sqrt(ex * ex + ey * ey);
        }
        if (totalLen < 0.001) return;

        let cumDist = 0;
        let phase   = this.trajPhase;
        for (const [from, to] of segments) {
            const ex = to.x - from.x; const ey = to.y - from.y;
            const segLen = Math.sqrt(ex * ex + ey * ey);
            if (segLen < 0.001) continue;
            const ux = ex / segLen; const uy = ey / segLen;

            let dist = phase;
            while (dist < segLen) {
                const progress = (cumDist + dist) / totalLen;
                const alpha = Math.round(TRAJ_DOT_ALPHA_START * (1 - progress));
                g.fillColor = new Color(dotColor.r, dotColor.g, dotColor.b, alpha);
                // Convert world dot position to Crossbow-local for drawing
                const dotL = this.worldToLocal(new Vec2(from.x + ux * dist, from.y + uy * dist));
                g.ellipse(dotL.x, dotL.y, dotR, dotR * 2);
                g.fill();
                dist += step;
            }
            phase    = Math.max(0, dist - segLen);
            cumDist += segLen;
        }
    }

    private showCrossbowDefault(): void {
        if (!this.warrior) return;
    }

    private drawRopeDefault(): void {
        if (!this.rope || !this.launcherNode) return;
        if (!this.showRope) return;
        const uit   = this.launcherNode.getComponent(UITransform);
        const armHW = (uit ? uit.contentSize.width * 0.5 : CROSSBOW_ARM_W) * this.launcherNode.scale.x;
        const lp    = this.launcherNode.position;  // already in design space (local)
        const a     = (this.launcherNode.angle * Math.PI) / 180;
        const px    = -Math.cos(a);
        const py    = -Math.sin(a);
        const la    = new Vec2(lp.x + px * armHW, lp.y + py * armHW);
        const ra    = new Vec2(lp.x - px * armHW, lp.y - py * armHW);
        this.drawStringLine(la, ra);
    }

    private drawRopeSnap(progress: number): void {
        if (!this.rope || !this.snapAnim) return;
        if (!this.showRope) { return; }
        const { la, ra, ctrl } = this.snapAnim;  // all in design space
        const eased   = easeOutBack(progress, 0.25);
        const mid     = new Vec2((la.x + ra.x) * 0.5, (la.y + ra.y) * 0.5);
        const cx      = ctrl.x + (mid.x - ctrl.x) * eased;
        const cy      = ctrl.y + (mid.y - ctrl.y) * eased;

        this.rope.clear();
        this.rope.lineJoin = Graphics.LineJoin.ROUND;
        this.rope.lineCap  = Graphics.LineCap.ROUND;
        this.rope.lineWidth   = 7;   this.rope.strokeColor = new Color(55, 28, 8, 245);
        this.rope.moveTo(la.x, la.y); this.rope.quadraticCurveTo(cx, cy, ra.x, ra.y); this.rope.stroke();
        this.rope.fillColor = new Color(55, 28, 8, 245);
        this.rope.circle(la.x, la.y, 3.5); this.rope.fill();
        this.rope.circle(ra.x, ra.y, 3.5); this.rope.fill();
    }

    private drawDebugBounds(): void {
        if (!this.rope || !this._lwA || !this._lwB || !this._rwA || !this._rwB) return;
        const g = this.rope;
        const drawSeg = (a: Vec2, b: Vec2, c: Color) => {
            const la = this.worldToLocal(a);
            const lb = this.worldToLocal(b);
            g.lineWidth   = 6;
            g.strokeColor = c;
            g.moveTo(la.x, la.y);
            g.lineTo(lb.x, lb.y);
            g.stroke();
            g.fillColor = c;
            g.circle(la.x, la.y, 4); g.fill();
            g.circle(lb.x, lb.y, 4); g.fill();
        };
        drawSeg(this._lwA, this._lwB, new Color(255, 60, 60, 220));
        drawSeg(this._rwA, this._rwB, new Color(255, 60, 60, 220));
    }

    private drawStringLine(la: Vec2, ra: Vec2): void {
        if (!this.rope || !this.showRope) return;
        this.rope.clear();
        this.rope.lineJoin = Graphics.LineJoin.ROUND;
        this.rope.lineCap  = Graphics.LineCap.ROUND;
        this.rope.lineWidth   = 7;   this.rope.strokeColor = new Color(55, 28, 8, 245);
        this.rope.moveTo(la.x, la.y); this.rope.lineTo(ra.x, ra.y); this.rope.stroke();
        this.rope.fillColor = new Color(55, 28, 8, 245);
        this.rope.circle(la.x, la.y, 3.5); this.rope.fill();
        this.rope.circle(ra.x, ra.y, 3.5); this.rope.fill();
    }

    private ropeToTop(): void {
        if (this.rope?.node.parent)
            this.rope.node.setSiblingIndex(this.rope.node.parent.children.length - 1);
    }

    private clearRope(): void {
        this.rope?.clear();
    }

    private maxImpulse(): number {
        const lvl = this.warrior?.level ?? 1;
        const r1  = LEVEL_CONFIG[1]?.radius ?? 18;
        const r   = LEVEL_CONFIG[lvl]?.radius ?? r1;
        return MAX_IMPULSE_BASE * this._scale * Math.pow(r / r1, 2);
    }

    private clampLaunchDir(dir: Vec2): Vec2 {
        const MAX_ANGLE = 110 * Math.PI / 180;
        const angle   = Math.atan2(dir.x, dir.y);
        const clamped = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
        return new Vec2(Math.sin(clamped), Math.cos(clamped));
    }

    private _halfDir(dir: Vec2): Vec2 {
        const a = Math.atan2(dir.x, dir.y) * 0.5;
        return new Vec2(Math.sin(a), Math.cos(a));
    }

    private _isInsideTrack(touch: Vec2): boolean {
        const lwA = this._lwA, lwB = this._lwB;
        const rwA = this._rwA, rwB = this._rwB;
        if (!lwA || !lwB || !rwA || !rwB) return touch.y < 0;
        const t  = (touch.y - lwA.y) / (lwB.y - lwA.y);
        const lx = lwA.x + (lwB.x - lwA.x) * t;
        const rx = rwA.x + (rwB.x - rwA.x) * t;
        return touch.x >= lx && touch.x <= rx;
    }

    private toWorld(ui: Vec2): Vec2 {
        const vs = view.getVisibleSize();
        return new Vec2(ui.x - vs.width / 2, ui.y - vs.height / 2);
    }

    private warriorPos(): Vec2 {
        // Use crossbow canvas-centered position — independent of 2DBox transform
        if (this.crossbowNode) {
            const cp = this.crossbowNode.position;
            return new Vec2(cp.x, cp.y);
        }
        const p = this.warrior!.node.position;
        return new Vec2(p.x, p.y);
    }
}

/** Ray–circle intersection. Returns t > 0 where ray (origin + t*dir) first hits circle, or Infinity. */
/** Ease-out with overshoot. overshoot=0.25 → ~15% past target before settling. */
function easeOutBack(t: number, overshoot: number): number {
    const c1 = 1 + overshoot;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function rayCircleT(origin: Vec2, dir: Vec2, center: Vec2, radius: number): number {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const tca = ox * dir.x + oy * dir.y;
    const d2  = ox * ox + oy * oy - tca * tca;
    if (d2 > radius * radius) return Infinity;
    const thc = Math.sqrt(radius * radius - d2);
    const t   = tca - thc;
    return t > 0.001 ? t : Infinity;
}

/** Ray–segment intersection. Returns t >= 0 where ray (origin + t*dir) hits segment [a,b], or Infinity. */
function raySegT(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number {
    const sx = b.x - a.x; const sy = b.y - a.y;
    const nx = sy; const ny = -sx;
    const nDotD = nx * dir.x + ny * dir.y;
    if (Math.abs(nDotD) < 1e-6) return Infinity;
    const t = -(nx * (origin.x - a.x) + ny * (origin.y - a.y)) / nDotD;
    if (t <= 0.001) return Infinity;
    const hx = origin.x + t * dir.x - a.x;
    const hy = origin.y + t * dir.y - a.y;
    const s  = (sx * sx + sy * sy) > 0 ? (hx * sx + hy * sy) / (sx * sx + sy * sy) : 0;
    if (s < -0.01 || s > 1.01) return Infinity;
    return t;
}
