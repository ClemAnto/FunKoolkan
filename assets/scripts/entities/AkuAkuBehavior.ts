import { _decorator, Component, Node, CCInteger, CCFloat, Color } from 'cc';
import { EDITOR } from 'cc/env';
import { AkuAku } from './AkuAku';
import { Stone } from './Stone';
import { physicsWidth, physicsDepth } from '../config/Perspective';

const { ccclass, property, disallowMultiple, requireComponent, menu } = _decorator;

const WANDER_INSET = 120;   // ground px kept from the edges when choosing a free zone (> the edge-kill band)
const HIT_COOLDOWN = 0.5;   // s of immunity after a hit so one bump = one hit (not a burst of contacts)
const ORANGE = new Color(255, 170, 60, 255);

/** AI state. The visual phase (idle/pray/move/hit) lives in AkuAku; this is the higher-level intent. */
enum Ai { Off, ToZone, Settling, Praying }

/**
 * The Aku-aku "brain": drives the AkuAku entity (which owns the look + physics) through its behaviour loop.
 * Attach it alongside AkuAku on the prefab; the spawner calls spawn() to bring one to life.
 *
 *   1) pick a FREE zone of the arena (clear of the other Aku-aku + stones),
 *   2) hop there (~`moveHops` hops, facing the travel direction),
 *   3) after `danceDelay` s, start the wake ritual (prayer: purple inner glow + rising bubbles),
 *   4) a moving rune hits it → −1 HP + small hop + orange flash → back to step 1,
 *   5) shoved onto/over the arena edge → eliminated (kicked out of the stadium),
 *   6) HP reaches 0 → same elimination as step 5.
 */
@ccclass('AkuAkuBehavior')
@disallowMultiple
@requireComponent(AkuAku)
@menu('Enemies/AkuAkuBehavior')
export class AkuAkuBehavior extends Component {
    @property({ type: CCFloat, tooltip: 'Seconds resting on a free zone before the wake ritual (prayer) starts.' })
    danceDelay = 2;
    @property({ type: CCInteger, formerlySerializedAs: 'maxHits', tooltip: 'Hit points: each rune hit removes 1; at 0 the Aku-aku is eliminated (kicked out of the stadium).' })
    hp = 1;
    @property({ type: CCInteger, tooltip: 'Roughly how many hops it takes to reach a chosen free zone.' })
    moveHops = 3;

    /** Called once it's gone off the cliff (set by the spawner → recycle into the pool). */
    onGone: (() => void) | null = null;

    private static readonly _all: AkuAkuBehavior[] = [];

    private _aku: AkuAku | null = null;
    private _state = Ai.Off;
    private _timer = 0;
    private _hp = 0;            // current hit points (set to `hp` on spawn; −1 per hit; ≤0 → eliminated)
    private _cooldown = 0;
    private _impact = false;
    private _impactDirX = 0;    // horizontal travel sign of the last rune that hit (drives the eliminate direction)

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
        this._hp = Math.max(1, Math.floor(this.hp)); this._cooldown = 0; this._impact = false; this._state = Ai.Off;
        aku.reset();
        aku.onImpact = (_other, dirX) => { this._impact = true; this._impactDirX = dirX; };
        aku.onGone = () => this.onGone?.();                  // any death (cliff dive or star-zap) → free the slot + pool
        aku.configure(arena, gx, gy);
        aku.attachPhysics();
        aku.emerge(() => this._beginWander());
    }

    update(dt: number): void {
        if (EDITOR) return;
        const aku = this._aku;
        if (!aku || this._state === Ai.Off) return;
        if (!aku.alive) { this._state = Ai.Off; return; }
        if (this._cooldown > 0) this._cooldown -= dt;
        // pushed onto / past the arena edge while parked → off the cliff (step 5). Only when settled/dancing,
        // so it never self-eliminates while hopping out of the hole or travelling to a zone.
        if ((this._state === Ai.Settling || this._state === Ai.Praying) && aku.nearEdge()) { this._eliminate(aku.groundX >= 0 ? 1 : -1); return; }   // fly off toward the edge it was shoved to
        if (this._impact) { this._impact = false; this._onHit(); return; }
        if (this._state === Ai.Settling) {
            this._timer -= dt;
            if (this._timer <= 0) { aku.pray(); this._state = Ai.Praying; }   // step 3: the wake ritual (purple glow + bubbles)
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

    /** A hit: −1 HP. Still alive → orange hop + re-wander. HP hits 0 → eliminated (kicked out of the stadium). */
    private _onHit(): void {
        if (this._cooldown > 0) return;
        const aku = this._aku;
        if (!aku) return;
        this._cooldown = HIT_COOLDOWN;
        this._hp--;
        if (this._hp <= 0) { this._eliminate(this._impactDirX); return; }   // fly off the way the rune was going
        this._state = Ai.Off;                                   // suspend the AI during the recoil...
        aku.hit(ORANGE, () => this._beginWander());             // ...then back to step 1
    }

    private _eliminate(dirX = 0): void {
        const aku = this._aku;
        if (!aku) return;
        this._state = Ai.Off;
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
