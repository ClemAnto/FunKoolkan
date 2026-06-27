import { _decorator, Component, Node, Vec3, Mat4, Sprite, UIOpacity, ParticleSystem2D, Prefab, instantiate, gfx, Color, tween } from 'cc';
import { Koolkan } from './Koolkan';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Reused scratch (allocation-free).
const _inv = new Mat4();
const _tw = new Vec3();   // target (Koolkan head) world position
const _tl = new Vec3();   // target in this node's local space

const SPARKLE_NATIVE = 40;   // px the Sparkle prefab's star sprite is authored at
const ZOOM_FROM      = 0.2;  // birth zoom-in starts at this fraction of full size
const TRAIL_LINGER   = 0.45; // s the node lives on after impact so trailing sparks finish
const FLASH_IN       = 0.04;
const FLASH_OUT      = 0.18;
const FLASH_SQUASH   = 0.85;
const MAX_SPIRITS    = 32;

/** One live prayer spirit: born at `p0` (FX-local), zooms in, then flies a bowed bezier into Koolkan. */
interface Spirit {
    root: Node; op: UIOpacity | null; star: Node | null; trail: ParticleSystem2D | null;
    p0: Vec3; side: number; baseScale: number; age: number;
}

/**
 * PrayerSpirit — the purple "spirit" a praying Aku-aku emits (GDD v0.4): same kind of flight as RaisingStar but
 * it homes onto KOOLKAN (not a column cube) and, on impact, gives him 1 energy (Koolkan.addEnergy → wakes at the
 * threshold). Authored in the EDITOR: attach to a node (e.g. the Arena or Koolkan), assign `sparklePrefab` (reuse
 * RaisingStar's Sparkle), `impactFlashPrefab` (ImpactFlash, optional) and `koolkan`. Purple `color` by default.
 *
 * `launch(fromWorld)` spawns one sparkle that fades+zooms in, then accelerates along a curved path into Koolkan's
 * head; on arrival it flashes and calls koolkan.addEnergy(1). Many can fly at once. No Graphics — pooled-free
 * prefab instances animated in update(); the target is re-read each frame so the spirit tracks Koolkan's float.
 */
@ccclass('PrayerSpirit')
@disallowMultiple
@menu('VFX/PrayerSpirit')
export class PrayerSpirit extends Component {
    @property({ type: Prefab, tooltip: 'The Sparkle prefab (reuse RaisingStar\'s): a star Sprite + a sparks ParticleSystem2D trail.' })
    sparklePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Flash popped on Koolkan at impact (ImpactFlash). Leave empty to skip.' })
    impactFlashPrefab: Prefab | null = null;

    @property({ type: Koolkan, tooltip: 'The boss the spirit flies into and energises (addEnergy on impact).' })
    koolkan: Koolkan | null = null;

    @property({ type: Node, tooltip: 'Optional flight destination — Koolkan\'s head. Empty → Koolkan\'s own node.' })
    head: Node | null = null;

    @property({ type: Color, tooltip: 'Tint of the spirit, its sparks and the impact flash (purple).' })
    color: Color = new Color(170, 80, 255, 255);

    @property({ tooltip: 'On-screen diameter (px) of the spirit at full size.' })
    sparkleSize = 36;
    @property({ range: [0.05, 0.6, 0.01], slider: true, tooltip: 'Fade-in + zoom-in time (s) at birth.' })
    birthTime = 0.16;
    @property({ range: [0.2, 1.5, 0.01], slider: true, tooltip: 'Flight time (s) to Koolkan. The spirit accelerates (eased-in).' })
    flightTime = 0.75;
    @property({ range: [0, 300, 1], slider: true, tooltip: 'How far (px) the path bows sideways off the straight line. 0 = straight.' })
    curveBow = 110;
    @property({ range: [0.2, 1.5, 0.01], slider: true, tooltip: 'Peak scale of the impact flash (×128px ImpactFlash sprite).' })
    explosionScale = 0.5;

    private _root: Node | null = null;
    private readonly _spirits: Spirit[] = [];
    private _warned = false;

    onLoad(): void {
        const r = new Node('PrayerSpiritFX');
        r.layer = this.node.layer;
        r.setParent(this.node);
        r.setPosition(0, 0, 0);
        this._root = r;
    }

    /** Launch a purple spirit from `fromWorld` that flies into Koolkan and gives him 1 energy on impact. */
    launch(fromWorld: Readonly<Vec3>): void {
        if (!this._root?.isValid || !this.sparklePrefab) {
            if (!this._warned) { console.warn('[PrayerSpirit] sparklePrefab not assigned — nothing to spawn'); this._warned = true; }
            return;
        }
        if (!this.koolkan?.node?.isValid) return;
        if (this._spirits.length >= MAX_SPIRITS) return;

        const root = instantiate(this.sparklePrefab);
        this._applyLayer(root, this._root.layer);
        root.setParent(this._root);
        Mat4.invert(_inv, this.node.worldMatrix);
        const p0 = Vec3.transformMat4(new Vec3(), fromWorld, _inv);
        root.setPosition(p0);

        const op = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        op.opacity = 0;
        const sp = root.getComponentInChildren(Sprite);
        if (sp) { sp.color = this.color; this._additive(sp); }
        const star = sp?.node ?? root;
        const baseScale = this.sparkleSize / SPARKLE_NATIVE;
        star.setScale(baseScale * ZOOM_FROM, baseScale * ZOOM_FROM, 1);
        const trail = root.getComponentInChildren(ParticleSystem2D);
        if (trail) {
            trail.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; trail.dstBlendFactor = gfx.BlendFactor.ONE;
            // the sprite tint doesn't reach the trail particles → tint them too (keep their alpha fade)
            trail.startColor = new Color(this.color.r, this.color.g, this.color.b, trail.startColor.a);
            trail.endColor = new Color(this.color.r, this.color.g, this.color.b, trail.endColor.a);
        }

        this._spirits.push({ root, op, star, trail, p0, side: Math.random() < 0.5 ? -1 : 1, baseScale, age: 0 });
    }

    /** Cancel every spirit in flight: stop them, fade out, then destroy — NO impact, no energy. Used at round-up. */
    cancelAll(): void {
        for (let i = 0; i < this._spirits.length; i++) {
            const s = this._spirits[i];
            if (!s.root?.isValid) continue;
            if (s.trail?.isValid) s.trail.stopSystem();
            const op = s.op;
            if (op) tween(op).to(0.25, { opacity: 0 }, { easing: 'quadOut' }).call(() => { if (s.root?.isValid) s.root.destroy(); }).start();
            else { const root = s.root; this.scheduleOnce(() => { if (root?.isValid) root.destroy(); }, 0.25); }
        }
        this._spirits.length = 0;   // stop driving them in update(); they fade & self-destroy on their own
    }

    update(dt: number): void {
        if (!this._spirits.length) return;
        const birth = this.birthTime, fly = Math.max(0.01, this.flightTime);
        for (let i = this._spirits.length - 1; i >= 0; i--) {
            const s = this._spirits[i];
            s.age += dt;
            const base = s.baseScale;

            if (s.age < birth) {                                   // BIRTH: fade in + zoom in where the Aku prayed
                const u = s.age / birth;
                const z = base * (ZOOM_FROM + (1 - ZOOM_FROM) * u);
                if (s.star) s.star.setScale(z, z, 1);
                if (s.op) s.op.opacity = Math.round(255 * Math.min(1, u * 1.4));
                s.root.setPosition(s.p0);
                continue;
            }
            if (s.star) s.star.setScale(base, base, 1);
            if (s.op) s.op.opacity = 255;

            const ft = (s.age - birth) / fly;
            if (ft >= 1 || !this._targetLocal(_tl)) { this._impact(s); this._spirits.splice(i, 1); continue; }
            const u = ft * ft;                                     // eased-in → accelerates into Koolkan
            const p1x = _tl.x, p1y = _tl.y;
            const mx = (s.p0.x + p1x) / 2, my = (s.p0.y + p1y) / 2;
            const dx = p1x - s.p0.x, dy = p1y - s.p0.y, L = Math.hypot(dx, dy) || 1;
            const cx = mx + (-dy / L) * this.curveBow * s.side;    // control point bowed perpendicular to the line
            const cy = my + (dx / L) * this.curveBow * s.side;
            const omu = 1 - u;
            s.root.setPosition(
                omu * omu * s.p0.x + 2 * omu * u * cx + u * u * p1x,
                omu * omu * s.p0.y + 2 * omu * u * cy + u * u * p1y, 0);
        }
    }

    /** Impact at Koolkan: a flash, +1 energy, then the spirit dies (trail lingers). */
    private _impact(s: Spirit): void {
        const onTarget = this._targetLocal(_tl);
        const hx = onTarget ? _tl.x : s.p0.x, hy = onTarget ? _tl.y : s.p0.y;
        this._flash(hx, hy);
        this.koolkan?.addEnergy(1);
        if (s.star?.isValid) s.star.active = false;
        if (s.trail?.isValid) s.trail.stopSystem();
        this.scheduleOnce(() => { if (s.root?.isValid) s.root.destroy(); }, TRAIL_LINGER);
    }

    /** Koolkan's head (or node) in this node's LOCAL space, re-read each frame so the spirit tracks his float. */
    private _targetLocal(out: Vec3): boolean {
        const t = this.head?.isValid ? this.head : this.koolkan?.node;
        if (!t?.isValid) return false;
        Mat4.invert(_inv, this.node.worldMatrix);
        t.getWorldPosition(_tw);
        Vec3.transformMat4(out, _tw, _inv);
        return true;
    }

    private _flash(x: number, y: number): void {
        if (!this.impactFlashPrefab) return;
        const n = instantiate(this.impactFlashPrefab);
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        if (sp) { sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.color = this.color; this._additive(sp); }
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;
        this._applyLayer(n, this._root!.layer);
        n.setParent(this._root);
        n.setPosition(x, y, 0);
        const peak = this.explosionScale;
        n.setScale(peak * 0.8, peak * 0.8 * FLASH_SQUASH, 1);
        tween(n).to(FLASH_IN + FLASH_OUT, { scale: new Vec3(peak, peak * FLASH_SQUASH, 1) }, { easing: 'quadOut' }).start();
        tween(op).to(FLASH_IN, { opacity: 255 }).to(FLASH_OUT, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (n.isValid) n.destroy(); }).start();
    }

    private _additive(sp: Sprite): void {
        sp.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        sp.dstBlendFactor = gfx.BlendFactor.ONE;
    }

    private _applyLayer(node: Node, layer: number): void {
        node.layer = layer;
        const kids = node.children;
        for (let i = 0; i < kids.length; i++) this._applyLayer(kids[i], layer);
    }

    onDestroy(): void {
        for (let i = 0; i < this._spirits.length; i++) if (this._spirits[i].root?.isValid) this._spirits[i].root.destroy();
        this._spirits.length = 0;
    }
}
