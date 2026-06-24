import { _decorator, Component, Node, Vec3, Mat4, Sprite, UITransform, UIOpacity, Color, Prefab, NodePool, instantiate, gfx, ParticleSystem2D, CCInteger, tween } from 'cc';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Reused scratch (allocation-free).
const _inv = new Mat4();

// ── Look constants (the fast "physics" of the choreography; the headline 2s fade is a property) ──
const SEG_FADE     = 0.06;   // per-segment fade-in time (s)
const FLICKER_HZ   = 40;     // subtle alpha flicker while a bolt is visible
const SEG_OVERLAP  = 2;      // px added to each segment length so joints don't gap
const MAX_BOLTS    = 32;     // safety cap on simultaneous arcs

// Sequence timings (s) — see the phase comments in strike().
const CHARGE       = 0.16;   // phase 1: charge-up at A before the discharge fires
const FLASH_GAP    = 0.07;   // gap between the two flashes of a "double flash"
const CONNECT      = 0.10;   // phase 2→3: discharge → the bolt registers its hit on B
const THIN_DELAY1  = 0.10;   // phase 4: first thin aftershock after the B impact
const THIN_DELAY2  = 0.17;   // phase 4: second thin aftershock
const FLASH_IN     = 0.035;  // flash pop-in time
const FLASH_OUT    = 0.13;   // flash fade-out time
const FLASH_SMALL  = 0.42;   // charge flash scale (×128px)
const FLASH_BIG    = 0.68;   // discharge flash scale at A
const FLASH_HIT    = 0.5;    // impact flash scale at B
const FLASH_SQUASH = 0.5;    // vertical squash so the flash reads as a ground ellipse (perspective)
const FLASH_ZOOM   = 0.8;    // flash enters at this fraction of peak then zooms in to full (a subtle zoom-in)
const FLASH_RISE   = 10;     // px: flashes sit this far above the strike endpoint
const GLOW_PEAK_OP = 205;    // glow peak opacity

/** One live arc: its segment nodes + per-segment opacity, reveal coordinate (0→1 along the bolt), age and
 *  its own timing (so a thick permanent bolt and a quick thin aftershock can coexist with different curves). */
interface Bolt { segs: Node[]; ops: UIOpacity[]; revealF: number[]; age: number; reveal: number; hold: number; fade: number; }

/**
 * ManaLightning — the signature point-to-point lightning discharge (formerly ManaDischarge). Authored in the
 * EDITOR: attach to a node, assign `segmentPrefab` (a Sprite using bolt_segment), `cracklePrefab` (sparks),
 * `flashPrefab` (ImpactFlash) and `glowPrefab` (ManaGlow), plus (optionally) the two anchor nodes.
 *
 * Each `strike(aWorld, bWorld)` plays a full 4-phase sequence between A (source) and B (target) — many can
 * run AT ONCE (the TEE stone zapping every same-type stone in the HOUSE):
 *   1. CHARGE  — A lights up (glow) + a quick double flash at A.
 *   2. DISCHARGE — big flash at A + sparks, a THICK bolt appears whole & instant and holds on B, B lights up.
 *   3. IMPACT  — double flash + sparks at B; the thick bolt begins a slow fade-out (`fadeSeconds`, ~2s).
 *   4. SETTLE  — two quick thin bolts A→B + random sparks at both ends while the main bolt dies down.
 *
 * No Graphics: the bolt is one stretched/rotated `bolt_segment` Sprite per polyline edge (pooled, additive);
 * flashes/glows are pooled-free prefab instances animated by tween. The arc lives in flat screen space
 * (perspective ignored along the path — the jaggedness masks it). `autoTestSeconds > 0` loops a test strike.
 */
@ccclass('ManaLightning')
@disallowMultiple
@menu('VFX/ManaLightning')
export class ManaLightning extends Component {
    @property({ type: Prefab, tooltip: 'The bolt-segment prefab: a Node with a Sprite using bolt_segment (anchor 0.5/0.5).' })
    segmentPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Spark burst spawned at the endpoints (a ParticleSystem2D using bolt_shard). Leave empty to skip.' })
    cracklePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Flash prefab (ImpactFlash: a Sprite using impact_flash) popped at A and B. Leave empty to skip.' })
    flashPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Glow prefab (ManaGlow: a soft Sprite using aura) that lights up the A and B nodes. Leave empty to skip.' })
    glowPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Impact-spark prefab (SparkBurst: a ParticleSystem2D using sparkle) — a small explosion of sparks at the struck stone B when the bolt connects. Leave empty to skip.' })
    impactSparkPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'Editor-test start anchor (point A). Only used by autoTestSeconds — gameplay passes explicit positions.' })
    pointA: Node | null = null;
    @property({ type: Node, tooltip: 'Editor-test end anchor (point B). Only used by autoTestSeconds.' })
    pointB: Node | null = null;

    @property({ tooltip: 'Main bolt core thickness in pixels (the thin aftershocks are a fraction of this).' })
    thickness = 20;

    @property({ tooltip: 'Pixels per piece: segment count ≈ distance / this. Smaller = more, finer zig-zags.' })
    segmentLength = 20;

    @property({ range: [0, 1, 0.01], slider: true, tooltip: 'How jagged the arc is: 0 = nearly straight, 1 = very zig-zag.' })
    jaggedness = 0.2;

    @property({ range: [0.2, 1, 0.01], slider: true, tooltip: 'Perspective squash: the bolt\'s zig-zag is flattened vertically by this factor (1 = none) so the arc reads as lying on the ground plane.' })
    boltSquash = 0.5;

    @property({ type: CCInteger, range: [0, 6, 1], slider: true, tooltip: 'Max branches on the main bolt: each strike spawns 0..this forks. 0 = no forks.' })
    maxForks = 3;

    @property({ range: [0.1, 1, 0.01], slider: true, tooltip: 'Branch size vs the trunk: forks get this fraction of the thickness AND segment length.' })
    forkScale = 0.55;

    @property({ range: [0.1, 1, 0.01], slider: true, tooltip: 'Taper: thickness shrinks toward the end, down to this fraction at the tip. 1 = no taper.' })
    tipScale = 0.6;

    @property({ range: [0.4, 4, 0.05], slider: true, tooltip: 'How long (s) the thick main bolt takes to fade out after it connects — the headline "slow discharge" decay.' })
    fadeSeconds = 0.7;

    @property({ range: [60, 320, 1], slider: true, tooltip: 'Diameter (px) of the glow that lights up the A and B nodes.' })
    glowSize = 150;

    @property({ type: Color, tooltip: 'Tint of the bolt, flashes and glow (white = textures as authored; other hues for coloured discharges).' })
    color: Color = new Color(255, 255, 255, 255);

    @property({ tooltip: 'Editor test: fire a strike every N seconds between A and B. 0 = off.' })
    autoTestSeconds = 0;

    private readonly _pool = new NodePool();
    private _root: Node | null = null;            // shared parent for every live segment / flash / glow
    private _bolts: Bolt[] = [];                  // all arcs currently animating
    private _warned = false;

    onLoad(): void {
        const root = new Node('ManaLightningFX');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.setPosition(0, 0, 0);
        this._root = root;
    }

    start(): void {
        if (this.autoTestSeconds > 0) this.schedule(() => this.strike(), this.autoTestSeconds);
    }

    /** Fire one full sequence. With no args it uses pointA/pointB; or pass explicit WORLD positions. Concurrent-safe. */
    strike(aWorld?: Readonly<Vec3>, bWorld?: Readonly<Vec3>): void {
        if (!this.segmentPrefab) {
            if (!this._warned) { console.warn('[ManaLightning] segmentPrefab not assigned — nothing to render'); this._warned = true; }
            return;
        }
        const aw = aWorld ?? this.pointA?.worldPosition;
        const bw = bWorld ?? this.pointB?.worldPosition;
        if (!aw || !bw) {
            if (!this._warned) { console.warn('[ManaLightning] no endpoints (assign pointA/pointB or pass world positions)'); this._warned = true; }
            return;
        }

        // World → this node's local space (where the arc is laid out, flat, ignoring perspective).
        Mat4.invert(_inv, this.node.worldMatrix);
        const a = Vec3.transformMat4(new Vec3(), aw, _inv);
        const b = Vec3.transformMat4(new Vec3(), bw, _inv);

        // ── Phase 1 — CHARGE: A lights up and double-flashes. ──
        this._glow(a.x, a.y, CHARGE, CONNECT, this.fadeSeconds);
        this._flash(a.x, a.y, FLASH_SMALL);
        this.scheduleOnce(() => this._flash(a.x, a.y, FLASH_SMALL), FLASH_GAP);

        // ── Phase 2 — DISCHARGE: big flash + sparks at A, the thick bolt snaps whole onto B, B lights up. ──
        this.scheduleOnce(() => {
            this._flash(a.x, a.y, FLASH_BIG);
            this._burst(this.cracklePrefab, a.x, a.y);
            // reveal≈instant, hold until the impact registers, then the long fade — so it "appears whole & permanent".
            this._spawnBolt(a, b, this.thickness, 0.02, CONNECT, this.fadeSeconds, true);
            this._glow(b.x, b.y, CONNECT, 0.04, this.fadeSeconds);
        }, CHARGE);

        // ── Phase 3 — IMPACT: double flash + a small spark EXPLOSION at the struck stone B (the main bolt's
        // fade has just begun). The crackle (if assigned) plays too; impactSparkPrefab is the dedicated burst. ──
        this.scheduleOnce(() => {
            this._flash(b.x, b.y, FLASH_HIT);
            this._burst(this.cracklePrefab, b.x, b.y);
            this._burst(this.impactSparkPrefab, b.x, b.y);   // sparkle explosion where the bolt hits
            this.scheduleOnce(() => this._flash(b.x, b.y, FLASH_HIT), FLASH_GAP);
        }, CHARGE + CONNECT);

        // ── Phase 4 — SETTLE: two quick thin aftershocks + random sparks while the main bolt dies down. ──
        const thin = this.thickness * 0.35;
        this.scheduleOnce(() => { this._spawnBolt(a, b, thin, 0.04, 0.02, 0.14, false); this._sparkNear(a); this._sparkNear(b); }, CHARGE + CONNECT + THIN_DELAY1);
        this.scheduleOnce(() => { this._spawnBolt(a, b, thin, 0.04, 0.02, 0.14, false); this._sparkNear(a); this._sparkNear(b); }, CHARGE + CONNECT + THIN_DELAY2);
    }

    update(dt: number): void {
        if (!this._bolts.length) return;
        for (let bi = this._bolts.length - 1; bi >= 0; bi--) {
            const bolt = this._bolts[bi];
            bolt.age += dt;
            const fadeStart = bolt.reveal + bolt.hold;
            const total = fadeStart + bolt.fade + 0.02;
            if (bolt.age >= total) { this._recycleBolt(bolt); this._bolts.splice(bi, 1); continue; }

            const flick = 0.8 + 0.2 * Math.abs(Math.sin(bolt.age * FLICKER_HZ));
            const ops = bolt.ops, rf = bolt.revealF;
            for (let i = 0; i < ops.length; i++) {
                const f = rf[i];                            // 0 at A … 1 at B (a branch shares its base's f)
                const appearAt = f * bolt.reveal;           // staggered fade-in A→B
                let a = Math.min(1, Math.max(0, (bolt.age - appearAt) / SEG_FADE));
                // Uniform fade-out (the whole bolt dims together) — reads as "the energy bleeds out", not a draw-off.
                if (bolt.age > fadeStart) a *= 1 - Math.min(1, (bolt.age - fadeStart) / bolt.fade);
                ops[i].opacity = Math.round(255 * a * flick);
            }
        }
    }

    // ── shape: jagged polyline A→B by displacing evenly-spaced points off the line (perp, smoothed, sin-tapered) ──
    private _polyline(a: Vec3, b: Vec3, segLen: number = this.segmentLength): Vec3[] {
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
        const count = Math.max(2, Math.round(dist / segLen));
        const nx = -dy / dist, ny = dx / dist;                 // unit perpendicular
        const amp = segLen * (0.35 + 1.1 * this.jaggedness);
        const pts: Vec3[] = [a.clone()];
        let prev = 0;
        for (let i = 1; i < count; i++) {
            const t = i / count;
            let disp = (Math.random() * 2 - 1) * amp;
            disp = prev + (disp - prev) * 0.65;                // correlate with the previous offset (less noisy)
            const d = disp * Math.sin(Math.PI * t);            // taper to 0 at A and B
            // Perspective squash: flatten the perpendicular wobble's Y so the arc reads as lying on the ground.
            pts.push(new Vec3(a.x + dx * t + nx * d, a.y + dy * t + ny * d * this.boltSquash, 0));
            prev = disp;
        }
        pts.push(b.clone());
        return pts;
    }

    private _spawnBolt(a: Vec3, b: Vec3, thickness: number, reveal: number, hold: number, fade: number, allowForks: boolean): void {
        if (this._bolts.length >= MAX_BOLTS) return;   // never let runaway calls flood the pool
        const bolt: Bolt = { segs: [], ops: [], revealF: [], age: 0, reveal, hold, fade };
        const main = this._polyline(a, b);
        const mainEdges = main.length - 1;
        this._layout(bolt, main, thickness, 0, 1);             // trunk: reveal 0 (at A) → 1 (at B)
        if (allowForks && this.maxForks > 0 && main.length > 4) {
            const axis = Math.atan2(b.y - a.y, b.x - a.x);
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const nForks = Math.floor(Math.random() * (this.maxForks + 1));   // 0 … maxForks this strike
            for (let k = 0; k < nForks; k++) {
                const fi   = 2 + Math.floor(Math.random() * (main.length - 4));
                const base = main[fi];
                const side = Math.random() < 0.5 ? -1 : 1;
                const fang = axis + side * (0.6 + Math.random() * 0.4);   // ~34–57° off the trunk, forward
                const flen = dist * (0.2 + Math.random() * 0.15);
                const end  = new Vec3(base.x + Math.cos(fang) * flen, base.y + Math.sin(fang) * flen, 0);
                // Branches are smaller and light up IN SYNC with the trunk point they grow from.
                this._layout(bolt, this._polyline(base, end, this.segmentLength * this.forkScale),
                    thickness * this.forkScale, fi / mainEdges, flen / dist);
            }
        }
        this._bolts.push(bolt);
    }

    /** Lay a stretched/rotated bolt_segment Sprite along every edge of the polyline, tapered toward the end.
     *  `fStart`/`fSpan` map this path onto the bolt's reveal coordinate (so a branch reveals with its base). */
    private _layout(bolt: Bolt, pts: Vec3[], thickness: number, fStart: number, fSpan: number): void {
        const edges = pts.length - 1;
        for (let i = 0; i < edges; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
            const seg = this._acquire();
            seg.setPosition((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0);
            seg.angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const taper = edges > 1 ? 1 - (1 - this.tipScale) * (i / (edges - 1)) : 1;   // 1 → tipScale toward the end
            const sp = seg.getComponent(Sprite) ?? seg.getComponentInChildren(Sprite);
            const ui = (sp ? sp.getComponent(UITransform) : null) ?? seg.getComponent(UITransform);
            if (ui) ui.setContentSize(len + SEG_OVERLAP, thickness * taper);
            bolt.segs.push(seg);
            bolt.ops.push(seg.getComponent(UIOpacity)!);
            bolt.revealF.push(Math.min(1, fStart + fSpan * ((i + 0.5) / edges)));
        }
    }

    private _acquire(): Node {
        let n = this._pool.get();
        if (!n) n = instantiate(this.segmentPrefab!);
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;                                        // per-segment opacity drives the reveal/fade
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        if (!sp) {
            if (!this._warned) { console.warn('[ManaLightning] segmentPrefab has no Sprite — add a Sprite (bolt_segment) to it'); this._warned = true; }
        } else {
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.color = this.color;
            sp.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
            if (sp.node !== n) sp.node.setPosition(0, 0, 0);
            this._additive(sp);   // ADD blend (glow)
        }
        n.layer = this._root!.layer;
        n.setParent(this._root);
        n.active = true;
        return n;
    }

    private _recycleBolt(bolt: Bolt): void {
        for (let i = 0; i < bolt.segs.length; i++) this._pool.put(bolt.segs[i]);
        bolt.segs.length = 0;
        bolt.ops.length = 0;
        bolt.revealF.length = 0;
    }

    /** A quick flash sprite that pops in and fades out at (x,y) — the snap of charge/discharge/impact. */
    private _flash(x: number, y: number, peakScale: number): void {
        if (!this.flashPrefab) return;
        const n = instantiate(this.flashPrefab);
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        // ADDITIVE blend, squashed in Y so it reads as a flash lying on the ground plane (perspective).
        if (sp) { sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.color = this.color; this._additive(sp); }
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;
        n.layer = this._root!.layer;
        n.setParent(this._root);
        n.setPosition(x, y + FLASH_RISE, 0);
        n.setScale(peakScale * FLASH_ZOOM, peakScale * FLASH_ZOOM * FLASH_SQUASH, 1);
        tween(n).to(FLASH_IN + FLASH_OUT, { scale: new Vec3(peakScale, peakScale * FLASH_SQUASH, 1) }, { easing: 'quadOut' }).start();
        tween(op).to(FLASH_IN, { opacity: 255 }).to(FLASH_OUT, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (n.isValid) n.destroy(); }).start();
    }

    /** A soft glow that lights up a node: rise → hold → long fall, with a gentle expand. */
    private _glow(x: number, y: number, riseT: number, holdT: number, fallT: number): void {
        if (!this.glowPrefab) return;
        const n = instantiate(this.glowPrefab);
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        if (sp) { sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.color = this.color; this._additive(sp); }
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;
        const s = this.glowSize / 128;                         // aura sprite is 128px
        n.layer = this._root!.layer;
        n.setParent(this._root);
        n.setPosition(x, y, 0);
        n.setScale(s * 0.55, s * 0.55, 1);
        tween(n).to(riseT, { scale: new Vec3(s, s, 1) }, { easing: 'backOut' })
            .to(holdT + fallT, { scale: new Vec3(s * 1.15, s * 1.15, 1) }, { easing: 'sineOut' }).start();
        tween(op).to(riseT, { opacity: GLOW_PEAK_OP }, { easing: 'quadOut' })
            .delay(holdT).to(fallT, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (n.isValid) n.destroy(); }).start();
    }

    private _sparkNear(p: Vec3): void {
        const j = 14;   // px jitter so the aftershock sparks scatter around the endpoint
        this._burst(this.cracklePrefab, p.x + (Math.random() * 2 - 1) * j, p.y + (Math.random() * 2 - 1) * j);
    }

    private _burst(prefab: Prefab | null, x: number, y: number): void {
        if (!prefab) return;
        const n = instantiate(prefab);
        n.layer = this._root!.layer;
        n.setParent(this._root);
        n.setPosition(x, y, 0);
        // CC 3.8 ParticleSystem2D has no blend dropdown in the inspector — force additive in code so shards glow.
        const ps = n.getComponent(ParticleSystem2D);
        if (ps) { ps.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; ps.dstBlendFactor = gfx.BlendFactor.ONE; }
        this.scheduleOnce(() => { if (n.isValid) n.destroy(); }, 1.2);
    }

    /** Force additive (SRC_ALPHA → ONE). For 2D the blend is driven by the Sprite COMPONENT's blend factors —
     *  a material pipeline-state override is IGNORED by the 2D batcher — so set them on the component. */
    private _additive(sp: Sprite): void {
        sp.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        sp.dstBlendFactor = gfx.BlendFactor.ONE;
    }

    onDestroy(): void {
        for (let i = 0; i < this._bolts.length; i++) this._recycleBolt(this._bolts[i]);
        this._bolts.length = 0;
        this._pool.clear();
    }
}
