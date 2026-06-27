import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, ERigidBody2DType, CircleCollider2D, Prefab, instantiate, Graphics, Color, Sprite, Material, tween, Tween } from 'cc';
import { projectX, projectY, sizeXFactor, sizeYFactor } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';
import { Rune } from './Rune';
import { Glue } from './Glue';
import { Bomb } from './Bomb';

const { ccclass } = _decorator;
const _v = new Vec3();
const STAR_FLASH = new Color(255, 255, 255, 255);   // white wash that accompanies the pop into a star

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
    /** Debug: set by House when this stone overlaps the HOUSE zone → its debug outline thickens. */
    debugInHouse = false;

    /** Transient SCREEN-space offset added to the view each frame — drives the non-physics "nudge" recoil
     *  animation (the body never moves). Zero at rest; animated by nudge(). */
    readonly viewOffset = new Vec3();
    private _nudgeTween: Tween<Vec3> | null = null;
    /** Hit flash: the view sprites' material INSTANCES (SpriteFlash effect) + a 0->1->0 flashAmount tween. The
     *  shader does mix(rgb, flashColor, amount), so it whitens on any background (a tint/additive can't). */
    private _flashMats: Material[] = [];
    private _flashGathered = false;
    private readonly _flashT = { v: 0 };
    private readonly _flashColor = new Color(255, 255, 255, 0);   // .rgb = flash colour, .a = amount (driven by the tween)
    private _flashTween: Tween<{ v: number }> | null = null;
    /** Continuous pulsing flash (a fired BOMB keeps a throbbing red until it explodes): when set, update()
     *  drives the flash amount to base±amp at freq rad/s every frame. Null = no pulse. */
    private _pulseColor: Color | null = null;
    private _pulseBase = 0;
    private _pulseAmp = 0;
    private _pulseFreq = 0;
    private _pulseT = 0;

    /** Rubbery spring scale multiplier applied on TOP of the depth scale in lateUpdate — drives the
     *  "swell then shrink to nothing" of vanishAsStar (1 at rest). Animated via a tween on `_spring`. */
    private readonly _spring = { s: 1 };
    private _vanishing = false;

    /** Debug overlay toggle (set by StoneLauncher.debugStones): a flat ellipse + rotation radius per stone. */
    static debugDraw = false;
    private _dbg: Graphics | null = null;
    /** Shared debug layer (above the stone layer) so the debug renders ON TOP of the stones. */
    private static _dbgLayer: Node | null = null;

    /** All live stones — for systems that need to find them (e.g. the Bomb blast). */
    private static _all: Stone[] = [];
    static get all(): readonly Stone[] { return Stone._all; }
    onEnable(): void { Stone._all.push(this); }
    onDisable(): void { const i = Stone._all.indexOf(this); if (i >= 0) Stone._all.splice(i, 1); }

    lateUpdate(): void {
        const view = this.viewNode, arena = this.arena;
        if (!view?.isValid || !arena?.isValid) return;
        const p = this.node.position;                  // arena-local ground point (body is a direct child of arena)
        _v.set(projectX(p.x, p.y), projectY(p.y), p.z); // 1-point perspective: X converges, Y non-linear
        Vec3.transformMat4(_v, _v, arena.worldMatrix);  // arena-local → world
        _v.x += this.viewOffset.x; _v.y += this.viewOffset.y;   // non-physics nudge (recoil animation)
        view.setWorldPosition(_v);
        // Shrink with depth in BOTH axes (sizeX = s, sizeY = s·vy), so a far rune is genuinely
        // smaller, the silhouette tracking the projected ground circle.
        const ws = arena.worldScale, s = this.viewScale, rs = this._spring.s;
        view.setWorldScale(ws.x * s * sizeXFactor(p.y) * rs, ws.y * s * sizeYFactor(p.y) * rs, 1);
        // Mirror the physics body's spin onto the designated inner node (base stays upright).
        if (this.rotationNode?.isValid) this.rotationNode.angle = this._zAngleDeg();
        if (Stone.debugDraw || DebugDraw.enabled) this._drawDebug(p);
        else if (this._dbg?.isValid) this._dbg.clear();
    }

    /** Non-physics recoil: slide the VIEW `dist` px along (dirX,dirY) in screen space, then ease back to the
     *  body. Pure animation — the Box2D body never moves (so it works even on a locked/static stone). Used by
     *  the curling discharge: the source lurches back, the struck stone lurches forward along the bolt. */
    nudge(dirX: number, dirY: number, dist: number, outT = 0.05, backT = 0.22): void {
        if (dist <= 0) return;
        this._nudgeTween?.stop();
        this.viewOffset.set(0, 0, 0);
        this._nudgeTween = tween(this.viewOffset)
            .to(outT, { x: dirX * dist, y: dirY * dist }, { easing: 'quadOut' })
            .to(backT, { x: 0, y: 0 }, { easing: 'quadOut' })
            .start();
    }

    /** HIT FLASH: drive the SpriteFlash material's flashAmount 0->1->0 so the whole view washes to `color`
     *  (white) then returns — the shader mix() whitens on ANY background, unlike a sprite-colour tint. Needs
     *  the SpriteFlash material on the view sprites (assigned in the Rune prefab); a no-op on plain sprites. */
    flashWhite(color: Color, peak = 1, outT = 0.05, backT = 0.2): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        this._flashColor.set(color.r, color.g, color.b, 0);   // .a (the amount) is driven by the tween below
        this._flashTween?.stop();
        this._flashT.v = 0;
        const apply = (): void => this._setFlash(this._flashT.v);
        this._flashTween = tween(this._flashT)
            .to(outT, { v: peak }, { easing: 'quadOut', onUpdate: apply })   // peak = how white (1 = full white)
            .to(backT, { v: 0 }, { easing: 'quadIn', onUpdate: apply })
            .call(() => this._setFlash(0))
            .start();
    }

    /** One-way flash: snap the SpriteFlash amount to `amount` (e.g. 0.5 = half white) NOW, then fade it back
     *  to normal over `time`. Used on a freshly launched stone so it leaves the launcher washed white. */
    flashFrom(color: Color, amount = 0.5, time = 0.3): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        this._flashColor.set(color.r, color.g, color.b, 0);   // .a (the amount) is driven below
        this._flashTween?.stop();
        this._flashT.v = amount;
        const apply = (): void => this._setFlash(this._flashT.v);
        apply();
        this._flashTween = tween(this._flashT)
            .to(time, { v: 0 }, { easing: 'quadIn', onUpdate: apply })
            .call(() => this._setFlash(0))
            .start();
    }

    /** Keep the view pulsing toward `color` (flash amount oscillating base±amp at `freq` rad/s) EVERY frame
     *  via update() — used by a fired BOMB so it carries a throbbing red for its whole life. Cleared on
     *  destroy. */
    flashPulse(color: Color, base: number, amp: number, freq: number): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        this._flashTween?.stop(); this._flashTween = null;   // the pulse takes over from any one-shot flash
        this._flashColor.set(color.r, color.g, color.b, 0);
        this._pulseColor = color;
        this._pulseBase = base; this._pulseAmp = amp; this._pulseFreq = freq; this._pulseT = 0;
    }

    update(dt: number): void {
        if (!this._pulseColor) return;   // only a bomb stone runs a continuous pulse
        this._pulseT += dt;
        this._setFlash(this._pulseBase + this._pulseAmp * Math.sin(this._pulseT * this._pulseFreq));
    }

    /** Material instances of the view sprites, gathered once — a per-sprite instance so this stone flashes
     *  alone (at the cost of its batch; negligible for the few struck stones). */
    private _gatherFlashMats(): void {
        if (this._flashGathered) return;
        this._flashGathered = true;
        if (!this.viewNode?.isValid) return;
        const sprites = this.viewNode.getComponentsInChildren(Sprite);
        for (let i = 0; i < sprites.length; i++) {
            const m = sprites[i].getMaterialInstance(0);
            if (m) this._flashMats.push(m);
        }
    }

    private _setFlash(v: number): void {
        this._flashColor.a = Math.round(Math.max(0, Math.min(1, v)) * 255);   // amount packed into flashColor.a
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('flashColor', this._flashColor);
    }

    /** Clear any in-flight flash (used by vanishAsStar before the pop). */
    private _restorePop(): void { this._setFlash(0); }

    /** Curling payoff: the struck stone VANISHES with a pop, then the RaisingStar VFX takes over. After a
     *  `delay` beat the view SWELLS (to `expand`×) and then SHRINKS to 0 — and the instant it hits 0 it fires
     *  `onVanished` (where the star is born) and the whole stone (body + view) is destroyed. No rise: it pops
     *  in place. Pure VIEW animation on top of the (already locked) body; one-shot. */
    vanishAsStar(delay: number, expand: number, popTime: number, onVanished: () => void): void {
        if (this._vanishing || !this.node?.isValid || !this.viewNode?.isValid) return;
        this._vanishing = true;
        // Drop any in-flight recoil NUDGE so the pop starts from rest — but KEEP the hit flash running, so the
        // struck stone stays flashing white as it pops into a star (stopping it here is what hid B's flash).
        this._nudgeTween?.stop(); this._nudgeTween = null;
        this.viewOffset.set(0, 0, 0);
        // After the beat: swell (a touch of overshoot = gommoso), then snap shut to nothing. When it reaches
        // 0 the star is born where the stone stood and the stone (body + linked view) is removed.
        const grow = popTime * 0.4, shrink = popTime * 0.6;
        Tween.stopAllByTarget(this._spring);
        this._spring.s = 1;
        tween(this._spring)
            .delay(delay)
            // Flash white IN SYNC with the pop: wash up as it swells (grow), fade as it shrinks to nothing.
            .call(() => this.flashWhite(STAR_FLASH, 1, grow, shrink))
            .to(grow, { s: expand }, { easing: 'backOut' })
            .to(shrink, { s: 0 }, { easing: 'backIn' })
            .call(() => {
                onVanished();
                if (this.node?.isValid) this.node.destroy();
            })
            .start();
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
        g.lineWidth = this.debugInHouse ? 7 : 3;           // thicker while touching the HOUSE
        g.ellipse(cx, cy, rx, ry);
        g.moveTo(cx, cy);
        g.lineTo(cx - rx * Math.sin(th), cy + ry * Math.cos(th));   // radius on the flat ellipse → rotation
        g.stroke();
    }

    onDestroy(): void {
        this._nudgeTween?.stop();
        this._nudgeTween = null;
        this._flashTween?.stop();
        this._flashTween = null;
        Tween.stopAllByTarget(this._spring);      // vanishAsStar leftovers (target our own objects, not the node)
        Tween.stopAllByTarget(this.viewOffset);
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
        isBomb?: boolean;     // MAX-charge launch → a bomb (explodes on contact) instead of a sticky rune
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

        // A MAX-charge launch is a BOMB (explodes on contact, no gluing); otherwise it is sticky: a free
        // stone that hits a matching anchor bonds into the soft mana structure. Both composable behaviours.
        if (o.isBomb) {
            body.addComponent(Bomb).radius = o.radius;
        } else {
            const glue = body.addComponent(Glue);
            glue.gemType = o.gemType ?? 0;
            glue.radius = o.radius;
        }

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
