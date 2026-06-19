import { _decorator, Component, Node, Graphics, Label, Color, Vec2, Input, input, EventTouch, EventMouse, view } from 'cc';
import { Warrior } from '../entities/Warrior';
import { WARRIORS, LEVEL_CONFIG } from '../data/WarriorConfig';
import { GAME_OVER_LINE_Y, TRACK_W } from '../entities/Track';
const { ccclass } = _decorator;

const PANEL_SCALE = 1.5;  // visual scale applied to the whole panel node

// ── Panel geometry (world space, canvas 720×1280 centred at origin) ──
const CX         = 230;   // centre x — right side of track, portrait-visible (X:±360)
const PANEL_TOP  =  68;   // below HUD NEXT preview (which sits at y≈90)
const PANEL_BOT  = -416;
const PANEL_W    =  230;
const PANEL_HALF = PANEL_W / 2;

// Pause / Resume button
const BTN_PAUSE_Y = 42;
const BTN_PAUSE_W = 170;
const BTN_PAUSE_H = 26;

// Section dividers
const DIV1_Y = 12;   // PAUSE  ↔ ROUND
const DIV2_Y = -78;  // MERGES ↔ SAVE/LOAD/RESET
const DIV3_Y = -110; // SAVE   ↔ PALETTE
const DIV4_Y = -302; // PALETTE ↔ WIN

// WIN + WR + PF + AURA button row (four buttons)
const WIN_BTN_Y  = -322;
const WIN_BTN_H  =   26;
const WIN_BTN_W  =   58;
const WIN_CX     =  CX - 78;   // 152
const WR_BTN_W   =   43;
const WR_CX      =  CX - 23;   // 207
const WR_BTN_H   =  WIN_BTN_H;
const PF_BTN_W   =   43;
const PF_CX      =  CX + 32;   // 262
const PF_BTN_H   =  WIN_BTN_H;
const AURA_BTN_W =   43;
const AURA_CX    =  CX + 87;   // 317
const AURA_BTN_H =  WIN_BTN_H;

// BR (Brotherhood) button — second row below WIN/WR/PF/AURA
const BR_BTN_Y   = -356;
const BR_BTN_W   =  160;
const BR_BTN_H   =   26;
const BR_CX      =  CX;        // 230

// LOSE (instant game over) button — third row below BR
const LOSE_BTN_Y = -388;
const LOSE_BTN_W =  160;
const LOSE_BTN_H =   26;
const LOSE_CX    =  CX;        // 230

// Round row
const ROUND_LBL_Y  =   2;
const ROUND_ROW_Y  = -18;
const ROUND_BTN_W  =  26;
const ROUND_BTN_H  =  22;
const ROUND_BTN_GAP = 52;

// Merges row
const MERGE_LBL_Y  = -36;
const MERGE_ROW_Y  = -56;
const MERGE_BTN_W  =  26;
const MERGE_BTN_H  =  22;
const MERGE_BTN_GAP = 52;

// Save / Load / Reset buttons
const ACTION_Y   = -90;
const ACTION_W   =  48;
const ACTION_H   =  22;
const SAVE_X     = CX - 50;
const LOAD_X     = CX;
const RESET_X    = CX + 50;

// Palette
const PAL_TITLE_Y  = -118;
const PAL_START_Y  = -138;
const ICON_R       =   15;
const ICON_SPACING =   26;

// ── Interface exposed to GameManager ──

export interface IGameManagerDebug {
    isTimerPaused(): boolean;
    setTimerPaused(v: boolean): void;
    pauseGrabWarrior(w: Warrior): void;
    pauseDropWarrior(w: Warrior): void;
    getCurrentRound(): number;
    setDebugRound(r: number): void;
    getTotalMerges(): number;
    setTotalMerges(n: number): void;
    getWarriors(): readonly Warrior[];
    addDebugWarrior(type: number, level: number, x: number, y: number): Warrior;
    cycleDebugWarriorLevel(w: Warrior): void;
    saveDebugState(): void;
    loadDebugState(): void;
    resetDebugState(): void;
    setLauncherBlocked(v: boolean): void;
    debugWin(): void;
    debugLose(): void;
    toggleWildRiver(): void;
    isWildRiverEnabled(): boolean;
    activatePsychoForce(): void;
    activateAura(): void;
    activateBrotherhood(): void;
}

@ccclass('DebugPanel')
export class DebugPanel extends Component {
    layerScaleY = 1;  // box2dLayer.scale.y — warriors' local y = canvas y / layerScaleY
    private gm!: IGameManagerDebug;
    private bg!: Graphics;
    private pauseLbl!: Label;
    private roundLbl!: Label;
    private mergesLbl!: Label;
    private saveLbl!: Label;
    private loadLbl!: Label;
    private resetLbl!: Label;
    private pressedAction: 'save' | 'load' | 'reset' | null = null;
    private winPressed = false;
    private winLbl!: Label;
    private wrPressed  = false;
    private wrLbl!: Label;
    private pfPressed   = false;
    private pfLbl!:   Label;
    private auraPressed = false;
    private auraLbl!: Label;
    private brPressed   = false;
    private brLbl!:   Label;
    private losePressed = false;
    private loseLbl!: Label;
    private pauseFlash = false;
    private ghost: Node | null = null;
    private dragType = -1;
    private dragWarrior: Warrior | null = null;
    private pauseTouchWarrior: Warrior | null = null;
    private pauseTouchStart: Vec2 | null = null;
    private tapWarrior: Warrior | null = null;
    private tapStart: Vec2 | null = null;
    private inputCooldown = false;
    private _panelBlocking = false;

    init(gm: IGameManagerDebug): void {
        this.gm = gm;
        this.build();
        input.on(Input.EventType.TOUCH_START,  this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,  this);
        input.on(Input.EventType.TOUCH_END,    this.onTouchEnd,   this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,   this);
        input.on(Input.EventType.MOUSE_DOWN,   this.onMouseDown,  this);
        input.on(Input.EventType.MOUSE_MOVE,   this.onMouseMove,  this);
        input.on(Input.EventType.MOUSE_UP,     this.onMouseUp,    this);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START,  this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE,   this.onTouchMove,  this);
        input.off(Input.EventType.TOUCH_END,    this.onTouchEnd,   this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,   this);
        input.off(Input.EventType.MOUSE_DOWN,   this.onMouseDown,  this);
        input.off(Input.EventType.MOUSE_MOVE,   this.onMouseMove,  this);
        input.off(Input.EventType.MOUSE_UP,     this.onMouseUp,    this);
        if (this.dragWarrior) { this.gm.pauseDropWarrior(this.dragWarrior); this.dragWarrior = null; }
        this.pauseTouchWarrior = null; this.pauseTouchStart = null;
        if (this.ghost?.isValid) this.ghost.destroy();
    }

    // ── static UI build ──

    private build(): void {
        this.node.setScale(PANEL_SCALE, PANEL_SCALE, 1);
        this.bg = this.node.addComponent(Graphics);
        this.drawPanel();

        this.lbl('─ DEBUG ─', CX, PANEL_TOP - 14, 12, new Color(110, 110, 130, 200));

        // Pause / Resume
        this.pauseLbl = this.lbl(this.pauseText(), CX, BTN_PAUSE_Y, 14, this.pauseLblColor());

        // Round
        this.lbl('ROUND', CX, ROUND_LBL_Y, 11, new Color(150, 150, 170, 200));
        this.roundLbl = this.lbl(String(this.gm.getCurrentRound()), CX, ROUND_ROW_Y, 19, new Color(255, 220, 50, 255));
        this.lbl('−', CX - ROUND_BTN_GAP, ROUND_ROW_Y, 18, new Color(220, 220, 220, 230));
        this.lbl('+', CX + ROUND_BTN_GAP, ROUND_ROW_Y, 18, new Color(220, 220, 220, 230));

        // Merges
        this.lbl('MERGES', CX, MERGE_LBL_Y, 11, new Color(150, 150, 170, 200));
        this.mergesLbl = this.lbl(String(this.gm.getTotalMerges()), CX, MERGE_ROW_Y, 19, new Color(120, 220, 140, 255));
        this.lbl('−', CX - MERGE_BTN_GAP, MERGE_ROW_Y, 18, new Color(220, 220, 220, 230));
        this.lbl('+', CX + MERGE_BTN_GAP, MERGE_ROW_Y, 18, new Color(220, 220, 220, 230));

        // Save / Load / Reset
        this.saveLbl  = this.lbl('SAVE',  SAVE_X,  ACTION_Y, 12, new Color(200, 200, 200, 230));
        this.loadLbl  = this.lbl('LOAD',  LOAD_X,  ACTION_Y, 12, new Color(200, 200, 200, 230));
        this.resetLbl = this.lbl('RESET', RESET_X, ACTION_Y, 11, new Color(200, 200, 200, 230));

        // Palette
        this.lbl('PALETTE', CX, PAL_TITLE_Y, 11, new Color(110, 110, 130, 200));
        for (let t = 0; t < 7; t++) {
            const y = PAL_START_Y - t * ICON_SPACING;
            this.lbl('1',       CX,              y, 11, new Color(255, 255, 255, 210));
            this.lbl(String(t), CX + ICON_R + 12, y, 10, WARRIORS[t]?.color ?? new Color(200, 200, 200));
        }

        // WIN + WR + PF + AURA buttons
        this.winLbl  = this.lbl('🏆 WIN!', WIN_CX,  WIN_BTN_Y, 10, new Color(255, 220, 50, 255));
        this.wrLbl   = this.lbl('WR',      WR_CX,   WIN_BTN_Y, 13, new Color(200, 100, 255, 255));
        this.pfLbl   = this.lbl('PF',      PF_CX,   WIN_BTN_Y, 13, new Color(60, 220, 255, 255));
        this.auraLbl = this.lbl('AURA',    AURA_CX, WIN_BTN_Y, 11, new Color(255, 190, 40, 255));

        // BR button
        this.brLbl = this.lbl('⚡ BROTHERHOOD', BR_CX, BR_BTN_Y, 11, new Color(255, 60, 60, 255));

        // LOSE button (instant game over)
        this.loseLbl = this.lbl('💀 LOSE', LOSE_CX, LOSE_BTN_Y, 11, new Color(255, 120, 120, 255));
    }

    private drawPanel(): void {
        const g = this.bg;
        g.clear();

        // Background
        g.fillColor = new Color(15, 15, 28, 215);
        g.rect(CX - PANEL_HALF, PANEL_BOT, PANEL_W, PANEL_TOP - PANEL_BOT);
        g.fill();
        g.strokeColor = new Color(65, 65, 95, 160);
        g.lineWidth = 1;
        g.rect(CX - PANEL_HALF, PANEL_BOT, PANEL_W, PANEL_TOP - PANEL_BOT);
        g.stroke();

        // Section dividers
        for (const dy of [DIV1_Y, DIV2_Y, DIV3_Y, DIV4_Y]) {
            g.strokeColor = new Color(55, 55, 80, 130);
            g.lineWidth = 0.5;
            g.moveTo(CX - PANEL_HALF + 12, dy);
            g.lineTo(CX + PANEL_HALF - 12, dy);
            g.stroke();
        }

        // Pause / Resume button — amber+gold when active, dark when idle
        const paused = this.gm?.isTimerPaused() ?? false;
        if (this.pauseFlash) {
            g.fillColor   = new Color(255, 255, 255, 255);
            g.strokeColor = new Color(255, 255, 255, 255);
            g.lineWidth   = 2;
        } else if (paused) {
            g.fillColor   = new Color(200, 115, 0, 255);
            g.strokeColor = new Color(255, 200, 40, 255);
            g.lineWidth   = 2.5;
        } else {
            g.fillColor   = new Color(40, 40, 62, 230);
            g.strokeColor = new Color(88, 88, 118, 180);
            g.lineWidth   = 1;
        }
        g.rect(CX - BTN_PAUSE_W / 2, BTN_PAUSE_Y - BTN_PAUSE_H / 2, BTN_PAUSE_W, BTN_PAUSE_H);
        g.fill();
        g.rect(CX - BTN_PAUSE_W / 2, BTN_PAUSE_Y - BTN_PAUSE_H / 2, BTN_PAUSE_W, BTN_PAUSE_H);
        g.stroke();

        // Round −/+ buttons
        g.fillColor = new Color(45, 45, 75, 230);
        g.rect(CX - ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H);
        g.fill();
        g.rect(CX + ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H);
        g.fill();

        // Merges −/+ buttons
        g.rect(CX - MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H);
        g.fill();
        g.rect(CX + MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H);
        g.fill();

        // SAVE button (blue-ish)
        const savePressed  = this.pressedAction === 'save';
        g.fillColor = savePressed ? new Color(90, 160, 255, 255) : new Color(30, 70, 130, 230);
        g.rect(SAVE_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.fill();
        g.strokeColor = savePressed ? new Color(180, 220, 255, 255) : new Color(80, 140, 220, 180);
        g.lineWidth = savePressed ? 2 : 1;
        g.rect(SAVE_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.stroke();

        // LOAD button (green-ish)
        const loadPressed  = this.pressedAction === 'load';
        g.fillColor = loadPressed ? new Color(60, 210, 110, 255) : new Color(30, 100, 50, 230);
        g.rect(LOAD_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.fill();
        g.strokeColor = loadPressed ? new Color(160, 255, 200, 255) : new Color(80, 200, 120, 180);
        g.lineWidth = loadPressed ? 2 : 1;
        g.rect(LOAD_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.stroke();

        // RESET button (orange-ish)
        const resetPressed = this.pressedAction === 'reset';
        g.fillColor = resetPressed ? new Color(240, 150, 50, 255) : new Color(130, 70, 20, 230);
        g.rect(RESET_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.fill();
        g.strokeColor = resetPressed ? new Color(255, 210, 130, 255) : new Color(220, 140, 60, 180);
        g.lineWidth = resetPressed ? 2 : 1;
        g.rect(RESET_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.stroke();

        // WIN button
        g.fillColor   = this.winPressed ? new Color(255, 220, 50, 255) : new Color(80, 50, 10, 230);
        g.strokeColor = this.winPressed ? new Color(255, 255, 180, 255) : new Color(200, 150, 20, 200);
        g.lineWidth   = this.winPressed ? 2.5 : 1.5;
        g.rect(WIN_CX - WIN_BTN_W / 2, WIN_BTN_Y - WIN_BTN_H / 2, WIN_BTN_W, WIN_BTN_H);
        g.fill();
        g.rect(WIN_CX - WIN_BTN_W / 2, WIN_BTN_Y - WIN_BTN_H / 2, WIN_BTN_W, WIN_BTN_H);
        g.stroke();

        // WR toggle button (purple when on)
        const wrOn = this.gm?.isWildRiverEnabled() ?? false;
        g.fillColor   = wrOn ? new Color(120, 30, 180, 255) : new Color(40, 20, 70, 230);
        g.strokeColor = wrOn ? new Color(200, 100, 255, 255) : new Color(120, 60, 180, 180);
        g.lineWidth   = wrOn ? 2.5 : 1.5;
        g.rect(WR_CX - WR_BTN_W / 2, WIN_BTN_Y - WR_BTN_H / 2, WR_BTN_W, WR_BTN_H);
        g.fill();
        g.rect(WR_CX - WR_BTN_W / 2, WIN_BTN_Y - WR_BTN_H / 2, WR_BTN_W, WR_BTN_H);
        g.stroke();

        // PF button (cyan flash on press)
        g.fillColor   = this.pfPressed ? new Color(60, 220, 255, 255) : new Color(10, 55, 80, 230);
        g.strokeColor = this.pfPressed ? new Color(200, 255, 255, 255) : new Color(40, 180, 220, 180);
        g.lineWidth   = this.pfPressed ? 2.5 : 1.5;
        g.rect(PF_CX - PF_BTN_W / 2, WIN_BTN_Y - PF_BTN_H / 2, PF_BTN_W, PF_BTN_H);
        g.fill();
        g.rect(PF_CX - PF_BTN_W / 2, WIN_BTN_Y - PF_BTN_H / 2, PF_BTN_W, PF_BTN_H);
        g.stroke();

        // AURA button (orange flash on press)
        g.fillColor   = this.auraPressed ? new Color(255, 180, 30, 255) : new Color(80, 45, 5, 230);
        g.strokeColor = this.auraPressed ? new Color(255, 240, 160, 255) : new Color(200, 130, 20, 180);
        g.lineWidth   = this.auraPressed ? 2.5 : 1.5;
        g.rect(AURA_CX - AURA_BTN_W / 2, WIN_BTN_Y - AURA_BTN_H / 2, AURA_BTN_W, AURA_BTN_H);
        g.fill();
        g.rect(AURA_CX - AURA_BTN_W / 2, WIN_BTN_Y - AURA_BTN_H / 2, AURA_BTN_W, AURA_BTN_H);
        g.stroke();

        // BR (Brotherhood) button — red flash on press
        g.fillColor   = this.brPressed ? new Color(220, 30, 30, 255) : new Color(80, 10, 10, 230);
        g.strokeColor = this.brPressed ? new Color(255, 140, 140, 255) : new Color(180, 40, 40, 180);
        g.lineWidth   = this.brPressed ? 2.5 : 1.5;
        g.rect(BR_CX - BR_BTN_W / 2, BR_BTN_Y - BR_BTN_H / 2, BR_BTN_W, BR_BTN_H);
        g.fill();
        g.rect(BR_CX - BR_BTN_W / 2, BR_BTN_Y - BR_BTN_H / 2, BR_BTN_W, BR_BTN_H);
        g.stroke();

        // LOSE (instant game over) button — red flash on press
        g.fillColor   = this.losePressed ? new Color(220, 30, 30, 255) : new Color(70, 8, 8, 230);
        g.strokeColor = this.losePressed ? new Color(255, 140, 140, 255) : new Color(200, 60, 60, 180);
        g.lineWidth   = this.losePressed ? 2.5 : 1.5;
        g.rect(LOSE_CX - LOSE_BTN_W / 2, LOSE_BTN_Y - LOSE_BTN_H / 2, LOSE_BTN_W, LOSE_BTN_H);
        g.fill();
        g.rect(LOSE_CX - LOSE_BTN_W / 2, LOSE_BTN_Y - LOSE_BTN_H / 2, LOSE_BTN_W, LOSE_BTN_H);
        g.stroke();

        // Palette icons (7 types, level 1)
        for (let t = 0; t < 7; t++) {
            const y = PAL_START_Y - t * ICON_SPACING;
            const wc = WARRIORS[t]?.color ?? new Color(200, 200, 200);
            g.fillColor = new Color(wc.r, wc.g, wc.b, 210);
            g.circle(CX, y, ICON_R);
            g.fill();
            g.strokeColor = new Color(255, 255, 255, 110);
            g.lineWidth = 1.5;
            g.circle(CX, y, ICON_R);
            g.stroke();
        }
    }

    refresh(): void {
        this.drawPanel();
        this.pauseLbl.string  = this.pauseText();
        this.pauseLbl.color   = this.pauseLblColor();
        this.roundLbl.string  = String(this.gm.getCurrentRound());
        this.mergesLbl.string = String(this.gm.getTotalMerges());
    }

    private pauseText(): string {
        return this.gm?.isTimerPaused() ? '▶  RESUME' : '||  PAUSE';
    }

    private pauseLblColor(): Color {
        return this.gm?.isTimerPaused()
            ? new Color(255, 220, 50, 255)
            : new Color(165, 165, 190, 255);
    }

    private lbl(text: string, x: number, y: number, size: number, color: Color): Label {
        const n = new Node();
        n.setParent(this.node);
        n.setPosition(x, y);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.color = color;
        return l;
    }

    // ── input handling (touch + mouse) ──

    private toLocal(ui: Vec2): Vec2 {
        const vs = view.getVisibleSize();
        return new Vec2((ui.x - vs.width / 2) / PANEL_SCALE, (ui.y - vs.height / 2) / PANEL_SCALE);
    }

    // Canvas-relative coords (origin at screen center) — same space as viewNode.position (WarriorsLayer local)
    private toWorld(ui: Vec2): Vec2 {
        const vs = view.getVisibleSize();
        return new Vec2(ui.x - vs.width / 2, ui.y - vs.height / 2);
    }

    // canvas Y → box2dLayer local Y  (visualToPhys)
    private toPhysY(canvasY: number): number {
        const sy = this.layerScaleY;
        const wy = view.getDesignResolutionSize().height / 2;
        return (canvasY - wy * (sy - 1)) / (sy * sy);
    }

    // box2dLayer local Y → canvas Y  (physToVisual — inverse of toPhysY)
    private toVisualY(physLocalY: number): number {
        const sy = this.layerScaleY;
        const wy = view.getDesignResolutionSize().height / 2;
        return physLocalY * sy * sy + wy * (sy - 1);
    }

    private onTouchStart(e: EventTouch): void { this.handleStart(this.toLocal(e.getUILocation()), this.toWorld(e.getUILocation())); }
    private onTouchMove(e: EventTouch):  void { this.handleMove(this.toLocal(e.getUILocation()), this.toWorld(e.getUILocation())); }
    private onTouchEnd(e: EventTouch):   void { this.handleEnd(this.toLocal(e.getUILocation()), this.toWorld(e.getUILocation())); }
    private onMouseDown(e: EventMouse):  void { this.handleStart(this.toLocal(e.getUILocation()), this.toWorld(e.getUILocation())); }
    private onMouseMove(e: EventMouse):  void { this.handleMove(this.toLocal(e.getUILocation()), this.toWorld(e.getUILocation())); }
    private onMouseUp(e: EventMouse):    void { this.handleEnd(this.toLocal(e.getUILocation()), this.toWorld(e.getUILocation())); }

    private handleStart(p: Vec2, world: Vec2): void {
        // Block InputController from interpreting panel taps as swap gestures
        if (this.inRect(p, CX - PANEL_HALF, PANEL_BOT, PANEL_W, PANEL_TOP - PANEL_BOT)) {
            this._panelBlocking = true;
            this.gm.setLauncherBlocked(true);
        }

        if (this.inputCooldown) return;
        this.inputCooldown = true;
        this.scheduleOnce(() => { this.inputCooldown = false; }, 0.08);

        // Pause / Resume
        if (this.inRect(p, CX - BTN_PAUSE_W / 2, BTN_PAUSE_Y - BTN_PAUSE_H / 2, BTN_PAUSE_W, BTN_PAUSE_H)) {
            this.gm.setTimerPaused(!this.gm.isTimerPaused());
            this.pauseFlash = true;
            this.drawPanel();
            this.pauseLbl.string = this.pauseText();
            this.pauseLbl.color  = this.pauseLblColor();
            this.scheduleOnce(() => { this.pauseFlash = false; this.drawPanel(); }, 0.18);
            return;
        }

        // Round −
        if (this.inRect(p, CX - ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H)) {
            this.gm.setDebugRound(Math.max(1, this.gm.getCurrentRound() - 1));
            this.refresh();
            return;
        }
        // Round +
        if (this.inRect(p, CX + ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H)) {
            this.gm.setDebugRound(this.gm.getCurrentRound() + 1);
            this.refresh();
            return;
        }

        // Merges −
        if (this.inRect(p, CX - MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H)) {
            this.gm.setTotalMerges(this.gm.getTotalMerges() - 1);
            this.refresh();
            return;
        }
        // Merges +
        if (this.inRect(p, CX + MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H)) {
            this.gm.setTotalMerges(this.gm.getTotalMerges() + 1);
            this.refresh();
            return;
        }

        // SAVE
        if (this.inRect(p, SAVE_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H)) {
            this.flashAction('save', this.saveLbl, 'SAVE', () => this.gm.saveDebugState());
            return;
        }
        // LOAD
        if (this.inRect(p, LOAD_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H)) {
            this.flashAction('load', this.loadLbl, 'LOAD', () => { this.gm.loadDebugState(); this.refresh(); });
            return;
        }
        // RESET
        if (this.inRect(p, RESET_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H)) {
            this.flashAction('reset', this.resetLbl, 'RESET', () => { this.gm.resetDebugState(); this.refresh(); });
            return;
        }

        // WIN
        if (this.inRect(p, WIN_CX - WIN_BTN_W / 2, WIN_BTN_Y - WIN_BTN_H / 2, WIN_BTN_W, WIN_BTN_H)) {
            this.winPressed = true;
            this.drawPanel();
            this.scheduleOnce(() => { this.winPressed = false; this.drawPanel(); }, 0.18);
            this.gm.debugWin();
            return;
        }

        // WR toggle
        if (this.inRect(p, WR_CX - WR_BTN_W / 2, WIN_BTN_Y - WR_BTN_H / 2, WR_BTN_W, WR_BTN_H)) {
            this.gm.toggleWildRiver();
            this.wrLbl.color = this.gm.isWildRiverEnabled()
                ? new Color(220, 140, 255, 255)
                : new Color(200, 100, 255, 255);
            this.drawPanel();
            return;
        }

        // PF — activate PsychoForce on launcher
        if (this.inRect(p, PF_CX - PF_BTN_W / 2, WIN_BTN_Y - PF_BTN_H / 2, PF_BTN_W, PF_BTN_H)) {
            this.pfPressed = true;
            this.drawPanel();
            this.scheduleOnce(() => { this.pfPressed = false; this.drawPanel(); }, 0.18);
            this.gm.activatePsychoForce();
            return;
        }

        // AURA — activate Aura on launcher
        if (this.inRect(p, AURA_CX - AURA_BTN_W / 2, WIN_BTN_Y - AURA_BTN_H / 2, AURA_BTN_W, AURA_BTN_H)) {
            this.auraPressed = true;
            this.drawPanel();
            this.scheduleOnce(() => { this.auraPressed = false; this.drawPanel(); }, 0.18);
            this.gm.activateAura();
            return;
        }

        // BR — activate Brotherhood on launcher
        if (this.inRect(p, BR_CX - BR_BTN_W / 2, BR_BTN_Y - BR_BTN_H / 2, BR_BTN_W, BR_BTN_H)) {
            this.brPressed = true;
            this.drawPanel();
            this.scheduleOnce(() => { this.brPressed = false; this.drawPanel(); }, 0.18);
            this.gm.activateBrotherhood();
            return;
        }

        // LOSE — trigger game over immediately
        if (this.inRect(p, LOSE_CX - LOSE_BTN_W / 2, LOSE_BTN_Y - LOSE_BTN_H / 2, LOSE_BTN_W, LOSE_BTN_H)) {
            this.losePressed = true;
            this.drawPanel();
            this.scheduleOnce(() => { this.losePressed = false; this.drawPanel(); }, 0.18);
            this.gm.debugLose();
            return;
        }

        // Paused: record warrior touch — drag activates on move, tap cycles level on release
        // viewNode.position is local in WarriorsLayer — same canvas-relative space as toWorld()
        if (this.gm.isTimerPaused()) {
            for (const w of this.gm.getWarriors()) {
                if (!w.crossedLine || !w.node?.isValid || !w.viewNode?.isValid) continue;
                const vp = w.viewNode.position;
                if (Vec2.distance(world, new Vec2(vp.x, vp.y)) <= w.radius * 1.5 + 8) {
                    this.pauseTouchWarrior = w;
                    this.pauseTouchStart   = world.clone();
                    return;
                }
            }
        }

        // Palette icon — start drag, auto-pause and block launcher
        for (let t = 0; t < 7; t++) {
            const iy = PAL_START_Y - t * ICON_SPACING;
            if (Vec2.distance(p, new Vec2(CX, iy)) <= ICON_R + 8) {
                if (!this.gm.isTimerPaused()) {
                    this.gm.setTimerPaused(true);
                    this.refresh();
                }
                this.gm.setLauncherBlocked(true);
                this.dragType = t;
                this.spawnGhost(t, world);
                return;
            }
        }

        // Tap on settled warrior to cycle level
        for (const w of this.gm.getWarriors()) {
            if (!w.crossedLine || !w.node?.isValid || !w.viewNode?.isValid) continue;
            const vp = w.viewNode.position;
            if (Vec2.distance(world, new Vec2(vp.x, vp.y)) <= w.radius * 1.5 + 6) {
                this.tapWarrior = w;
                this.tapStart   = world.clone();
                return;
            }
        }
    }

    private handleMove(p: Vec2, world: Vec2): void {
        // Activate drag once movement exceeds threshold
        if (this.pauseTouchWarrior && !this.dragWarrior) {
            if (this.pauseTouchStart && Vec2.distance(world, this.pauseTouchStart) >= 12) {
                this.dragWarrior = this.pauseTouchWarrior;
                this.gm.pauseGrabWarrior(this.dragWarrior);
                this.pauseTouchWarrior = null;
                this.pauseTouchStart   = null;
            }
        }
        if (this.dragWarrior?.node?.isValid) {
            this.dragWarrior.node.setPosition(world.x, this.toPhysY(world.y));
            return;
        }
        if (this.dragType < 0) return;
        if (this.ghost?.isValid) this.ghost.setPosition(world.x, world.y);
    }

    private handleEnd(p: Vec2, world: Vec2): void {
        // Paused warrior drag: release physics
        if (this.dragWarrior) {
            this.gm.pauseDropWarrior(this.dragWarrior);
            this.dragWarrior = null;
            return;
        }

        // Paused warrior tap (no drag): cycle level
        if (this.pauseTouchWarrior) {
            if (this.pauseTouchWarrior.node?.isValid)
                this.gm.cycleDebugWarriorLevel(this.pauseTouchWarrior);
            this.pauseTouchWarrior = null;
            this.pauseTouchStart   = null;
            return;
        }

        // Palette drag: place warrior on drop inside track
        if (this.dragType >= 0) {
            if (this.ghost?.isValid) { this.ghost.destroy(); this.ghost = null; }
            const goalVisualY = this.toVisualY(GAME_OVER_LINE_Y / this.layerScaleY);
            if (Math.abs(world.x) <= TRACK_W / 2 && world.y > goalVisualY + 20) {
                this.gm.addDebugWarrior(this.dragType, 1, world.x, this.toPhysY(world.y));
            }
            this.dragType = -1;
            this._panelBlocking = false;
            this.gm.setLauncherBlocked(false);
            return;
        }

        // Short tap on warrior → cycle level
        if (this.tapWarrior && this.tapStart) {
            if (Vec2.distance(world, this.tapStart) < 15 && this.tapWarrior.node?.isValid) {
                this.gm.cycleDebugWarriorLevel(this.tapWarrior);
            }
        }
        this.tapWarrior = null;
        this.tapStart   = null;

        if (this._panelBlocking) {
            this._panelBlocking = false;
            this.gm.setLauncherBlocked(false);
        }
    }

    private spawnGhost(type: number, pos: Vec2): void {
        if (this.ghost?.isValid) this.ghost.destroy();
        const n = new Node('Ghost');
        n.setParent(this.node.parent!);
        n.setPosition(pos.x, pos.y);
        const g = n.addComponent(Graphics);
        const wc = WARRIORS[type]?.color ?? new Color(200, 200, 200);
        g.fillColor = new Color(wc.r, wc.g, wc.b, 140);
        const r1 = LEVEL_CONFIG[1]?.radius ?? 20;
        g.circle(0, 0, r1);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 160);
        g.lineWidth = 2;
        g.circle(0, 0, r1);
        g.stroke();
        this.ghost = n;
    }

    private flashAction(which: 'save' | 'load' | 'reset', label: Label, originalText: string, op: () => void): void {
        this.pressedAction = which;
        this.drawPanel();
        op();
        label.string = '✓';
        label.color  = new Color(80, 230, 110, 255);
        this.scheduleOnce(() => {
            this.pressedAction = null;
            label.string = originalText;
            label.color  = new Color(200, 200, 200, 230);
            this.drawPanel();
        }, 0.9);
    }

    private inRect(p: Vec2, x: number, y: number, w: number, h: number): boolean {
        return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    }
}
