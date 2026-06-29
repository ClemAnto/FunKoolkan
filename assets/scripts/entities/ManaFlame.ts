import { _decorator, Component, Node, Prefab, instantiate, Vec3, resources, Color, Graphics, Sprite, ParticleSystem2D, Animation, RigidBody2D, UIOpacity, UITransform, gfx, tween, Tween } from 'cc';
import { EDITOR } from 'cc/env';
import { projectX, projectY, sizeXFactor, sizeYFactor, physicsDepth, physicsWidth } from '../config/Perspective';
import { GameMode } from '../config/GameMode';
import { DebugDraw } from '../config/DebugDraw';
import { Stone } from './Stone';
import { Overpower } from './Overpower';
import { StoneLauncher } from './StoneLauncher';

const { ccclass, property, disallowMultiple, menu } = _decorator;

// ── pacing / placement (internal tuning) ──
const SPAWN_EVERY   = 5;     // shots between flames (one flame at a time) — the scarcity knob
const LIFE_SHOTS    = 3;     // a flame vanishes if it survives this many shots unused (GDD: "in 3 lanci")
const MOVE_THRESHOLD = 40;   // ground u/s above which a rune counts as "in flight" — a shot ENDS when the arena drops below this (all still)
const AREA_FACTOR  = 1.0;    // contact-area radius as a fraction of the flame SPRITE's footprint (1 = full sprite). MAIN KNOB.
const AREA_FALLBACK = 25;    // ground-radius fallback until the flame view's sprite has been measured
const FLAME_VIEW_SCALE = 0.9; // upright sprite scale (× arena fit × depth) — tune to the ManaFlame prefab art
const POP_IN        = 0.22;  // s: scale-up "pop" when the flame appears
const POP_OUT       = 0.16;  // s: scale-down "pop" when the flame leaves
// ── round-1 opening state ──
const CLUSTER_SIZE  = 3;     // runes per opening cluster (3 separate clusters, one per type)
const CLUSTER_Y     = 0.78;  // CENTRE cluster depth (0 = near/bottom, 1 = far/top)
const CLUSTER_SPREAD = 0.24; // horizontal offset of the left/right clusters as a fraction of the arena width (pulled IN from the borders)
const CLUSTER_SIDE_DROP = 0.1; // the two lateral clusters sit this much LOWER (toward the near edge) than the centre — fraction of depth
const FLAME_CENTER_Y = 0.5;  // the opening flame sits at the arena centre

const _v = new Vec3();       // scratch: project a ground point → world

/**
 * MANA FLAME (GameMode.stickyPrototype) — the detonator source. A flame appears in the arena every SPAWN_EVERY
 * launches (one at a time); fly a launched rune THROUGH it in a single shot and that rune IGNITES (see
 * Overpower): it gains a speed boost, ricochets, and detonates the same-colour cluster it lands in. An unused
 * flame vanishes after LIFE_SHOTS launches. At game start it seeds the opening state: a 5-rune cluster at the
 * far end + one flame at the centre (so the very first shot can thread centre→cluster).
 *
 * Editor: drop this component on any arena node. It finds the launcher (arena, stone layer, spawn, radius) via
 * StoneLauncher.instance — no wiring needed. Optionally assign `flamePrefab` (an authored flame) else a glowing
 * placeholder is loaded from resources.
 */
@ccclass('ManaFlame')
@disallowMultiple
@menu('Arena/ManaFlame')
export class ManaFlame extends Component {
    @property({ type: Prefab, tooltip: 'Authored flame VFX (a Sprite/ParticleSystem2D). Leave empty to use a glowing placeholder loaded from resources.' })
    flamePrefab: Prefab | null = null;

    private _active = false;
    private _view: Node | null = null;
    private _gx = 0;
    private _gy = 0;
    private _shots = 0;            // SHOTS (launches) elapsed since this flame appeared — its unused lifetime
    private _sinceLast = 0;        // SHOTS (launches) since the last flame ended — drives the next spawn (every SPAWN_EVERY)
    private _lastLaunch = 0;       // StoneLauncher.launchCount seen last frame (to count new shots)
    private _wasMoving = false;    // was the arena moving last frame? (the spawn/despawn fires on the moving→still transition)
    private _initDone = false;
    private _logT = 0;             // debug log throttle
    private _areaHit = false;      // debug: a stone is currently overlapping the area → draw the outline thicker
    private readonly _exempt = new Set<Stone>();   // runes already overlapping when the flame appeared → not ignited until they leave
    private _dbg: Graphics | null = null;   // debug overlay for the detection area (under the world)
    private readonly _pop = { v: 0 };       // pop-in/out scale factor (0..1), tweened; baked into _projectFlame
    private _popTween: Tween<{ v: number }> | null = null;
    private _popOut = false;       // true while the flame is shrinking away (detection already off)

    // Placeholder flame prefab, loaded once from resources/ (undefined = not requested, null = loading/failed).
    private static _ph: Prefab | null | undefined = undefined;
    // Flame sprite half-width (px), measured from the first created view (same prefab → static cache).
    private static _spriteHalf = 0;

    /** Contact-area radius in GROUND px, DERIVED FROM THE FLAME SPRITE: half-width × FLAME_VIEW_SCALE × AREA_FACTOR
     *  (so it scales with the sprite, like the tee's area). Falls back to a constant until the sprite is measured. */
    private _areaRadius(): number {
        return ManaFlame._spriteHalf > 0 ? ManaFlame._spriteHalf * FLAME_VIEW_SCALE * AREA_FACTOR : AREA_FALLBACK;
    }

    private _launcher(): StoneLauncher | null { return StoneLauncher.instance; }
    private _arena(): Node | null { return this._launcher()?.arena ?? null; }
    private _layer(): Node | null { const l = this._launcher(); return l?.stoneLayer ?? l?.arena ?? null; }

    update(dt: number): void {
        if (EDITOR || !GameMode.stickyPrototype) return;
        if (physicsDepth() <= 0 || !this._launcher()?.arena?.isValid) return;   // wait for perspective + launcher

        if (!this._initDone) { this._openingState(); this._initDone = true; this._wasMoving = false; this._lastLaunch = StoneLauncher.launchCount; }

        // Count SHOTS (real launches): every SPAWN_EVERY shots a flame is due; LIFE_SHOTS = its unused life.
        const lc = StoneLauncher.launchCount;
        if (lc > this._lastLaunch) {
            const n = lc - this._lastLaunch; this._lastLaunch = lc;
            if (this._active) this._shots += n; else this._sinceLast += n;
        }
        // The spawn/despawn ACTION fires at the shot's END (arena moving→still), so the flame appears/leaves when
        // things have settled — not mid-flight.
        const moving = this._anyRuneMoving();
        if (this._wasMoving && !moving) this._registerShotEnd();
        this._wasMoving = moving;

        if (this._active) { this._ensureView(); this._tryIgnite(dt); }   // ensure view each frame (prefab loads async)
        if (this._view?.isValid) this._projectFlame();   // keep positioned while it exists (incl. the pop-out)
        this._drawDebug();
    }

    /** Round-1 opening: THREE separate clusters of CLUSTER_SIZE runes at the far end — one per type, placed
     *  left / centre / right. The CENTRE cluster matches the loaded rune so the onboarding shot (straight up,
     *  through the centre flame) detonates it. Plus one flame at the centre. */
    private _openingState(): void {
        const L = this._launcher();
        if (!L) return;
        const D = physicsDepth(), W = physicsWidth(), r = L.stoneRadius;
        const cy = D * CLUSTER_Y, sideY = D * (CLUSTER_Y - CLUSTER_SIDE_DROP);   // laterals a bit lower than the centre
        const spread = W * CLUSTER_SPREAD, loaded = L.loadedType;
        const others = [0, 1, 2].filter((t) => t !== loaded);   // the two non-loaded active types
        const cols = [
            { x: -spread, y: sideY, type: others[0] ?? loaded },   // left (lower)
            { x: 0,        y: cy,    type: loaded },                // centre = loaded → onboarding shot detonates it
            { x: spread,  y: sideY, type: others[1] ?? loaded },   // right (lower)
        ];
        const spots: [number, number][] = [[-1.0, 0], [1.0, 0], [0, 1.7]];   // a tight 3-rune triangle (centres ~2r apart)
        for (const c of cols) {
            for (let i = 0; i < CLUSTER_SIZE && i < spots.length; i++) {
                L.spawnRestingStone(c.x + spots[i][0] * r, c.y + spots[i][1] * r, c.type);
            }
        }
        this._spawnAt(0, D * FLAME_CENTER_Y);   // opening flame at the centre (threads up into the centre cluster)
    }

    /** A shot has ended (the arena settled): if a flame is up and has gone unused for LIFE_SHOTS shots, it leaves
     *  (white flash); otherwise, once SPAWN_EVERY shots have passed since the last flame, a new one appears. The
     *  shot COUNTING happens per-launch in update(); this only applies the thresholds at the settle moment. */
    private _registerShotEnd(): void {
        if (this._active) {
            if (this._shots >= LIFE_SHOTS) this._despawn(true);   // unused for LIFE_SHOTS shots → vanish with a white flash
        } else if (this._sinceLast >= SPAWN_EVERY) {
            this._spawnRandom();
        }
    }

    /** True if any rune is still in flight (faster than MOVE_THRESHOLD) — used to detect the end of a shot. */
    private _anyRuneMoving(): boolean {
        const all = Stone.all;
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (!s.node?.isValid) continue;
            const rb = s.getComponent(RigidBody2D);
            if (!rb) continue;
            const v = rb.linearVelocity;
            if (v.x * v.x + v.y * v.y > MOVE_THRESHOLD * MOVE_THRESHOLD) return true;
        }
        return false;
    }

    /** Spawn a flame at a random OPEN ground point (not under an existing rune). Retries a few times; if the
     *  arena is too crowded it skips this spawn and tries again on the next shot-end. */
    private _spawnRandom(): void {
        const D = physicsDepth(), W = physicsWidth();
        for (let attempt = 0; attempt < 12; attempt++) {
            const gx = (Math.random() - 0.5) * W * 0.7;
            const gy = D * (0.25 + Math.random() * 0.55);
            if (!this._occupied(gx, gy)) { this._spawnAt(gx, gy); return; }
        }
        // every candidate landed on a rune → don't spawn now (the cadence retries next shot-end)
    }

    /** Whether a rune already overlaps the ground point (flame radius + the rune's radius) — so a flame never
     *  appears under an existing rune. */
    private _occupied(gx: number, gy: number): boolean {
        const all = Stone.all;
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (!s.node?.isValid) continue;
            const p = s.node.position, rr = this._areaRadius() + s.radius;
            const dx = p.x - gx, dy = p.y - gy;
            if (dx * dx + dy * dy < rr * rr) return true;
        }
        return false;
    }

    private _spawnAt(gx: number, gy: number): void {
        this._gx = gx; this._gy = gy;
        this._active = true; this._shots = 0; this._sinceLast = 0; this._popOut = false;
        this._fillExempt();   // whatever already overlaps the flame the instant it appears is exempt (no auto-ignite)
        this._ensureView();
        this._popTween?.stop();                       // cancel any in-flight pop (e.g. a pending pop-out destroy)
        this._pop.v = 0;
        this._popTween = tween(this._pop).to(POP_IN, { v: 1 }, { easing: 'backOut' }).start();   // pop IN
        this._projectFlame();
        console.log(`[ManaFlame] flame spawned at ground (${gx.toFixed(0)}, ${gy.toFixed(0)}), reach ${this._areaRadius().toFixed(0)}`);
    }

    private _despawn(withFlash = false): void {
        if (this._popOut || (!this._active && !this._view)) return;   // already leaving / nothing to do
        this._active = false; this._sinceLast = 0; this._popOut = true;
        if (this._dbg?.isValid) this._dbg.clear();
        if (withFlash && this._view?.isValid) this._popWhiteFlash(this._view.worldPosition.clone(), this._view.scale.x);   // expired unused → white flash
        const dying = this._view;   // keep projecting it during the shrink, then destroy THIS node (avoids races)
        this._popTween?.stop();
        if (!dying?.isValid) { this._view = null; this._popOut = false; return; }
        this._popTween = tween(this._pop).to(POP_OUT, { v: 0 }, { easing: 'backIn' })   // pop OUT
            .call(() => {
                if (dying.isValid) dying.destroy();
                if (this._view === dying) this._view = null;
                this._popOut = false;
            }).start();
    }

    /** A rune whose on-screen footprint OVERLAPS the flame area is ignited (gains Overpower) and the flame is
     *  consumed — the SAME test the House tee uses (projected stone position vs the zone ellipse, inflated by the
     *  stone's on-screen radii), so the flame "activates" exactly like the tee does in the debug. An ENTRY guard
     *  (it must NOT have already overlapped one frame ago) skips a rune the flame spawned on top of and works at
     *  any speed (a fast rune that was outside last frame and overlaps now still ignites). */
    private _tryIgnite(dt: number): void {
        this._logT += dt;
        // flame zone as an on-screen ellipse (the projected ground circle) — same space/test as the tee's zone
        const fvx = projectX(this._gx, this._gy), fvy = projectY(this._gy);
        const frx = this._areaRadius() * sizeXFactor(this._gy), fry = this._areaRadius() * sizeYFactor(this._gy);
        const all = Stone.all;
        let nearest = Infinity, hit = false;
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (!s.node?.isValid || s.getComponent(Overpower)) continue;
            const p = s.node.position;
            const svx = projectX(p.x, p.y), svy = projectY(p.y);                       // projected stone centre
            const srx = s.radius * sizeXFactor(p.y), sry = s.radius * sizeYFactor(p.y); // its on-screen radii
            const d = this._overlapValue(fvx, fvy, frx, fry, svx, svy, srx, sry);       // <=1 means touching (tee test)
            if (d < nearest) nearest = d;
            if (d > 1) { this._exempt.delete(s); continue; }                            // outside → eligible if it re-enters
            hit = true;                                                                 // overlapping → debug outline thickens
            if (this._exempt.has(s)) continue;                                          // was already inside when the flame appeared → wait until it leaves
            if (s !== StoneLauncher.lastFired) continue;                                // ONLY the current-turn rune ignites (not other runes rolling through)
            const op = s.addComponent(Overpower);
            op.radius = s.radius;
            op.ignite();          // boost + inflamed look + wall-bounce re-boosts
            console.log('[ManaFlame] IGNITED — rune entered the flame area');
            this._despawn();      // flame consumed
            return;
        }
        this._areaHit = hit;
        if (nearest < 4 && this._logT >= 0.12) {   // a rune is within ~2× the touch ellipse → report how close
            this._logT = 0;
            console.log(`[ManaFlame] nearest rune overlap=${nearest.toFixed(2)} (<=1 touches) — flame ground (${this._gx.toFixed(0)},${this._gy.toFixed(0)})`);
        }
    }

    /** Record the runes already overlapping the flame the instant it appears — they are exempt from ignition
     *  until they leave (so the flame never auto-detonates a rune it simply spawned on top of). */
    private _fillExempt(): void {
        this._exempt.clear();
        const fvx = projectX(this._gx, this._gy), fvy = projectY(this._gy);
        const frx = this._areaRadius() * sizeXFactor(this._gy), fry = this._areaRadius() * sizeYFactor(this._gy);
        const all = Stone.all;
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (!s.node?.isValid) continue;
            const p = s.node.position;
            const svx = projectX(p.x, p.y), svy = projectY(p.y);
            const srx = s.radius * sizeXFactor(p.y), sry = s.radius * sizeYFactor(p.y);
            if (this._overlapValue(fvx, fvy, frx, fry, svx, svy, srx, sry) <= 1) this._exempt.add(s);
        }
    }

    /** Normalised ellipse-overlap value (House tee test): the zone ellipse is inflated by the stone's on-screen
     *  radii and the stone treated as a point; <= 1 means it overlaps ("touching"). */
    private _overlapValue(zx: number, zy: number, zrx: number, zry: number, svx: number, svy: number, srx: number, sry: number): number {
        const ex = zrx + srx, ey = zry + sry;
        if (ex <= 0 || ey <= 0) return Infinity;
        const dx = svx - zx, dy = svy - zy;
        return (dx * dx) / (ex * ex) + (dy * dy) / (ey * ey);
    }

    /** Debug overlay (toggled by the global DEBUG): the flame's CONTACT AREA — a ground circle of
     *  the sprite-derived area radius drawn as a perspective ellipse on the floor (model-aware ground tilt), like the
     *  tee. Drawn on its own Graphics under the arena's PARENT, mirroring the arena transform (the Pole pattern),
     *  so it is independent of the upright flame sprite. */
    private _drawDebug(): void {
        const arena = this._arena(), world = arena?.parent;
        if (!this._active || !DebugDraw.enabled || !arena?.isValid || !world?.isValid) {
            if (this._dbg?.isValid) this._dbg.clear();
            return;
        }
        if (!this._dbg?.isValid) {
            const n = new Node('FlameAreaDebug');
            n.layer = arena.layer;
            n.setParent(world);
            this._dbg = n.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(255, 0, 255, 235);   // magenta
        }
        const dn = this._dbg.node;
        dn.setSiblingIndex(world.children.length - 1);   // above the stone-layer sprites
        dn.setPosition(arena.position);
        dn.setScale(arena.scale);
        const g = this._dbg;
        const cx = projectX(this._gx, this._gy), cy = projectY(this._gy);
        const rx = this._areaRadius() * sizeXFactor(this._gy), ry = this._areaRadius() * sizeYFactor(this._gy);   // flat ground disc (the contact area, model-aware)
        g.clear();
        g.lineWidth = this._areaHit ? 7 : 3;   // thickens while a stone overlaps the area (like the tee)
        g.ellipse(cx, cy, rx, ry);
        g.stroke();
    }

    private _ensureView(): void {
        if (this._view?.isValid) return;
        const layer = this._layer();   // the RUNE layer → the flame is Y-sorted (DepthSort) with the runes (same z-index)
        if (!layer?.isValid) { console.warn('[ManaFlame] no stone layer yet — cannot create the flame view'); return; }
        const prefab = this.flamePrefab ?? ManaFlame._loadPlaceholder();
        if (!prefab) return;   // prefab still loading (or failed) → see the loader log
        const n = instantiate(prefab) as unknown as Node;
        n.getComponent(ManaFlame)?.destroy();   // safety: the flame ART prefab must NOT carry this director script
        n.layer = layer.layer;
        n.setParent(layer);
        n.active = true;
        this._view = n;
        // Start any particle system inside (project prefabs ship ParticleSystem2D with playOnLoad:false and are
        // played explicitly — like StoneExplosion/SparkBurst), and keep it alive (no auto-remove) as it loops.
        const particles = n.getComponentsInChildren(ParticleSystem2D);
        for (let i = 0; i < particles.length; i++) { particles[i].autoRemoveOnFinish = false; particles[i].resetSystem(); }
        // Auto-play any hand-authored Animation clip inside the prefab (so it runs without relying on playOnLoad).
        const anims = n.getComponentsInChildren(Animation);
        for (let i = 0; i < anims.length; i++) anims[i].play();
        const sprites = n.getComponentsInChildren(Sprite);
        if (ManaFlame._spriteHalf <= 0 && sprites.length) {   // measure the flame sprite once → drives the contact-area size
            const ut = sprites[0].getComponent(UITransform);
            if (ut && ut.contentSize.width > 0) ManaFlame._spriteHalf = ut.contentSize.width * 0.5;
        }
        console.log(`[ManaFlame] view created (src=${this.flamePrefab ? 'flamePrefab' : 'resources/prefabs/ManaFlame'}, sprites=${sprites.length}, particles=${particles.length}, anims=${anims.length}, spriteHalf=${ManaFlame._spriteHalf.toFixed(0)})`);
    }

    /** Position the UPRIGHT flame sprite via the 1-point projection and shrink it uniformly with depth (NOT
     *  squashed — the squash is only for the ground-plane contact area, drawn in debug). */
    private _projectFlame(): void {
        const arena = this._arena(), view = this._view;
        if (!arena?.isValid || !view?.isValid) { this._ensureView(); return; }
        _v.set(projectX(this._gx, this._gy), projectY(this._gy), 0);
        Vec3.transformMat4(_v, _v, arena.worldMatrix);
        view.setWorldPosition(_v);
        const ws = arena.worldScale;
        const s = FLAME_VIEW_SCALE * sizeXFactor(this._gy) * this._pop.v;   // uniform (upright, depth) × pop-in/out factor
        view.setWorldScale(ws.x * s, ws.y * s, 1);
    }

    private static _loadPlaceholder(): Prefab | null {
        if (ManaFlame._ph !== undefined) return ManaFlame._ph;
        ManaFlame._ph = null;
        resources.load('prefabs/ManaFlame', Prefab, (err, p) => {
            ManaFlame._ph = err ? null : p;
            if (err) console.warn('[ManaFlame] FAILED to load resources/prefabs/ManaFlame — assign flamePrefab or check the prefab import', err);
            else console.log('[ManaFlame] loaded resources/prefabs/ManaFlame');
        });
        return null;
    }

    // White-flash prefab (ImpactFlash), loaded once from resources.
    private static _flashPf: Prefab | null | undefined = undefined;
    private static _loadFlash(): Prefab | null {
        if (ManaFlame._flashPf !== undefined) return ManaFlame._flashPf;
        ManaFlame._flashPf = null;
        resources.load('prefabs/ImpactFlash', Prefab, (err, p) => { ManaFlame._flashPf = err ? null : p; });
        return null;
    }

    /** A quick WHITE flash (ImpactFlash) at `world`, sized off the flame's local scale — popped when the flame
     *  vanishes UNUSED. Additive, pops in and fades out, self-removing. */
    private _popWhiteFlash(world: Vec3, localScale: number): void {
        const prefab = ManaFlame._loadFlash(), layer = this._layer();
        if (!prefab || !layer?.isValid) return;
        const n = instantiate(prefab) as unknown as Node;
        n.layer = layer.layer;
        n.setParent(layer);
        n.setWorldPosition(world);
        const sp = n.getComponent(Sprite) ?? n.getComponentInChildren(Sprite);
        if (sp) { sp.color = Color.WHITE; sp.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA; sp.dstBlendFactor = gfx.BlendFactor.ONE; }
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 255;
        const s0 = localScale * 0.7, s1 = localScale * 1.4;
        n.setScale(s0, s0, 1);
        tween(n).to(0.2, { scale: new Vec3(s1, s1, 1) }, { easing: 'quadOut' }).start();
        tween(op).to(0.04, { opacity: 255 }).to(0.16, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (n.isValid) n.destroy(); }).start();
    }

    onDisable(): void {
        this._popTween?.stop();
        this._popTween = null;
        this._active = false; this._popOut = false;
        if (this._view?.isValid) this._view.destroy();
        this._view = null;
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }
}
