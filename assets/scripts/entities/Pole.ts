import { _decorator, Component, Node, Vec3, Mat4, CCFloat, Graphics, Color, RigidBody2D, ERigidBody2DType, CircleCollider2D } from 'cc';
import { unprojectX, unprojectY, physicsDepth, projectX, projectY, sizeXFactor } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';

const { ccclass, property } = _decorator;

// Reused scratch (allocation-free: refreshed every frame).
const _inv = new Mat4();
const _wp = new Vec3();

// Fixed body feel (low-level physics, not gameplay tuning → hardcoded, not exposed).
const BODY_RESTITUTION = 0.5;   // a stone too fast for the glue bounces off and flies on (slow ones are caught before contact)
const BODY_FRICTION = 0.3;

/**
 * A mana pole (the dawn/sunset moai): a fixed, solid obstacle that the stones collide with and
 * rest against. Purely physical — it has NO attraction/magnetism of its own.
 *
 * Authored in the EDITOR on the pole node. At runtime it maps its on-screen position into the
 * arena's flat ground space and pins a solid circular body there so the physics stones interact
 * with it. Other systems read its ground position from the static registry (`Pole.all`).
 */
@ccclass('Pole')
export class Pole extends Component {
    private static _all: Pole[] = [];
    /** All live poles — for systems that need to locate them (read-only). */
    static get all(): readonly Pole[] { return Pole._all; }

    @property({ type: Node, tooltip: 'The arena this pole sits in.' })
    arena: Node | null = null;
    @property({ type: CCFloat, tooltip: 'Size of the pole\'s solid base (ground px) — how much room a stone needs to touch it.' })
    radius = 48;
    @property({ tooltip: 'Debug: draw the pole\'s solid circle on the floor.' })
    showDebugCircle = false;

    /** Pole centre in the arena's flat ground space (refreshed each frame). */
    get groundX(): number { return this._gx; }
    get groundY(): number { return this._gy; }
    /** The pole's solid kinematic body (ground space), once created — for systems that bond to the pole (Glue). */
    get bodyRb(): RigidBody2D | null { return this._body?.getComponent(RigidBody2D) ?? null; }

    private _gx = 0;
    private _gy = 0;
    private _body: Node | null = null;     // the solid kinematic body, pinned under the arena in ground space
    private _dbg: Graphics | null = null;

    onEnable(): void { Pole._all.push(this); }
    onDisable(): void {
        const i = Pole._all.indexOf(this);
        if (i >= 0) Pole._all.splice(i, 1);
        if (this._body?.isValid) this._body.destroy();
        this._body = null;
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }

    update(): void {
        this._refreshGroundPos();
        this._pinBody();
        this._drawDebug();
    }

    /** Map the pole's on-screen position back to the arena's flat ground space. */
    private _refreshGroundPos(): void {
        const arena = this.arena;
        if (!arena?.isValid) { const p = this.node.worldPosition; this._gx = p.x; this._gy = p.y; return; }
        Mat4.invert(_inv, arena.worldMatrix);
        Vec3.transformMat4(_wp, this.node.worldPosition, _inv);   // world → arena-local projected (xv, yv)
        this._gx = unprojectX(_wp.x, _wp.y);
        this._gy = unprojectY(_wp.y);
    }

    /** Lazily create the solid circular KINEMATIC body under the arena and keep it on the pole's ground spot. */
    private _pinBody(): void {
        const arena = this.arena;
        if (!arena?.isValid || physicsDepth() <= 0) return;
        if (!this._body?.isValid) {
            const n = new Node('PoleBody');
            n.layer = arena.layer;
            n.setParent(arena);
            const rb = n.addComponent(RigidBody2D);
            rb.type = ERigidBody2DType.Kinematic;
            rb.gravityScale = 0;
            rb.enabledContactListener = true;
            const col = n.addComponent(CircleCollider2D);
            col.radius = this.radius;
            col.restitution = BODY_RESTITUTION;
            col.friction = BODY_FRICTION;
            col.apply();
            this._body = n;
        }
        const p = this._body.position;
        if (Math.abs(p.x - this._gx) > 0.5 || Math.abs(p.y - this._gy) > 0.5) {
            this._body.setPosition(this._gx, this._gy, 0);
        }
    }

    /** Debug: draw the solid circle projected onto the floor, above the stone-layer sprites. */
    private _drawDebug(): void {
        const arena = this.arena, world = arena?.parent;
        if ((!this.showDebugCircle && !DebugDraw.enabled) || !arena?.isValid || !world?.isValid) {
            if (this._dbg?.isValid) this._dbg.clear();
            return;
        }
        if (!this._dbg?.isValid) {
            const dnode = new Node('PoleDebug');
            dnode.layer = arena.layer;
            dnode.setParent(world);
            this._dbg = dnode.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(255, 220, 80, 235);
        }
        const dn = this._dbg.node;
        dn.setSiblingIndex(world.children.length - 1);   // keep above the stone-layer sprites
        dn.setPosition(arena.position);                  // mirror the arena (position + scale)
        dn.setScale(arena.scale);
        const g = this._dbg;
        const cx = projectX(this._gx, this._gy), cy = projectY(this._gy);
        const rx = this.radius * sizeXFactor(this._gy), ry = rx * 0.5;   // flat ground disc (footprint)
        g.clear();
        g.ellipse(cx, cy, rx, ry);
        g.moveTo(cx - rx, cy); g.lineTo(cx + rx, cy);   // cross to mark the centre
        g.moveTo(cx, cy - ry); g.lineTo(cx, cy + ry);
        g.stroke();
    }
}
