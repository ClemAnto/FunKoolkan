import { _decorator, Component, Node, Label, RigidBody2D, ERigidBody2DType, CircleCollider2D, Collider2D, Contact2DType, Color, Graphics, Vec2, Vec3, Sprite, SpriteFrame, UITransform, UIOpacity, tween, Tween } from 'cc';
import { WARRIORS, LEVEL_CONFIG } from '../data/WarriorConfig';
import { LAYOUT_SCALE } from './Track';
import { PerspectiveMapper } from './PerspectiveMapper';
import { WarriorSpriteCache } from '../utils/WarriorSpriteCache';
import { AudioManager, SFX } from '../managers/AudioManager';
const { ccclass } = _decorator;

export interface IWildRiverSparkle {
    detach(): void;
}

export interface IPsychoForce {
    detach(): void;
    resetTimer(): void;
}

const MERGE_DELAY      = 0.3;
const WRS_CONTACT_DELAY = 0;
const BOUNCE_VOL_MAX   = 280;  // velocity at which wall-bounce volume reaches 1.0
const HIT_VOL_MAX      = 80;   // velocity at which warrior-hit volume reaches 1.0

function bounceVol(speed: number): number {
    return Math.min(speed / BOUNCE_VOL_MAX, 1.0) ** 0.5;
}
function hitVol(speed: number): number {
    return Math.min(speed / HIT_VOL_MAX, 1.0) ** 0.5;
}

@ccclass('Warrior')
export class Warrior extends Component {
    static contactFriction = 0.3;
    static linearDamping   = 0.5;
    static settledDamping  = 16;
    static viewYOffset     = 0.8;
    type: number = 0;
    level: number = 1;
    merging: boolean = false;
    launched: boolean = false;
    fired: boolean = false;
    crossedLine: boolean = false;
    settled: boolean = false;
    hitOtherWarrior: boolean = false;
    viewNode!: Node;
    mapper: PerspectiveMapper | null = null;
    psychoForce: IPsychoForce | null = null;
    onPsychoContact: ((source: Warrior, target: Warrior) => void) | null = null;
    onBrotherhoodContact: ((source: Warrior, target: Warrior) => void) | null = null;
    brotherhoodInfected: boolean = false;
    // Cached in buildPhysics() — velocity is read dozens of times per frame in GameManager hot paths
    private _rb: RigidBody2D | null = null;

    get radius(): number { return (LEVEL_CONFIG[this.level]?.radius ?? 30) * LAYOUT_SCALE; }
    get velocity(): Vec2 { return this._rb?.linearVelocity ?? new Vec2(0, 0); }
    set velocity(v: Vec2) { if (this._rb) this._rb.linearVelocity = v; }

    onMergeReady: ((self: Warrior, other: Warrior) => void) | null = null;
    onWildRiverContact: ((source: Warrior, target: Warrior) => void) | null = null;
    wildRiverSparkle: IWildRiverSparkle | null = null;
    isWRLauncher = false;
    private _lastHitSoundMs = 0;

    // Upgrade level in-place (sprite + mapper, physics collider not resized at runtime)
    levelUpInPlace(newLevel: number): void {
        this.level = newLevel;
        if (this.mapper) this.mapper.yOffset = this.radius * Warrior.viewYOffset;
        if (!this.viewNode?.isValid) return;
        const r = this.radius;
        const uit = this.viewNode.getComponent(UITransform);
        if (uit) uit.setContentSize(r * 4, r * 4);
        const sp = this.viewNode.getComponent(Sprite);
        if (sp) {
            const frame = WarriorSpriteCache.get(WARRIORS[this.type]?.type ?? '', newLevel);
            if (frame) sp.spriteFrame = frame;
        }
    }

    playMergeOutEffect(targetX: number, targetY: number, duration: number): void {
        const rb = this._rb;
        if (rb) { rb.type = ERigidBody2DType.Static; rb.linearVelocity = new Vec2(0, 0); }
        tween(this.node).to(duration, { position: new Vec3(targetX, targetY, 0) }).start();
        if (this.mapper) {
            Tween.stopAllByTarget(this.mapper);
            tween(this.mapper)
                .to(duration * 0.45, { animScale: 0.78 }, { easing: 'quadOut' })
                .to(duration * 0.55, { animScale: 1.25 }, { easing: 'quadIn'  })
                .start();
        }
        if (!this.viewNode?.isValid) return;
        const sp = this.viewNode.getComponent(Sprite);
        if (sp) {
            sp.color = new Color(255, 255, 255, 255);
            tween(sp).to(duration, { color: new Color(255, 255, 255, 255) }).start();
        }
    }

    playGameOverEffect(): void {
        if (!this.viewNode?.isValid) return;
        const red = new Color(255, 60, 60, 255);
        const sp = this.viewNode.getComponent(Sprite);
        if (sp) { sp.color = red; return; }
        // fallback for placeholder graphics warriors
        this.viewNode.children.forEach(c => {
            const s = c.getComponent(Sprite);
            if (s) s.color = red;
        });
    }

    playMergeInEffect(duration: number): void {
        if (!this.viewNode?.isValid) return;
        const sp = this.viewNode.getComponent(Sprite);
        if (sp) {
            sp.color = new Color(255, 255, 255, 0);
            tween(sp).to(duration, { color: new Color(255, 255, 255, 255) }).start();
        }
        let op = this.viewNode.getComponent(UIOpacity) ?? this.viewNode.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(duration, { opacity: 255 }).start();
    }

    private mergeCallbacks    = new Map<Warrior, () => void>();
    private _wrsContactCbs   = new Map<Warrior, () => void>();
    private _brContactCbs    = new Map<Warrior, () => void>();

    static spawn(parent: Node, visualParent: Node, type: number, level: number, x: number, y: number): Warrior {
        const node = new Node('Warrior');
        node.setParent(parent);
        node.setPosition(x, y);
        const w = node.addComponent(Warrior);
        w.init(type, level, visualParent);
        return w;
    }

    init(type: number, level: number, visualParent: Node): void {
        this.type = type;
        this.level = level;

        this.viewNode = new Node('View');
        this.viewNode.setParent(visualParent);

        this.buildPhysics();
        this.buildGraphics();

        const m = this.node.addComponent(PerspectiveMapper);
        m.viewNode = this.viewNode;
        m.yOffset  = this.radius * Warrior.viewYOffset;
        this.mapper = m;
    }

    onDestroy(): void {
        // Stop tweens targeting this warrior's node/mapper/sprite/opacity — component
        // targets are not auto-stopped by the engine and would keep running after destroy.
        Tween.stopAllByTarget(this.node);
        if (this.mapper) Tween.stopAllByTarget(this.mapper);
        if (this.viewNode?.isValid) {
            const sp = this.viewNode.getComponent(Sprite);
            if (sp) Tween.stopAllByTarget(sp);
            const op = this.viewNode.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            this.viewNode.destroy();
        }
    }

    start() {
        const col = this.getComponent(CircleCollider2D)!;
        col.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        col.on(Contact2DType.END_CONTACT,   this.onEndContact,   this);
    }

    applyImpulse(impulse: Vec2): void {
        this.launched = true;
        this.fired = true;
        this.hitOtherWarrior = false;
        this._rb?.applyLinearImpulseToCenter(impulse, true);
    }

    applyForce(force: Vec2): void {
        this._rb?.applyForceToCenter(force, true);
    }

    settle(): void {
        const rb = this._rb;
        if (!rb) return;
        rb.linearDamping  = Warrior.settledDamping;
        rb.angularDamping = 5;
        this.settled = true;
    }

    resetPhysics(): void {
        const rb = this._rb;
        if (rb) {
            rb.linearDamping  = Warrior.linearDamping;
            rb.angularDamping = 1.5;
        }
        const col = this.getComponent(CircleCollider2D);
        if (col) {
            col.density     = 8.0;
            col.friction    = Warrior.contactFriction;
            col.restitution = 0.04;
        }
    }

    /** Re-fit the collider and visual to the current LAYOUT_SCALE after a live viewport resize.
     *  Position is handled by the caller (GameManager re-maps it within the funnel). */
    rescaleToLayout(): void {
        const r = this.radius; // getter uses the live (post-resize) LAYOUT_SCALE
        const col = this.getComponent(CircleCollider2D);
        if (col) { col.radius = r; col.apply(); }  // apply() rebuilds the Box2D fixture at the new size
        if (this.mapper) this.mapper.yOffset = r * Warrior.viewYOffset;
        if (this.viewNode?.isValid) {
            const uit = this.viewNode.getComponent(UITransform);
            if (uit) uit.setContentSize(r * 4, r * 4);
        }
    }

    forceStop(): void {
        const rb = this._rb;
        if (!rb) return;
        rb.linearVelocity  = new Vec2(0, 0);
        rb.angularVelocity = 0;
        this.settle();
    }

    setDragMode(on: boolean): void {
        const rb = this._rb;
        if (!rb) return;
        rb.type            = on ? ERigidBody2DType.Static : ERigidBody2DType.Dynamic;
        rb.linearVelocity  = new Vec2(0, 0);
        rb.angularVelocity = 0;
    }

    private onBeginContact(_self: Collider2D, other: Collider2D): void {
        const otherW = other.node.getComponent(Warrior);
        const speed  = this._rb!.linearVelocity.length();

        if (!otherW) {
            if (this.launched || this.crossedLine) {
                AudioManager.instance.play(SFX.BOUNCE, bounceVol(speed));
                if (this.mapper && this.launched) {
                    const vel = this._rb!.linearVelocity;
                    if (Math.abs(vel.x) > speed * 0.25) {
                        Tween.stopAllByTarget(this.mapper);
                        tween(this.mapper)
                            .to(0.04, { squashX: 0.68 })
                            .to(0.13, { squashX: 1.18 })
                            .to(0.09, { squashX: 1.0 })
                            .start();
                    }
                }
            }
            return;
        }

        // Warrior-warrior — play only on one side to avoid doubling
        const uuidWins = this.node.uuid < otherW.node.uuid;
        const HIT_THROTTLE_MS = 120;
        const now = Date.now();
        if ((this.launched || this.crossedLine) && uuidWins && now - this._lastHitSoundMs > HIT_THROTTLE_MS) {
            this._lastHitSoundMs = now;
            AudioManager.instance.play(SFX.HIT, hitVol(speed));
        }

        if (this.launched && !this.crossedLine && otherW.crossedLine) this.hitOtherWarrior = true;

        // WildRiver contact — spread only after 300ms of sustained contact
        if (this.onWildRiverContact && otherW && !this._wrsContactCbs.has(otherW)) {
            const src = this, tgt = otherW;
            const cb = () => {
                this._wrsContactCbs.delete(tgt);
                if (src.node?.isValid && tgt.node?.isValid) src.onWildRiverContact?.(src, tgt);
            };
            this._wrsContactCbs.set(tgt, cb);
            this.scheduleOnce(cb, WRS_CONTACT_DELAY);
        }

        // PsychoForce spread — fires once (callback cleared in GameManager after first use)
        if (this.psychoForce && otherW.crossedLine) {
            this.onPsychoContact?.(this, otherW);
        }

        // Brotherhood contact — immediate trigger (next frame via scheduleOnce 0)
        if (this.onBrotherhoodContact && otherW.crossedLine && !this._brContactCbs.has(otherW)) {
            const src = this, tgt = otherW;
            const cb = () => {
                this._brContactCbs.delete(tgt);
                if (src.node?.isValid && tgt.node?.isValid) src.onBrotherhoodContact?.(src, tgt);
            };
            this._brContactCbs.set(tgt, cb);
            this.scheduleOnce(cb, 0);
        }

        if (otherW.level !== this.level) return;
        if (otherW.type !== this.type && !this.psychoForce && !otherW.psychoForce) return;
        if (this.wildRiverSparkle || otherW.wildRiverSparkle) return;
        if (this.onWildRiverContact || otherW.onWildRiverContact) return;
        if (this.onBrotherhoodContact || otherW.onBrotherhoodContact) return;
        if (this.brotherhoodInfected    || otherW.brotherhoodInfected)    return;
        if (this.merging || otherW.merging || this.mergeCallbacks.has(otherW)) return;

        // Snap: equalize velocities so they don't bounce apart
        const rbA = this._rb!;
        const rbB = otherW._rb!;
        const avgX = (rbA.linearVelocity.x + rbB.linearVelocity.x) / 2;
        const avgY = (rbA.linearVelocity.y + rbB.linearVelocity.y) / 2;
        rbA.linearVelocity = new Vec2(avgX, avgY);
        rbB.linearVelocity = new Vec2(avgX, avgY);


        const cb = () => {
            if (!this.node.isValid || !otherW.node.isValid) return;
            if (this.merging || otherW.merging) return;
            if (!this.onMergeReady) return;
            this.merging = true;
            otherW.merging = true;
            this.onMergeReady(this, otherW);
        };
        this.mergeCallbacks.set(otherW, cb);
        this.scheduleOnce(cb, MERGE_DELAY);
    }

    private onEndContact(_self: Collider2D, other: Collider2D): void {
        const otherW = other.node.getComponent(Warrior);
        if (!otherW) return;
        const cb = this.mergeCallbacks.get(otherW);
        if (cb) {
            this.unschedule(cb);
            this.mergeCallbacks.delete(otherW);
        }
        const wrsCb = this._wrsContactCbs.get(otherW);
        if (wrsCb) {
            this.unschedule(wrsCb);
            this._wrsContactCbs.delete(otherW);
        }
        const brCb = this._brContactCbs.get(otherW);
        if (brCb) {
            this.unschedule(brCb);
            this._brContactCbs.delete(otherW);
        }
    }

    private buildGraphics(): void {
        const frame = WarriorSpriteCache.get(WARRIORS[this.type]?.type ?? '', this.level);
        if (frame) {
            this.buildSprite(frame);
        } else {
            this.buildPlaceholderGraphics();
            this.buildLabels();
        }
    }

    private buildSprite(frame: SpriteFrame): void {
        const r = this.radius;
        this.viewNode.addComponent(UITransform).setContentSize(r * 4, r * 4);
        const sp = this.viewNode.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
    }

    private buildPlaceholderGraphics(): void {
        const r     = this.radius;
        const color = WARRIORS[this.type]?.color ?? new Color(200, 200, 200);
        const g     = this.viewNode.addComponent(Graphics);
        const outlineW = Math.max(2, r * 0.12);
        const black    = new Color(0, 0, 0, 255);

        const baseRx = r * 0.85;
        const baseRy = r * 0.22;
        const baseY  = -r * 0.88;
        g.fillColor = new Color(90, 58, 28, 255);
        g.ellipse(0, baseY, baseRx, baseRy);
        g.fill();
        g.strokeColor = black;
        g.lineWidth   = outlineW * 0.8;
        g.ellipse(0, baseY, baseRx, baseRy);
        g.stroke();

        const bodyY = -r * 0.08;
        const bodyR = r * 0.72;
        g.fillColor   = color;
        g.circle(0, bodyY, bodyR);
        g.fill();
        g.strokeColor = black;
        g.lineWidth   = outlineW;
        g.circle(0, bodyY, bodyR);
        g.stroke();

        // Head — lighter tint of species color
        const headY = r * 0.52;
        const headR = r * 0.50;
        g.fillColor = new Color(
            Math.min(255, color.r + 50),
            Math.min(255, color.g + 50),
            Math.min(255, color.b + 50),
            255
        );
        g.circle(0, headY, headR);
        g.fill();
        g.strokeColor = black;
        g.lineWidth   = outlineW * 0.85;
        g.circle(0, headY, headR);
        g.stroke();
    }

    private buildLabels(): void {
        const r = this.radius;

        const levelNode = new Node('Level');
        levelNode.setParent(this.viewNode);
        levelNode.setPosition(0, -r * 0.08);
        const levelLbl = levelNode.addComponent(Label);
        levelLbl.string   = String(this.level);
        levelLbl.fontSize = Math.round(r * 0.75);
        levelLbl.isBold   = true;
        levelLbl.color    = new Color(255, 255, 255, 255);
        levelLbl.enableOutline = true;
        levelLbl.outlineColor  = new Color(0, 0, 0, 255);
        levelLbl.outlineWidth  = 2;

        const typeNode = new Node('Type');
        typeNode.setParent(this.viewNode);
        typeNode.setPosition(0, r * 0.52);
        const typeLbl = typeNode.addComponent(Label);
        typeLbl.string   = (WARRIORS[this.type]?.type ?? '?').substring(0, 2).toUpperCase();
        typeLbl.fontSize = Math.round(r * 0.42);
        typeLbl.isBold   = true;
        typeLbl.color    = new Color(255, 255, 255, 230);
        typeLbl.enableOutline = true;
        typeLbl.outlineColor  = new Color(0, 0, 0, 200);
        typeLbl.outlineWidth  = 1;
    }

    private buildPhysics(): void {
        const rb = this.node.addComponent(RigidBody2D);
        this._rb = rb;
        rb.type = ERigidBody2DType.Dynamic;
        rb.linearDamping  = Warrior.linearDamping;
        rb.angularDamping = 1.5;
        rb.fixedRotation  = false;
        rb.enabledContactListener = true;
        // Continuous collision detection — prevents a fast-launched warrior from tunnelling
        // through the thin funnel walls in a single physics step and sliding off-screen.
        rb.bullet = true;

        const col = this.node.addComponent(CircleCollider2D);
        col.radius      = this.radius;
        col.density     = 8.0;
        col.friction    = Warrior.contactFriction;
        col.restitution = 0.04;
    }
}
