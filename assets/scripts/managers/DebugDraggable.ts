import { _decorator, Component, Input, input, EventTouch, EventMouse, Vec2, Node, Graphics, Color, Sprite, view, find } from 'cc';
import { WarriorSpriteCache } from '../utils/WarriorSpriteCache';
import { WARRIORS, LEVEL_CONFIG } from '../data/WarriorConfig';
import { GAME_OVER_LINE_Y, TRACK_W } from '../entities/Track';
import { IGameManagerDebug } from './DebugPanel';
const { ccclass, property } = _decorator;

@ccclass('DebugDraggable')
export class DebugDraggable extends Component {
    @property warriorType  = 0;
    @property warriorLevel = 1;

    private _gm: IGameManagerDebug | null = null;
    private _dragging = false;
    private _ghost: Node | null = null;
    private _layerScaleY = 0.5;

    start(): void {
        this._trySetSprite();

        const box2d = find('Canvas/World/Box2DLayer');
        if (box2d) this._layerScaleY = box2d.scale.y;

        this._gm = find('Canvas/GameManager')
            ?.getComponent('GameManager') as unknown as IGameManagerDebug | null;

        this.node.on(Node.EventType.TOUCH_START, this._onTouchNodeStart, this);
        this.node.on(Node.EventType.MOUSE_DOWN,  this._onMouseNodeStart, this);
        input.on(Input.EventType.TOUCH_MOVE,   this._onTouchMove, this);
        input.on(Input.EventType.TOUCH_END,    this._onTouchEnd,  this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd,  this);
        input.on(Input.EventType.MOUSE_MOVE,   this._onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP,     this._onMouseEnd,  this);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_MOVE,   this._onTouchMove, this);
        input.off(Input.EventType.TOUCH_END,    this._onTouchEnd,  this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd,  this);
        input.off(Input.EventType.MOUSE_MOVE,   this._onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP,     this._onMouseEnd,  this);
        if (this._ghost?.isValid) this._ghost.destroy();
    }

    private _trySetSprite(): void {
        const frame = WarriorSpriteCache.get(WARRIORS[this.warriorType]?.type ?? '', this.warriorLevel);
        if (frame) {
            const sp = this.getComponent(Sprite);
            if (sp) { sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = frame; }
        } else {
            this.scheduleOnce(() => this._trySetSprite(), 0.3);
        }
    }

    private _toWorld(ui: Vec2): Vec2 {
        const vs = view.getVisibleSize();
        return new Vec2(ui.x - vs.width / 2, ui.y - vs.height / 2);
    }

    private _toPhysY(canvasY: number): number {
        const sy = this._layerScaleY;
        const wy = view.getDesignResolutionSize().height / 2;
        return (canvasY - wy * (sy - 1)) / (sy * sy);
    }

    private _onTouchNodeStart(e: EventTouch): void { this._startDrag(e.getUILocation()); }
    private _onMouseNodeStart(e: EventMouse): void { this._startDrag(e.getUILocation()); }
    private _onTouchMove(e: EventTouch): void      { this._moveDrag(e.getUILocation()); }
    private _onMouseMove(e: EventMouse): void      { this._moveDrag(e.getUILocation()); }
    private _onTouchEnd(e: EventTouch): void       { this._endDrag(e.getUILocation()); }
    private _onMouseEnd(e: EventMouse): void       { this._endDrag(e.getUILocation()); }

    private _startDrag(ui: Vec2): void {
        if (this._dragging) return;
        this._dragging = true;
        this._gm?.setLauncherBlocked(true);
        this._spawnGhost(this._toWorld(ui));
    }

    private _moveDrag(ui: Vec2): void {
        if (!this._dragging) return;
        const w = this._toWorld(ui);
        if (this._ghost?.isValid) this._ghost.setPosition(w.x, w.y);
    }

    private _endDrag(ui: Vec2): void {
        if (!this._dragging) return;
        this._dragging = false;
        if (this._ghost?.isValid) { this._ghost.destroy(); this._ghost = null; }
        this._gm?.setLauncherBlocked(false);

        const w = this._toWorld(ui);
        const sy = this._layerScaleY;
        const wy = view.getDesignResolutionSize().height / 2;
        const goalVisualY = GAME_OVER_LINE_Y * sy + wy * (sy - 1);
        if (Math.abs(w.x) <= TRACK_W / 2 && w.y > goalVisualY + 20) {
            this._gm?.addDebugWarrior(this.warriorType, this.warriorLevel, w.x, this._toPhysY(w.y));
        }
    }

    private _spawnGhost(pos: Vec2): void {
        if (this._ghost?.isValid) this._ghost.destroy();
        const canvas = find('Canvas');
        const n = new Node('DragGhost');
        n.setParent(canvas ?? this.node.parent!);
        n.setPosition(pos.x, pos.y);
        const g = n.addComponent(Graphics);
        const wc = WARRIORS[this.warriorType]?.color ?? new Color(200, 200, 200);
        const r  = (LEVEL_CONFIG[1]?.radius ?? 20);
        g.fillColor   = new Color(wc.r, wc.g, wc.b, 140);
        g.circle(0, 0, r); g.fill();
        g.strokeColor = new Color(255, 255, 255, 160);
        g.lineWidth   = 2;
        g.circle(0, 0, r); g.stroke();
        this._ghost = n;
    }
}
