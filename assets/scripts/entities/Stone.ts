import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, ERigidBody2DType, CircleCollider2D, Prefab, instantiate } from 'cc';
import { PERSPECTIVE_Y_SCALE } from '../config/Perspective';
import { Rune } from './Rune';

const { ccclass } = _decorator;
const _v = new Vec3();

/**
 * Links a moving Box2D body to its visual rune (a prefab instance) in another layer.
 *
 * The body lives in the arena's UN-squashed local space and ROTATES (warrior physics).
 * The view is a separate node (NOT a child of the body, so it never inherits the body's
 * rotation): each frame this copies the body's POSITION to the view with Y squashed by
 * PERSPECTIVE_Y_SCALE (the 45° look) and matches the arena's uniform fit-scale.
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

    lateUpdate(): void {
        const view = this.viewNode, arena = this.arena;
        if (!view?.isValid || !arena?.isValid) return;
        const p = this.node.position;                  // arena-local (body is a direct child of arena)
        _v.set(p.x, p.y * PERSPECTIVE_Y_SCALE, p.z);   // squash Y for the 45° view (position only)
        Vec3.transformMat4(_v, _v, arena.worldMatrix); // arena-local → world
        view.setWorldPosition(_v);
        const ws = arena.worldScale, s = this.viewScale;   // track the arena fit-scale (× viewScale)
        view.setWorldScale(ws.x * s, ws.y * s, 1);
        // Mirror the physics body's spin onto the designated inner node (base stays upright).
        if (this.rotationNode?.isValid) this.rotationNode.angle = this.node.angle;
    }

    onDestroy(): void {
        if (this.viewNode?.isValid) this.viewNode.destroy();
        this.viewNode = null;
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
        radius: number;
        restitution?: number;
        friction?: number;
        density?: number;
        linearDamping?: number;
        angularDamping?: number;
        viewScale?: number;
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

        if (o.viewPrefab && o.layer) {
            const view = instantiate(o.viewPrefab) as unknown as Node;
            view.setParent(o.layer);
            const stone = body.addComponent(Stone);
            stone.viewNode = view;
            stone.arena = o.arena;
            stone.viewScale = o.viewScale ?? 1;
            stone.rotationNode = view.getComponent(Rune)?.rotationNode ?? null;   // spins with the body
        }
        return body;
    }
}
