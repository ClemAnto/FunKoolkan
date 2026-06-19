import { _decorator, Component, Node, Color, Vec3, SpriteFrame, UIOpacity, Sprite, UITransform, tween, gfx, PhysicsSystem2D } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

const EMIT_INTERVAL   = 0.035;  // seconds between emission checks
const MIN_MOVE_FACTOR = 0.30;   // emit only if moved ≥ radius × this since the last dot
const IDLE_TICKS_MAX  = 20;     // ~0.7s without movement → self-detach
const DOT_LIFE        = 0.30;   // seconds each dot takes to fade out

const DOT_COLOR  = new Color(255, 240, 200, 255);  // warm white
const DOT_SHRINK = new Vec3(0.35, 0.35, 1);        // shared tween prop — never mutated

/**
 * Light trail behind the launched warrior: small additive sparkles dropped along
 * the flight path. Distance-based emission (no dots while paused or settled) and
 * fully self-managing — it detaches itself when the warrior stops, merges or dies.
 * Dots are parented to the VFX layer and self-destroy, so detach() is instant.
 */
@ccclass('TrailEffect')
export class TrailEffect extends Component {
    private _warrior: Warrior | null = null;
    private _frame: SpriteFrame | null = null;
    private _layer: Node | null = null;
    private _toVisualY: ((physY: number) => number) | null = null;
    private _lastX = NaN;
    private _lastY = NaN;
    private _idleTicks = 0;

    static attach(warrior: Warrior, layer: Node, frame: SpriteFrame | null, toVisualY: (physY: number) => number): TrailEffect {
        const n = new Node('TrailEffect');
        n.setParent(layer);
        const t = n.addComponent(TrailEffect);
        t._warrior   = warrior;
        t._frame     = frame;
        t._layer     = layer;
        t._toVisualY = toVisualY;
        t.schedule(t._emit, EMIT_INTERVAL);
        return t;
    }

    detach(): void {
        this.unschedule(this._emit);
        this._warrior = null;
        if (this.node?.isValid) this.node.destroy();
    }

    private _emit(): void {
        const w = this._warrior;
        if (!w?.node?.isValid || !this._layer?.isValid || !this._frame || !this._toVisualY) {
            this.detach();
            return;
        }
        if (!PhysicsSystem2D.instance.enable) return;  // paused — freeze, don't count idle ticks

        const x = w.node.position.x;
        const y = w.node.position.y;
        const minMove = w.radius * MIN_MOVE_FACTOR;
        if (!Number.isNaN(this._lastX) && Math.hypot(x - this._lastX, y - this._lastY) < minMove) {
            if (++this._idleTicks > IDLE_TICKS_MAX) this.detach();
            return;
        }
        this._idleTicks = 0;
        this._lastX = x;
        this._lastY = y;

        const dot = new Node('TrailDot');
        dot.setParent(this._layer);
        const jx = (Math.random() - 0.5) * w.radius * 0.3;
        dot.setPosition(x + jx, this._toVisualY(y) + (Math.random() - 0.5) * w.radius * 0.15);
        dot.angle = Math.random() * 360;

        const size = w.radius * (0.7 + Math.random() * 0.5);
        dot.addComponent(UITransform).setContentSize(size, size);
        const sp = dot.addComponent(Sprite);
        sp.sizeMode    = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = this._frame;
        sp.color       = DOT_COLOR;
        sp.getMaterialInstance(0)?.overridePipelineStates({
            blendState: { targets: [{ blend: true,
                blendSrc: gfx.BlendFactor.SRC_ALPHA,
                blendDst: gfx.BlendFactor.ONE }] }
        });

        const op = dot.addComponent(UIOpacity);
        op.opacity = 150;
        tween(op)
            .to(DOT_LIFE, { opacity: 0 }, { easing: 'quadOut' })
            .call(() => { if (dot.isValid) dot.destroy(); })
            .start();
        tween(dot)
            .to(DOT_LIFE, { scale: DOT_SHRINK }, { easing: 'quadOut' })
            .start();
    }
}
