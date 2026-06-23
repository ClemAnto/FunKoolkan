import { _decorator, Component, Node, Vec3, Mat4, Sprite, UITransform, UIOpacity, Color, Prefab, NodePool, instantiate, gfx, ParticleSystem2D, CCInteger } from 'cc';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// Reused scratch (allocation-free).
const _inv = new Mat4();

// ── Look constants ──
const SEG_FADE    = 0.06;  // per-segment fade-in / fade-out time (s)
const FLICKER_HZ  = 40;    // subtle global alpha flicker while visible
const SEG_OVERLAP = 2;     // px added to each segment length so joints don't gap
const MAX_BOLTS   = 24;    // safety cap on simultaneous arcs

/** One live arc: its segment nodes + per-segment opacity, reveal coordinate (0→1 along the bolt) and age. */
interface Bolt { segs: Node[]; ops: UIOpacity[]; revealF: number[]; age: number; }

/**
 * ManaDischarge — the signature point-to-point lightning arc. Authored in the EDITOR: attach to a node,
 * assign the `segmentPrefab` (a Sprite using bolt_segment) and (optionally) the two anchor nodes.
 *
 * Each `strike(aWorld, bWorld)` spawns a NEW arc — many can run AT ONCE (e.g. the TEE stone zapping every
 * same-type stone in the HOUSE). The bolt SHAPE is a jagged polyline around the A→B line; it is RENDERED
 * with no Graphics — one stretched/rotated `bolt_segment` Sprite per polyline segment, pooled via NodePool
 * and composited additively. The arc lives in flat screen space (only the endpoints follow the targets),
 * draws on segment by segment from A→B, holds, then fades out the same way. `autoTestSeconds > 0` fires
 * one between pointA/pointB on a loop for editor testing.
 */
@ccclass('ManaDischarge')
@disallowMultiple
@menu('VFX/ManaDischarge')
export class ManaDischarge extends Component {
    @property({ type: Prefab, tooltip: 'The bolt-segment prefab: a Node with a Sprite using bolt_segment (anchor 0.5/0.5).' })
    segmentPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Optional: crackle burst spawned at both endpoints (a ParticleSystem2D using bolt_shard). Leave empty to skip.' })
    cracklePrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'Editor-test start anchor (point A). Only used by autoTestSeconds — gameplay passes explicit positions.' })
    pointA: Node | null = null;
    @property({ type: Node, tooltip: 'Editor-test end anchor (point B). Only used by autoTestSeconds.' })
    pointB: Node | null = null;

    @property({ tooltip: 'Bolt core thickness in pixels.' })
    thickness = 12;

    @property({ tooltip: 'Pixels per piece: segment count ≈ distance / this. Smaller = more, finer zig-zags (e.g. 20 → ~5 pieces per 100px).' })
    segmentLength = 22;

    @property({ range: [0, 1, 0.01], slider: true, tooltip: 'How jagged the arc is: 0 = nearly straight, 1 = very zig-zag.' })
    jaggedness = 0.5;

    @property({ type: CCInteger, range: [0, 6, 1], slider: true, tooltip: 'Max branches: each strike spawns a random number of forks from 0 to this. 0 = no forks.' })
    maxForks = 3;

    @property({ range: [0.1, 1, 0.01], slider: true, tooltip: 'Branch size vs the trunk: forks get this fraction of the thickness AND segment length (smaller = thinner, finer branches).' })
    forkScale = 0.55;

    @property({ range: [0.1, 1, 0.01], slider: true, tooltip: 'Taper: thickness shrinks toward the end, down to this fraction at the tip (trunk and each branch). 1 = no taper.' })
    tipScale = 0.6;

    @property({ tooltip: 'Draw-on time (s): how long the bolt takes to light up segment by segment from A to B. The draw-off uses the same time.' })
    revealSeconds = 0.12;

    @property({ tooltip: 'Hold time (s): how long the fully-formed bolt stays before it starts fading out.' })
    holdSeconds = 0.06;

    @property({ type: Color, tooltip: 'Tint applied to the bolt (white = show the texture as authored; other hues for coloured discharges).' })
    color: Color = new Color(255, 255, 255, 255);

    @property({ tooltip: 'Editor test: fire a strike every N seconds between A and B. 0 = off.' })
    autoTestSeconds = 0;

    private readonly _pool = new NodePool();
    private _root: Node | null = null;            // shared parent for every live segment
    private _bolts: Bolt[] = [];                  // all arcs currently animating
    private _warned = false;

    onLoad(): void {
        const root = new Node('ManaBolts');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.setPosition(0, 0, 0);
        this._root = root;
    }

    start(): void {
        if (this.autoTestSeconds > 0) this.schedule(() => this.strike(), this.autoTestSeconds);
    }

    /** Fire one arc. With no args it uses pointA/pointB; or pass explicit WORLD positions. Concurrent-safe. */
    strike(aWorld?: Readonly<Vec3>, bWorld?: Readonly<Vec3>): void {
        if (!this.segmentPrefab) {
            if (!this._warned) { console.warn('[ManaDischarge] segmentPrefab not assigned — nothing to render'); this._warned = true; }
            return;
        }
        const aw = aWorld ?? this.pointA?.worldPosition;
        const bw = bWorld ?? this.pointB?.worldPosition;
        if (!aw || !bw) {
            if (!this._warned) { console.warn('[ManaDischarge] no endpoints (assign pointA/pointB or pass world positions)'); this._warned = true; }
            return;
        }
        if (this._bolts.length >= MAX_BOLTS) return;   // never let runaway calls flood the pool

        // World → this node's local space (where the segments are laid out). Only the endpoints are
        // anchored to the targets; the jagged path in between is flat-space, so it ignores perspective.
        Mat4.invert(_inv, this.node.worldMatrix);
        const a = Vec3.transformMat4(new Vec3(), aw, _inv);
        const b = Vec3.transformMat4(new Vec3(), bw, _inv);

        const bolt: Bolt = { segs: [], ops: [], revealF: [], age: 0 };
        this._buildBolt(bolt, a, b);
        this._bolts.push(bolt);

        // Crackle at A right away, then at B when the bolt reaches it (after the draw-on).
        if (this.cracklePrefab) {
            this._burst(a.x, a.y);
            const bx = b.x, by = b.y;
            this.scheduleOnce(() => this._burst(bx, by), this.revealSeconds);
        }
    }

    update(dt: number): void {
        if (!this._bolts.length) return;
        const reveal = Math.max(0.01, this.revealSeconds);
        const hold   = Math.max(0, this.holdSeconds);
        const hide   = reveal;                              // symmetric draw-off
        const total  = reveal + hold + hide + SEG_FADE;

        for (let bi = this._bolts.length - 1; bi >= 0; bi--) {
            const bolt = this._bolts[bi];
            bolt.age += dt;
            if (bolt.age >= total) { this._recycleBolt(bolt); this._bolts.splice(bi, 1); continue; }

            const flick = 0.82 + 0.18 * Math.abs(Math.sin(bolt.age * FLICKER_HZ));
            const ops = bolt.ops, rf = bolt.revealF;
            for (let i = 0; i < ops.length; i++) {
                const f = rf[i];                            // 0 at A … 1 at B (a branch shares its base's f)
                const appearAt = f * reveal;                // staggered fade-in
                const hideAt   = reveal + hold + f * hide;  // staggered fade-out, same order
                let a = Math.min(1, Math.max(0, (bolt.age - appearAt) / SEG_FADE));
                if (bolt.age >= hideAt) a *= 1 - Math.min(1, (bolt.age - hideAt) / SEG_FADE);
                ops[i].opacity = Math.round(255 * a * flick);
            }
        }
    }

    // ── shape: jagged polyline A→B by displacing evenly-spaced points off the line ──
    // Segment COUNT is linear in distance: count ≈ dist / segLen. Each interior point is pushed
    // perpendicular by a smoothed random amount; a sin envelope tapers it to 0 at both ends so the bolt
    // actually meets the two targets.
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
            pts.push(new Vec3(a.x + dx * t + nx * d, a.y + dy * t + ny * d, 0));
            prev = disp;
        }
        pts.push(b.clone());
        return pts;
    }

    private _buildBolt(bolt: Bolt, a: Vec3, b: Vec3): void {
        const main = this._polyline(a, b);
        const mainEdges = main.length - 1;
        this._layout(bolt, main, this.thickness, 0, 1);        // trunk: reveal 0 (at A) → 1 (at B)
        if (this.maxForks > 0 && main.length > 4) {
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
                // Branches are smaller than the trunk (thinner + finer) and light up IN SYNC with it: their
                // reveal starts at the base's coordinate (fi/mainEdges) and runs at the trunk's spatial speed.
                this._layout(bolt, this._polyline(base, end, this.segmentLength * this.forkScale),
                    this.thickness * this.forkScale, fi / mainEdges, flen / dist);
            }
        }
    }

    /** Lay a stretched/rotated bolt_segment Sprite along every edge of the polyline, at the given thickness
     *  (tapered toward the end down to `tipScale`). `fStart`/`fSpan` map this path onto the bolt's reveal
     *  coordinate, so a branch lights up together with the trunk point it grows from. */
    private _layout(bolt: Bolt, pts: Vec3[], thickness: number, fStart: number, fSpan: number): void {
        const edges = pts.length - 1;
        for (let i = 0; i < edges; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
            const seg = this._acquire();
            seg.setPosition((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0);
            seg.angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const taper = edges > 1 ? 1 - (1 - this.tipScale) * (i / (edges - 1)) : 1;   // 1 → tipScale toward the end
            // Size the SPRITE's own node (works whether the Sprite is on the root or a child).
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
        // Per-segment opacity drives the gradual reveal/hide; start invisible.
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 0;
        // Enforce a correctly-proportioned, additive segment every time — guards against a prefab whose
        // Sprite isn't CUSTOM (renders at native texture size → the "fan" artifact) or sits on a child.
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        if (!sp) {
            if (!this._warned) { console.warn('[ManaDischarge] segmentPrefab has no Sprite — add a Sprite (bolt_segment) to it'); this._warned = true; }
        } else {
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.color = this.color;
            sp.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
            if (sp.node !== n) sp.node.setPosition(0, 0, 0);
            // Additive glow. A custom additive material on the prefab would take precedence (also fine).
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] },
            });
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

    private _burst(x: number, y: number): void {
        const n = instantiate(this.cracklePrefab!);
        n.layer = this._root!.layer;
        n.setParent(this._root);
        n.setPosition(x, y, 0);
        // CC 3.8 ParticleSystem2D has no blend dropdown in the inspector — force additive in code
        // (SRC_ALPHA → ONE) so the shards glow. Skipped if the prefab carries an additive custom material.
        const ps = n.getComponent(ParticleSystem2D);
        if (ps) { ps.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; ps.dstBlendFactor = gfx.BlendFactor.ONE; }
        this.scheduleOnce(() => { if (n.isValid) n.destroy(); }, 1.2);
    }

    onDestroy(): void {
        for (let i = 0; i < this._bolts.length; i++) this._recycleBolt(this._bolts[i]);
        this._bolts.length = 0;
        this._pool.clear();
    }
}
