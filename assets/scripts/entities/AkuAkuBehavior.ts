import { _decorator, Component, Node, CCInteger, CCFloat, Color, Vec3, UITransform } from 'cc';
import { EDITOR } from 'cc/env';
import { AkuAku } from './AkuAku';
import { Stone } from './Stone';
import { Column } from './Column';
import { PrayerSpirit } from './PrayerSpirit';
import { physicsWidth, physicsDepth, unprojectX, unprojectY } from '../config/Perspective';

const { ccclass, property, disallowMultiple, requireComponent, menu } = _decorator;

const WANDER_INSET = 120;   // ground px kept from the edges when choosing a free zone (> the edge-kill band)
const EDGE_HOPS = 3;        // little hops from the hole to the arena border on entry
const EDGE_INSET = 16;      // ground px the border entry point sits inside the arena edge (so it stays on-screen)
const HIT_COOLDOWN = 0.5;   // s of immunity after a hit so one bump = one hit (not a burst of contacts)
const ORANGE = new Color(255, 170, 60, 255);

// "Climb a column and pray" spawn mode (GDD v0.4):
const COLUMN_EMERGE_STILL = 0.5;   // s held still after popping out of the hole, before hopping to the column
const COLUMN_HOPS = 5;             // "tanti balzetti" — little hops to approach the column base
const COLUMN_PRAY_DELAY = 2;       // s perched on the column top before the prayer starts
const PRAYER_SPIRIT_INTERVAL = 5;  // s of UNINTERRUPTED prayer per emitted spirit (→ energy to Koolkan); tunable

const _wv = new Vec3();

/** AI state. The visual phase (idle/pray/move/hit) lives in AkuAku; this is the higher-level intent. */
enum Ai { Off, ToZone, Settling, Praying }

/**
 * The Aku-aku "brain": drives the AkuAku entity (which owns the look + physics) through its behaviour loop.
 * Attach it alongside AkuAku on the prefab; the spawner calls spawn() to bring one to life.
 *
 *   1) pick a FREE zone of the arena (clear of the other Aku-aku + stones),
 *   2) hop there (~`moveHops` hops, facing the travel direction),
 *   3) after `danceDelay` s, start the wake ritual (prayer: purple inner glow + rising bubbles),
 *   4) a rune hits it — a STRONG hit (≥ strongHitSpeed) → eliminated (kicked off the cliff); a WEAK hit → small
 *      hop + orange flash, then it goes to find a new spot (back to step 1),
 *   5) shoved onto/over the arena edge → eliminated (kicked out of the stadium).
 */
@ccclass('AkuAkuBehavior')
@disallowMultiple
@requireComponent(AkuAku)
@menu('Enemies/AkuAkuBehavior')
export class AkuAkuBehavior extends Component {
    @property({ type: CCFloat, tooltip: 'Seconds resting on a free zone before the wake ritual (prayer) starts.' })
    danceDelay = 2;
    @property({ type: CCFloat, tooltip: 'A rune impact at or above this speed (physics u/s) ELIMINATES the Aku-aku (kicked off the cliff). A slower (weak) hit just makes it hop and move to a new spot. Full-power launch ≈ 150, but the rune slows a lot before the far end (linearDamping 0.5), so keep this low; a hit below 35 does nothing.' })
    strongHitSpeed = 50;
    @property({ type: CCInteger, tooltip: 'Roughly how many hops it takes to reach a chosen free zone.' })
    moveHops = 3;

    /** Called once it's gone off the cliff (set by the spawner → recycle into the pool). */
    onGone: (() => void) | null = null;

    private static readonly _all: AkuAkuBehavior[] = [];

    private _aku: AkuAku | null = null;
    private _state = Ai.Off;
    private _timer = 0;
    private _impactSpeed = 0;   // speed (physics u/s) of the rune that last hit — strong vs weak classification
    private _cooldown = 0;
    private _impact = false;
    private _impactDirX = 0;    // horizontal travel sign of the last rune that hit (drives the eliminate direction)

    // "Climb a column and pray" mode: driven by chained callbacks (emerge → still → hop → leap → perch → pray),
    // not the wander update loop. When true, update() skips the free-wander / edge-kill / hit logic entirely.
    private _columnMode = false;
    private _column: Column | null = null;
    private _arena: Node | null = null;
    private _perchTop: Node | null = null;   // the column-top cube node the Aku perches on
    private _perchOffsetY = 0;               // world-px above the top cube centre so the feet sit on it
    private _perchedActive = false;          // true once perched → watch for the top cube changing (cube destroyed)
    private _prayClock = 0;                  // s of uninterrupted prayer accumulated toward the next spirit
    /** Emitter for the prayer spirit (set by the spawner). Null → no spirits emitted. */
    prayerSpirit: PrayerSpirit | null = null;

    onLoad(): void { this._aku = this.getComponent(AkuAku); }
    onEnable(): void { AkuAkuBehavior._all.push(this); }
    onDisable(): void {
        const i = AkuAkuBehavior._all.indexOf(this);
        if (i >= 0) AkuAkuBehavior._all.splice(i, 1);
        this._state = Ai.Off;
    }

    /** Spawn entry (called by the spawner): place + body + pop out of the hole, then run the loop. */
    spawn(arena: Node, gx: number, gy: number): void {
        if (!this._aku) this._aku = this.getComponent(AkuAku);
        const aku = this._aku;
        if (!aku) return;
        this._columnMode = false; this._perchedActive = false;
        this._cooldown = 0; this._impact = false; this._state = Ai.Off;
        aku.reset();
        aku.onImpact = (_other, dirX, speed) => { this._impact = true; this._impactDirX = dirX; this._impactSpeed = speed; };
        aku.onGone = () => this.onGone?.();                  // any death (cliff dive or star-zap) → free the slot + pool
        aku.configure(arena, gx, gy);
        // Entrance: emerge at the hole (NO body yet) → hop to the arena border → one hop INTO the arena, where the
        // physics body is created (it becomes hittable as it lands in play) → then the usual free-zone wander.
        aku.emerge(() => this._enterFromHole());
    }

    /** Column spawn entry (called by the spawner via RoundManager): pop out of the hole, hold 0.5s, hop over to
     *  `column`, leap onto its top, then after 2s start praying. No free-wander / edge-kill — see _columnMode. */
    spawnOnColumn(arena: Node, gx: number, gy: number, column: Column): void {
        if (!this._aku) this._aku = this.getComponent(AkuAku);
        const aku = this._aku;
        if (!aku) return;
        this._columnMode = true; this._column = column; this._arena = arena; this._perchedActive = false; this._prayClock = 0;
        this._cooldown = 0; this._impact = false; this._state = Ai.Off;
        aku.reset();
        aku.onGone = () => this.onGone?.();
        aku.configure(arena, gx, gy);
        aku.emerge(() => {                                   // emerge hop (lands lower) → attach body → hold 0.5s
            aku.attachPhysics();                             // body for the ground hops (removed on the leap)
            this.scheduleOnce(() => this._hopToColumn(), COLUMN_EMERGE_STILL);
        });
    }

    update(dt: number): void {
        if (EDITOR) return;
        const aku = this._aku;
        if (this._columnMode) { this._tickColumnPerch(dt); return; }   // column flow is callback-driven; just watch the perch
        if (!aku || this._state === Ai.Off) return;
        if (!aku.alive) { this._state = Ai.Off; return; }
        if (this._cooldown > 0) this._cooldown -= dt;
        // pushed onto / past the arena edge while parked → off the cliff (step 5). Only when settled/dancing,
        // so it never self-eliminates while hopping out of the hole or travelling to a zone.
        if ((this._state === Ai.Settling || this._state === Ai.Praying) && aku.nearEdge()) { this._eliminate(aku.groundX >= 0 ? 1 : -1); return; }   // fly off toward the edge it was shoved to
        if (this._impact) { this._impact = false; this._onHit(); return; }
        if (this._state === Ai.Settling) {
            this._timer -= dt;
            if (this._timer <= 0) { aku.pray(); this._state = Ai.Praying; this._prayClock = 0; }   // step 3: the wake ritual (purple glow + bubbles)
        } else if (this._state === Ai.Praying) {
            this._tickPrayerSpirit(dt);   // feed Koolkan's wake-gauge while it prays in the arena
        }
    }

    /** Steps 1–2: find a free zone and hop there; on arrival → settle (step 3 waits in update). */
    private _beginWander(): void {
        const aku = this._aku;
        if (!aku) return;
        this._impact = false;
        const z = this._findFreeZone();
        this._state = Ai.ToZone;
        aku.moveTo(z.x, z.y, () => { this._state = Ai.Settling; this._timer = this.danceDelay; }, this.moveHops);
    }

    /** Entrance step 1: from the hole, hop (a few little jumps) to the nearest arena BORDER on the hole's side. */
    private _enterFromHole(): void {
        const aku = this._aku;
        if (!aku) return;
        this._impact = false;
        this._state = Ai.ToZone;                       // travelling — update runs, but edge-kill is gated to Settling/Praying
        const e = this._edgePoint();
        aku.moveTo(e.x, e.y, () => this._hopIntoArena(), EDGE_HOPS);
    }

    /** Entrance step 2: ONE hop inward into the playfield — and create the physics body NOW (it enters play here
     *  and becomes hittable). On landing, the normal free-zone wander takes over. */
    private _hopIntoArena(): void {
        const aku = this._aku;
        if (!aku) return;
        aku.attachPhysics();                           // body created as it leaps in → from now it collides / can be hit
        const inn = this._entryPoint();
        aku.moveTo(inn.x, inn.y, () => this._beginWander(), 1);
    }

    /** A point on the arena border on the hole's side, at the hole's depth (a hair inside, so it stays on-screen). */
    private _edgePoint(): { x: number; y: number } {
        const aku = this._aku!, W = physicsWidth(), D = physicsDepth();
        const side = aku.groundX >= 0 ? 1 : -1;
        return { x: side * Math.max(0, W / 2 - EDGE_INSET), y: Math.max(EDGE_INSET, Math.min(D - EDGE_INSET, aku.groundY)) };
    }

    /** A point just INSIDE the playfield (clear of the edge-kill band) on the hole's side — the landing of the
     *  inward hop, from which the free-zone wander begins. */
    private _entryPoint(): { x: number; y: number } {
        const aku = this._aku!, W = physicsWidth(), D = physicsDepth();
        const side = aku.groundX >= 0 ? 1 : -1;
        return { x: side * Math.max(0, W / 2 - WANDER_INSET), y: Math.max(WANDER_INSET, Math.min(D - WANDER_INSET, aku.groundY)) };
    }

    // ── Column climb-and-pray sequence (chained callbacks) ──────────────────────────────────────────────

    /** Step ③: hop over the ground to the foot of the column (~COLUMN_HOPS little jumps), then leap on top. */
    private _hopToColumn(): void {
        const aku = this._aku, col = this._column;
        if (!aku?.alive || !col?.node?.isValid) { this.onGone?.(); return; }
        const g = this._columnFootGround(col);
        aku.moveTo(g.x, g.y, () => this._leapOntoColumn(), COLUMN_HOPS);
    }

    /** Step ④: one big leap onto the TOP cube of the column (or the column node if it has no cubes). */
    private _leapOntoColumn(): void {
        const aku = this._aku, col = this._column;
        if (!aku?.alive || !col?.node?.isValid) { this.onGone?.(); return; }
        const cubes = col.cubeList();
        const top = cubes.length ? cubes[cubes.length - 1].node : col.node;
        top.getWorldPosition(_wv);
        const ut = top.getComponent(UITransform);
        this._perchOffsetY = ut ? ut.contentSize.height * Math.abs(top.worldScale.y) * 0.5 : 0;   // stand ON the top
        this._perchTop = top;
        aku.leapTo(new Vec3(_wv.x, _wv.y + this._perchOffsetY, _wv.z), () => this._perchAndPray());
    }

    /** Step ⑤: perch on the column top, then after COLUMN_PRAY_DELAY begin the prayer. */
    private _perchAndPray(): void {
        const aku = this._aku, top = this._perchTop;
        if (!aku?.alive || !top?.isValid) { this.onGone?.(); return; }
        aku.perchOn(top, this._perchOffsetY);
        this._perchedActive = true;                          // now watch for the top cube being destroyed (re-align)
        this.scheduleOnce(() => { if (aku.alive && aku.perched) aku.pray(); }, COLUMN_PRAY_DELAY);
    }

    /** While perched: if the column's top cube changed (the one under/at the Aku was destroyed), drop the Aku to
     *  the NEW top with a gummy bounce; if the column is fully cleared, the Aku has nowhere to stand → eliminated. */
    private _tickColumnPerch(dt: number): void {
        if (!this._perchedActive) return;
        const aku = this._aku, col = this._column;
        if (!aku?.alive || !col?.node?.isValid) return;

        this._tickPrayerSpirit(dt);   // feed Koolkan's wake-gauge while it prays on the column

        const top = col.topLiveCube();
        if (!top) { this._perchedActive = false; this._eliminate(0); return; }   // column cleared → falls
        if (top.node === this._perchTop) return;                                  // still on the same top
        this._perchTop = top.node;                                                // top changed → re-align down
        const ut = top.node.getComponent(UITransform);
        this._perchOffsetY = ut ? ut.contentSize.height * Math.abs(top.node.worldScale.y) * 0.5 : 0;
        aku.reperchTo(top.node, this._perchOffsetY);
    }

    /** The resolved prayer-spirit emitter: the one assigned by the spawner, or any scene PrayerSpirit wired to
     *  Koolkan (so the wake-gauge feeds even with no per-spawner wiring). */
    private _emitter(): PrayerSpirit | null { return this.prayerSpirit ?? PrayerSpirit.instance; }

    /** While the Aku is actually praying, accumulate uninterrupted-prayer time and emit one spirit toward Koolkan
     *  every PRAYER_SPIRIT_INTERVAL s (the wake-gauge feed). A hit / eliminate breaks the prayer → the clock
     *  resets. Shared by the free-wander loop and the column-perch loop. */
    private _tickPrayerSpirit(dt: number): void {
        const aku = this._aku;
        if (!aku?.praying) { this._prayClock = 0; return; }
        this._prayClock += dt;
        if (this._prayClock < PRAYER_SPIRIT_INTERVAL) return;
        this._prayClock = 0;
        const em = this._emitter();
        if (em) { console.log(`[AkuAkuBehavior] prayed ${PRAYER_SPIRIT_INTERVAL}s → emitting a spirit toward Koolkan`); em.launch(aku.headWorld(_wv)); }
        else console.warn('[AkuAkuBehavior] no PrayerSpirit emitter (assign one on the spawner or add a PrayerSpirit wired to Koolkan) — no spirit emitted');
    }

    /** Ground point at the foot of `column`: its world position de-projected into the arena's flat ground space. */
    private _columnFootGround(column: Column): { x: number; y: number } {
        const arena = this._arena;
        column.node.getWorldPosition(_wv);
        const ut = arena?.getComponent(UITransform);
        if (ut) ut.convertToNodeSpaceAR(_wv, _wv);   // world → arena-local (visual/projected)
        return { x: unprojectX(_wv.x, _wv.y), y: unprojectY(_wv.y) };
    }

    /** A rune hit, classified by impact speed: a STRONG hit (≥ strongHitSpeed) eliminates it (kicked off the
     *  cliff, flying the way the rune was going); a WEAK hit just makes it hop, then go find a new spot. */
    private _onHit(): void {
        if (this._cooldown > 0) return;
        const aku = this._aku;
        if (!aku) return;
        this._cooldown = HIT_COOLDOWN;
        if (this._impactSpeed >= this.strongHitSpeed) { this._eliminate(this._impactDirX); return; }   // strong → off the cliff
        this._state = Ai.Off;                                   // weak: suspend the AI during the recoil hop...
        aku.hit(ORANGE, () => this._beginWander());             // ...then re-wander to a new free zone
    }

    private _eliminate(dirX = 0): void {
        const aku = this._aku;
        if (!aku) return;
        this._state = Ai.Off;
        this._perchedActive = false;
        aku.eliminate(dirX);                                    // red flash + flung out of the stadium (gone → onGone → recycle)
    }

    /** A free spot on the ground: inside the arena (off the edges) and as clear as possible of the other
     *  Aku-aku and the stones. Picks the best of a handful of random candidates. */
    private _findFreeZone(): { x: number; y: number } {
        const W = physicsWidth(), D = physicsDepth();
        const halfW = Math.max(0, W / 2 - WANDER_INSET);
        const minY = Math.min(D, WANDER_INSET), maxY = Math.max(minY, D - WANDER_INSET);
        const r = this._aku?.physRadius ?? 24;
        let best = { x: 0, y: (minY + maxY) / 2 }, bestClear = -Infinity;
        for (let a = 0; a < 14; a++) {
            const x = (Math.random() * 2 - 1) * halfW;
            const y = minY + Math.random() * (maxY - minY);
            const clear = this._clearance(x, y, r);
            if (clear > bestClear) { bestClear = clear; best = { x, y }; }
            if (clear >= r * 3) break;   // comfortably free → good enough
        }
        return best;
    }

    /** Signed distance to the nearest other Aku-aku / stone edge (bigger = freer). */
    private _clearance(x: number, y: number, r: number): number {
        let min = Infinity;
        for (const b of AkuAkuBehavior._all) {
            if (b === this || !b._aku) continue;
            const d = Math.hypot(b._aku.groundX - x, b._aku.groundY - y) - r - b._aku.physRadius;
            if (d < min) min = d;
        }
        for (const s of Stone.all) {
            if (!s.node?.isValid) continue;
            const p = s.node.position;
            const d = Math.hypot(p.x - x, p.y - y) - r - s.radius;
            if (d < min) min = d;
        }
        return min === Infinity ? r * 3 : min;
    }

    onDestroy(): void {
        if (this._aku) this._aku.onImpact = null;
    }
}
