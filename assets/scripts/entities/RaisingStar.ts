import { _decorator, Component, Node, Vec3, Mat4, Sprite, UIOpacity, ParticleSystem2D, Prefab, instantiate, gfx, Color, tween } from 'cc';
import { Stone } from './Stone';
import { Koolkan } from './Koolkan';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Reused scratch (allocation-free).
const _inv = new Mat4();
const _wp = new Vec3();

// ── Look constants (the fast "physics" of the choreography; the headline times are properties) ──
const SPARKLE_NATIVE = 40;   // px the Sparkle prefab's star sprite is authored at → baseScale = sparkleSize / this
const ZOOM_FROM      = 0.2;  // birth zoom-in starts at this fraction of full size
const TRAIL_LINGER   = 0.45; // s the sparkle node lives on AFTER impact so its trailing sparks can finish
const FLASH_IN       = 0.04; // impact-flash pop-in time
const FLASH_OUT      = 0.17; // impact-flash fade-out time
const FLASH_SQUASH   = 0.7;  // vertical squash of the impact flash (reads less like a flat disc — it's on a face)
const MAX_STARS      = 48;   // safety cap on simultaneous stars

/** One live raising-star: its nodes + the choreography state. The star is born at `p0` (FX-local), holds
 *  while flickering and shedding sparks, then accelerates along a bowed bezier to Koolkan's head. */
interface Star {
    root: Node;                 // the Sparkle instance (moved along the path)
    op: UIOpacity | null;       // root opacity (birth fade-in; kept lit so the trail lingers after impact)
    star: Node | null;          // inner sprite node (scaled for zoom-in + flicker)
    trail: ParticleSystem2D | null;
    p0: Vec3;                   // birth point in FX-local space
    side: number;               // ±1: which way the flight path bows
    ox: number; oy: number;     // random offset (px) added to Koolkan's head so repeated hits scatter
    baseScale: number;          // sparkleSize / SPARKLE_NATIVE
    age: number;
}

/**
 * RaisingStar — the signature "struck stone becomes a star that slams into Koolkan" payoff. Authored in
 * the EDITOR: attach to a node (the same one as ManaLightning, or the Arena), assign `sparklePrefab`
 * (the Sparkle: a star Sprite + a sparks-trail ParticleSystem2D), the two impact prefabs
 * (`explosionFlashPrefab` = ImpactFlash, `explosionSparkPrefab` = SparkBurst) and `koolkanHead` (the node
 * to crash into — Koolkan's face).
 *
 * `launch(stone)` plays the full sequence for one struck stone (many can run at once — the curling cascade):
 *   1. POP    — after a beat the stone swells then shrinks to 0 & vanishes (Stone.vanishAsStar) — no rise.
 *   2. BIRTH  — the instant it's gone, a 40px sparkle fades in + zooms in there, then flickers & sheds sparks.
 *   3. FLIGHT — the sparkle ACCELERATES along a curved (bowed-bezier) path into Koolkan's head, trailing sparks.
 *   4. IMPACT — a small explosion (flash + sparks) on Koolkan's face; the sparkle dies, its trail lingering.
 *
 * No Graphics: every visual is a pooled-free prefab instance, animated by tween / driven in update(). The
 * star lives in this node's local space; endpoints are mapped world→local (Koolkan's head is re-read each
 * frame so the star homes onto his idle bob). `autoTestSeconds > 0` loops a test star from `testFrom`.
 */
@ccclass('RaisingStar')
@disallowMultiple
@menu('VFX/RaisingStar')
export class RaisingStar extends Component {
    @property({ type: Prefab, tooltip: 'The Sparkle prefab: a star Sprite (e.g. sparkle.png) plus a sparks ParticleSystem2D trail (FREE position so it streaks behind).' })
    sparklePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Flash popped on Koolkan\'s face at impact (ImpactFlash). Leave empty to skip.' })
    explosionFlashPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Spark burst on Koolkan\'s face at impact (SparkBurst). Leave empty to skip.' })
    explosionSparkPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'The point the star crashes into — Koolkan\'s head/face. Re-read each frame so the star tracks his idle float.' })
    koolkanHead: Node | null = null;

    @property({ range: [0, 1.5, 0.01], slider: true, tooltip: 'Beat (s) after the bolt reaches the stone before it pops: the stone swells then shrinks to 0, and the star is born.' })
    popDelay = 0.5;
    @property({ range: [1, 2, 0.01], slider: true, tooltip: 'How big the struck stone swells (×) before it shrinks to nothing.' })
    popExpand = 1.35;
    @property({ range: [0.1, 0.6, 0.01], slider: true, tooltip: 'Duration (s) of the stone\'s pop (swell + shrink-to-0). The star is born at the end of it.' })
    popTime = 0.28;

    @property({ tooltip: 'On-screen diameter (px) of the sparkle at full size.' })
    sparkleSize = 40;

    @property({ range: [0.05, 0.6, 0.01], slider: true, tooltip: 'How long (s) the sparkle takes to fade in + zoom in where the stone stood.' })
    birthTime = 0.18;

    @property({ range: [0, 0.8, 0.01], slider: true, tooltip: 'How long (s) the sparkle hovers in place (flickering + shedding sparks) before it launches.' })
    holdTime = 0.28;

    @property({ range: [0.2, 1.2, 0.01], slider: true, tooltip: 'How long (s) the flight to Koolkan takes. The star ACCELERATES (eased-in), so it slams home.' })
    flightTime = 0.55;

    @property({ range: [0, 300, 1], slider: true, tooltip: 'How far (px) the flight path bows sideways off the straight line — the curved trajectory. 0 = straight.' })
    curveBow = 130;

    @property({ range: [0, 200, 1], slider: true, tooltip: 'Random radius (px) scattered around Koolkan\'s head where each star actually lands — so repeated hits don\'t all stack on the same pixel. 0 = dead centre.' })
    hitSpread = 45;

    @property({ range: [0, 0.4, 0.01], slider: true, tooltip: 'Flicker strength: the sparkle\'s scale jitters by ±this each frame (the fast trembling). 0 = steady.' })
    flicker = 0.13;

    @property({ range: [0.2, 1.5, 0.01], slider: true, tooltip: 'Peak scale of the impact flash (×128px ImpactFlash sprite).' })
    explosionScale = 0.55;

    @property({ type: Color, tooltip: 'Tint of the sparkle, its sparks and the impact flash (white = textures as authored).' })
    color: Color = new Color(255, 255, 255, 255);

    @property({ type: Node, tooltip: 'Editor test only: start point for the auto-test star (autoTestSeconds). Gameplay passes the struck stone.' })
    testFrom: Node | null = null;
    @property({ tooltip: 'Editor test: spawn a test star from testFrom → koolkanHead every N seconds. 0 = off.' })
    autoTestSeconds = 0;

    private _root: Node | null = null;       // shared parent for every live sparkle / flash / burst
    private readonly _stars: Star[] = [];
    private _warned = false;
    private _boss: Koolkan | null = null;    // resolved from koolkanHead (self or ancestor) so impacts knock him back
    private _bossResolved = false;

    onLoad(): void {
        const root = new Node('RaisingStarFX');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.setPosition(0, 0, 0);
        this._root = root;
    }

    start(): void {
        if (this.autoTestSeconds > 0) {
            this.schedule(() => { if (this.testFrom?.isValid) this._spawnStar(this.testFrom.worldPosition); }, this.autoTestSeconds);
        }
    }

    /** Fire the full sequence for one struck stone: after a beat it pops (swells then shrinks to 0) and
     *  vanishes; the instant it is gone a sparkle is born in its place, flies into Koolkan and explodes. */
    launch(stone: Stone): void {
        if (!stone?.isValid || !stone.viewNode?.isValid) return;
        const from = stone.viewNode.worldPosition.clone();   // the star is born here (the stone pops in place)
        // 1. the stone pops & self-destructs; 2. when it's gone, the sparkle is born where it stood.
        stone.vanishAsStar(this.popDelay, this.popExpand, this.popTime, () => this._spawnStar(from));
    }

    /** Spawn a sparkle at a WORLD position and register it for the birth → flight → impact choreography. */
    private _spawnStar(fromWorld: Readonly<Vec3>): void {
        if (!this._root?.isValid) return;                    // component torn down before the stone finished popping
        if (!this.sparklePrefab) {
            if (!this._warned) { console.warn('[RaisingStar] sparklePrefab not assigned — nothing to spawn'); this._warned = true; }
            return;
        }
        if (this._stars.length >= MAX_STARS) return;

        const root = instantiate(this.sparklePrefab);
        this._applyLayer(root, this._root!.layer);
        root.setParent(this._root);

        Mat4.invert(_inv, this.node.worldMatrix);             // world → this node's local space
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
        if (trail) { trail.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; trail.dstBlendFactor = gfx.BlendFactor.ONE; }   // additive sparks

        const spread = this.hitSpread;
        this._stars.push({ root, op, star, trail, p0, side: Math.random() < 0.5 ? -1 : 1,
            ox: (Math.random() * 2 - 1) * spread, oy: (Math.random() * 2 - 1) * spread, baseScale, age: 0 });
    }

    update(dt: number): void {
        if (!this._stars.length) return;
        const birth = this.birthTime, hold = this.holdTime, fly = Math.max(0.01, this.flightTime);
        for (let i = this._stars.length - 1; i >= 0; i--) {
            const s = this._stars[i];
            s.age += dt;
            const base = s.baseScale;

            if (s.age < birth) {
                // ── BIRTH: fade in + zoom in, sitting where the stone stood (no flicker yet → a clean pop). ──
                const u = s.age / birth;
                const z = base * (ZOOM_FROM + (1 - ZOOM_FROM) * this._easeOutBack(u));
                if (s.star) s.star.setScale(z, z, 1);
                if (s.op) s.op.opacity = Math.round(255 * Math.min(1, u * 1.4));
                s.root.setPosition(s.p0);
                continue;
            }

            const flick = base * (1 + (Math.random() * 2 - 1) * this.flicker);   // fast random tremble
            if (s.star) s.star.setScale(flick, flick, 1);
            if (s.op) s.op.opacity = 255;

            if (s.age < birth + hold) {
                // ── HOLD: hover in place, flickering and shedding sparks (the trail emits the whole time). ──
                s.root.setPosition(s.p0);
                continue;
            }

            // ── FLIGHT: accelerate along a bowed quadratic bezier into Koolkan's head. ──
            const ft = (s.age - birth - hold) / fly;
            if (ft >= 1 || !this._headLocal(_wp)) { this._impact(s); this._stars.splice(i, 1); continue; }
            const u = ft * ft;                                  // eased-in → the star accelerates and slams home
            const p1x = _wp.x + s.ox, p1y = _wp.y + s.oy;   // scatter the landing point around the head
            const mx = (s.p0.x + p1x) / 2, my = (s.p0.y + p1y) / 2;
            const dx = p1x - s.p0.x, dy = p1y - s.p0.y, L = Math.hypot(dx, dy) || 1;
            const cx = mx + (-dy / L) * this.curveBow * s.side; // control point bowed perpendicular to the line
            const cy = my + (dx / L) * this.curveBow * s.side;
            const omu = 1 - u;
            const x = omu * omu * s.p0.x + 2 * omu * u * cx + u * u * p1x;
            const y = omu * omu * s.p0.y + 2 * omu * u * cy + u * u * p1y;
            s.root.setPosition(x, y, 0);
        }
    }

    /** Impact on Koolkan's face: a small explosion (flash + sparks), then the sparkle dies — its star sprite
     *  hidden at once but the node kept alive briefly (trail stopped) so the trailing sparks finish. */
    private _impact(s: Star): void {
        const onHead = this._headLocal(_wp);
        const hx = (onHead ? _wp.x : s.p0.x) + s.ox, hy = (onHead ? _wp.y : s.p0.y) + s.oy;   // same scattered point
        this._flash(hx, hy, this.explosionScale);
        this._burst(this.explosionSparkPrefab, hx, hy);
        this._koolkan()?.hit();                                // knock Koolkan slightly back on impact
        if (s.star?.isValid) s.star.active = false;            // the star is "consumed"; keep root lit for the trail
        if (s.trail?.isValid) s.trail.stopSystem();            // stop emitting; live sparks finish in place (FREE)
        this.scheduleOnce(() => { if (s.root?.isValid) s.root.destroy(); }, TRAIL_LINGER);
    }

    /** Koolkan's head in this node's LOCAL space (where the star path lives). Returns false if unassigned. */
    private _headLocal(out: Vec3): boolean {
        if (!this.koolkanHead?.isValid) return false;
        Mat4.invert(_inv, this.node.worldMatrix);
        Vec3.transformMat4(out, this.koolkanHead.worldPosition, _inv);
        return true;
    }

    /** The Koolkan boss, resolved (once) from `koolkanHead` — whether the head IS his node or a child of it
     *  (e.g. a dedicated face anchor). Null if koolkanHead isn't under a Koolkan → impacts just skip the recoil. */
    private _koolkan(): Koolkan | null {
        if (!this._bossResolved && this.koolkanHead?.isValid) {
            this._bossResolved = true;
            this._boss = this.koolkanHead.getComponent(Koolkan) ?? this.koolkanHead.getComponentInParent(Koolkan);
        }
        return this._boss;
    }

    /** A quick flash that pops in then fades out at (x,y) — the impact burst on Koolkan's face. */
    private _flash(x: number, y: number, peakScale: number): void {
        if (!this.explosionFlashPrefab) return;
        const n = instantiate(this.explosionFlashPrefab);
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        if (sp) { sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.color = this.color; this._additive(sp); }
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;
        this._applyLayer(n, this._root!.layer);
        n.setParent(this._root);
        n.setPosition(x, y, 0);
        n.setScale(peakScale * 0.8, peakScale * 0.8 * FLASH_SQUASH, 1);
        tween(n).to(FLASH_IN + FLASH_OUT, { scale: new Vec3(peakScale, peakScale * FLASH_SQUASH, 1) }, { easing: 'quadOut' }).start();
        tween(op).to(FLASH_IN, { opacity: 255 }).to(FLASH_OUT, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (n.isValid) n.destroy(); }).start();
    }

    /** Pop a particle burst prefab at (x,y) — additive, self-removing. */
    private _burst(prefab: Prefab | null, x: number, y: number): void {
        if (!prefab) return;
        const n = instantiate(prefab);
        this._applyLayer(n, this._root!.layer);
        n.setParent(this._root);
        n.setPosition(x, y, 0);
        const ps = n.getComponent(ParticleSystem2D) ?? n.getComponentInChildren(ParticleSystem2D);
        if (ps) { ps.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; ps.dstBlendFactor = gfx.BlendFactor.ONE; }
        this.scheduleOnce(() => { if (n.isValid) n.destroy(); }, 1.2);
    }

    /** Force a Sprite to ADDITIVE blend (the 2D batcher is driven by the COMPONENT factors, not the material). */
    private _additive(sp: Sprite): void {
        sp.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        sp.dstBlendFactor = gfx.BlendFactor.ONE;
    }

    /** Put a freshly-instantiated tree on `layer` (node.layer doesn't recurse, and our particles must render). */
    private _applyLayer(node: Node, layer: number): void {
        node.layer = layer;
        const kids = node.children;
        for (let i = 0; i < kids.length; i++) this._applyLayer(kids[i], layer);
    }

    // Standard back-out easing (a touch of overshoot) for the birth zoom-in.
    private _easeOutBack(u: number): number {
        const c1 = 1.70158, c3 = c1 + 1, p = u - 1;
        return 1 + c3 * p * p * p + c1 * p * p;
    }

    onDestroy(): void {
        for (let i = 0; i < this._stars.length; i++) { const r = this._stars[i].root; if (r?.isValid) r.destroy(); }
        this._stars.length = 0;
    }
}
