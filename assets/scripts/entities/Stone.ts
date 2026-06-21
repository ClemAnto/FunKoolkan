import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, ERigidBody2DType, CircleCollider2D, Prefab, instantiate, Graphics, Color } from 'cc';
import { projectX, projectY, sizeXFactor, sizeYFactor } from '../config/Perspective';
import { Rune } from './Rune';
import { Magnet } from './Magnet';

const { ccclass } = _decorator;
const _v = new Vec3();

/**
 * Links a moving Box2D body to its visual rune (a prefab instance) in another layer.
 *
 * The body lives in the arena's flat GROUND space and ROTATES (warrior physics). The view is
 * a separate node (NOT a child of the body, so it never inherits the body's rotation): each
 * frame this maps the body's POSITION via the 1-point projection (projectX — X converges —
 * and projectY — non-linear Y), matches the arena's uniform fit-scale, and shrinks the view
 * with depth via sizeXFactor (X) and sizeYFactor (Y) so far runes are genuinely smaller.
 */
@ccclass('Stone')
export class Stone extends Component {
    /** The view node (rune prefab instance) mirroring this body. */
    viewNode: Node | null = null;
    /** The Arena container; its world transform maps physics → screen. */
    arena: Node | null = null;
    /** Extra scale applied to the view on top of the arena fit-scale (1 = native prefab size). */
    viewScale = 1;
    /** Inner view node that mirrors the body's rotation (the prefab's "rotation" node). */
    rotationNode: Node | null = null;
    /** Physics collider radius (ground px) — used by the debug draw. */
    radius = 0;

    /** Debug overlay toggle (set by StoneLauncher.debugStones): a flat ellipse + rotation radius per stone. */
    static debugDraw = false;
    private _dbg: Graphics | null = null;
    /** Shared debug layer (above the stone layer) so the debug renders ON TOP of the stones. */
    private static _dbgLayer: Node | null = null;

    lateUpdate(): void {
        const view = this.viewNode, arena = this.arena;
        if (!view?.isValid || !arena?.isValid) return;
        const p = this.node.position;                  // arena-local ground point (body is a direct child of arena)
        _v.set(projectX(p.x, p.y), projectY(p.y), p.z); // 1-point perspective: X converges, Y non-linear
        Vec3.transformMat4(_v, _v, arena.worldMatrix);  // arena-local → world
        view.setWorldPosition(_v);
        // Shrink with depth in BOTH axes (sizeX = s, sizeY = s·vy), so a far rune is genuinely
        // smaller, the silhouette tracking the projected ground circle.
        const ws = arena.worldScale, s = this.viewScale;
        view.setWorldScale(ws.x * s * sizeXFactor(p.y), ws.y * s * sizeYFactor(p.y), 1);
        // Mirror the physics body's spin onto the designated inner node (base stays upright).
        if (this.rotationNode?.isValid) this.rotationNode.angle = this._zAngleDeg();
        if (Stone.debugDraw) this._drawDebug(p);
        else if (this._dbg?.isValid) this._dbg.clear();
    }

    /** Full ±180 Z rotation of the body in degrees. Box2D is 2D → the body's rotation is a pure-Z
     *  turn; decode it from the quaternion with atan2 (full range), NOT via node.angle whose getter
     *  uses asin and folds to [-90,90]. */
    private _zAngleDeg(): number {
        const r = this.node.rotation;
        return Math.atan2(2 * (r.w * r.z + r.x * r.y), 1 - 2 * (r.y * r.y + r.z * r.z)) * 180 / Math.PI;
    }

    /** Lazily create a shared debug layer as the LAST child of the arena's parent (above
     *  the stone layer → on top of the stones), mirroring the arena's transform so arena-local draw
     *  coords still map correctly. Debug only. */
    private _debugLayer(): Node | null {
        const arena = this.arena, world = arena?.parent;
        if (!arena?.isValid || !world?.isValid) return null;
        let layer = Stone._dbgLayer;
        if (!layer?.isValid) {
            layer = new Node('__StonesDebugLayer');
            layer.layer = arena.layer;
            layer.setParent(world);
            layer.setSiblingIndex(world.children.length - 1);   // above the stone layer
            Stone._dbgLayer = layer;
        }
        layer.setPosition(arena.position);   // mirror Arena (position + scale) so arena-local coords map
        layer.setScale(arena.scale);
        return layer;
    }

    /** Debug only: a flat ground-disc ellipse (vertical axis squashed by the ground tilt) plus a
     *  radius line from the centre to the rim, rotated with the body — shows position + spin. */
    private _drawDebug(p: Readonly<Vec3>): void {
        const parent = this._debugLayer();
        if (!parent) return;
        if (!this._dbg?.isValid) {
            const n = new Node('StoneDebug');
            n.layer = parent.layer;
            n.setParent(parent);
            n.setPosition(0, 0, 0);
            this._dbg = n.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(255, 90, 90, 235);
        }
        const g = this._dbg, r = this.radius;
        const cx = projectX(p.x, p.y), cy = projectY(p.y);
        const rx = r * sizeXFactor(p.y), ry = rx * 0.5;   // 0.5 = ground tilt → flat disc on the floor
        const th = this._zAngleDeg() * Math.PI / 180;     // full ±180 (node.angle would fold to ±90 → fake wobble)
        g.clear();
        g.ellipse(cx, cy, rx, ry);
        g.moveTo(cx, cy);
        g.lineTo(cx - rx * Math.sin(th), cy + ry * Math.cos(th));   // radius on the flat ellipse → rotation
        g.stroke();
    }

    onDestroy(): void {
        if (this.viewNode?.isValid) this.viewNode.destroy();
        this.viewNode = null;
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }

    /**
     * Spawn a dynamic circular body (Warrior physics) as a child of the arena, instantiate
     * the rune view prefab in `layer`, and link them. Returns the body node.
     */
    static spawn(o: {
        arena: Node;
        layer: Node | null;
        viewPrefab: Prefab | null;
        pos: Vec2;            // arena-local (de-squashed)
        velocity: Vec2;       // arena-local (de-squashed)
        angularVelocity?: number;   // launch spin (deg/s); decays via angularDamping
        radius: number;
        restitution?: number;
        friction?: number;
        density?: number;
        linearDamping?: number;
        angularDamping?: number;
        viewScale?: number;
        gemType?: number;     // gem type to show on the rune (Rune.setType)
        name?: string;
    }): Node {
        const body = new Node(o.name ?? 'Stone');
        body.layer = o.arena.layer;
        body.setParent(o.arena);
        body.setPosition(o.pos.x, o.pos.y, 0);

        // Physics from the launcher (warrior-like: friction, low restitution, damping). The body
        // ROTATES (fixedRotation false) so its spin can drive the rune's "rotation" node.
        const rb = body.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Dynamic;
        rb.gravityScale = 0;
        rb.linearDamping = o.linearDamping ?? 0.5;
        rb.angularDamping = o.angularDamping ?? 1.5;
        rb.fixedRotation = false;
        rb.enabledContactListener = true;
        rb.bullet = true;

        const col = body.addComponent(CircleCollider2D);
        col.radius = o.radius;
        col.density = o.density ?? 8.0;
        col.friction = o.friction ?? 0;
        col.restitution = o.restitution ?? 1;
        col.apply();

        rb.linearVelocity = o.velocity;
        if (o.angularVelocity) rb.angularVelocity = o.angularVelocity;   // deg/s; decays via angularDamping

        // Mana-circuit magnetism: the body becomes a same-colour attractor once it connects to a pole.
        Magnet.attach(body, {
            isPole: false,
            gemType: o.gemType ?? 0,
            radius: o.radius,
            arena: o.arena,
            flightDamping: o.linearDamping ?? 0.5,
        });

        if (o.viewPrefab && o.layer) {
            const view = instantiate(o.viewPrefab) as unknown as Node;
            view.setParent(o.layer);
            const stone = body.addComponent(Stone);
            stone.viewNode = view;
            stone.arena = o.arena;
            stone.viewScale = o.viewScale ?? 1;
            stone.radius = o.radius;
            const rune = view.getComponent(Rune);
            stone.rotationNode = rune?.rotationNode ?? null;          // spins with the body
            if (rune && o.gemType !== undefined) rune.setType(o.gemType);   // gem colour
        }
        return body;
    }
}
