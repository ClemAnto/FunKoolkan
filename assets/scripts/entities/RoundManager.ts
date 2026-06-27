import { _decorator, Component } from 'cc';
import { EDITOR } from 'cc/env';
import { Column } from './Column';
import { AkuAkuSpawner } from './AkuAkuSpawner';
import { ArenaManager } from '../managers/ArenaManager';
import { Koolkan } from './Koolkan';
import { PrayerSpirit } from './PrayerSpirit';
import { RuneKind } from '../config/RuneTypes';

const { ccclass, property } = _decorator;

// ── per-round configuration (internal; tuned here, not exposed in the editor) ──
// Which rune types are in play each round (cubes are drawn from this palette; also the set the rune spawner
// should pick from). Round 1 → yellow only; round 2 → +green; round 3 → +red. Beyond round 3 → the last set.
const ROUND_TYPES: RuneKind[][] = [
    [RuneKind.Yellow],                                   // round 1
    [RuneKind.Yellow, RuneKind.Green],                   // round 2
    [RuneKind.Yellow, RuneKind.Green, RuneKind.Red],     // round 3+
];
// Cubes per column, per round (parallel to ROUND_TYPES): round 1 → 1 cube, then taller. Beyond → the last entry.
const ROUND_CUBES = [1, 2, 3];
const MAX_ROUND = 2;           // round-up advances up to here, then stays (round 1 → 2, then 2 → 2 …)
const AUTO_START = true;       // reset + start round 1 automatically when the game begins
const COLUMN_FILL_DELAY = 0.5; // s after clearing the columns before refilling them (lets leftover cubes fully clear)
const COLUMN_STAGGER = 0.3;    // s between each column starting to build (they compose one after another)

// ── Aku-on-column cadence (placeholder pacing; the real trigger will be the wake-gauge / difficulty curve) ──
const AKU_AUTO = true;           // during a round, send Aku to climb the columns
const AKU_AFTER_COLUMNS = 0.5;   // s to wait AFTER the columns finish building before the first Aku pops out
const AKU_WAVE_STAGGER = 0.5;    // s between Aku in the initial wave (one pops out after another)
const AKU_SEND_INTERVAL = 4;     // s between subsequent sends (round-robin refill after the initial wave)

/**
 * Per-round director (GDD v0.4). Owns the variables that change round to round (round number, column
 * height, number of active rune colours) and resets the scene elements accordingly.
 *
 * Flow:
 *  - Game start → resetGame(): every column is wiped to EMPTY (no cubes).
 *  - startRound(): advances the round and grows each column, popping its cubes in with the bubble
 *    surface animation (round 1 → 1 cube per column, random type). Round-up rebuilds them taller.
 *
 * Columns are assigned in the editor (@property) — never resolved by name. Other per-round systems
 * (wake gauge, Koolkan sleep/wake, Aku spawner, Make-make bombs) hook into resetGame()/startRound()
 * here as they get wired.
 */
@ccclass('RoundManager')
export class RoundManager extends Component {
    @property({ type: [Column], tooltip: 'The columns this manager builds/resets each round.' })
    columns: Column[] = [];

    @property({ type: [AkuAkuSpawner], tooltip: 'Aku-aku spawners — each has its own associated column; the manager periodically tells one to send an Aku up to climb its column.' })
    akuSpawners: AkuAkuSpawner[] = [];

    @property({ type: ArenaManager, tooltip: 'The arena/launch coordinator — the manager pushes the round\'s allowed rune types here, so the launcher fires only this round\'s colours.' })
    arena: ArenaManager | null = null;

    @property({ type: Koolkan, tooltip: 'The boss — put back to Sleeping (energy reset) at the start of each round / on round-up.' })
    koolkan: Koolkan | null = null;

    private _round = 0;
    private _akuTimer = 0;     // countdown to the next Aku-on-column send (active only during a round)
    private _nextSpawner = 0;  // round-robin cursor over `akuSpawners`
    private _sawCubes = false;    // armed once this round's cubes have appeared → clearing them all triggers ROUND UP
    private _roundReady = false;  // false during the clear→fill window → the cleared-detector is OFF until cubes are in

    /** Current round (0 = pre-game / reset, 1 = first round). */
    get round(): number { return this._round; }

    /** Rune types in play this round — the palette for the columns AND the set the rune spawner (ArenaManager)
     *  may shoot. Never empty: before the first round it returns round 1's palette (so the first runes are right). */
    get allowedTypes(): RuneKind[] { return this._typesForRound(Math.max(1, this._round)); }

    /** The palette for a given round: round 1 → ROUND_TYPES[0], capped at the last entry for higher rounds. */
    private _typesForRound(round: number): RuneKind[] {
        return ROUND_TYPES[Math.min(Math.max(0, round - 1), ROUND_TYPES.length - 1)];
    }

    start(): void {
        this.resetGame();
        if (AUTO_START) this.startRound();
    }

    /** Full reset to pre-game state: empty every column (and any other per-round element). */
    resetGame(): void {
        this._round = 0;
        console.log(`[RoundManager] resetGame — clearing ${this.columns.length} column(s)`);
        for (const col of this.columns) if (col) col.clearCubes();
        // TODO when wired: reset wake gauge to 0, put Koolkan to sleep, clear Aku, reset bomb idol.
    }

    /** Advance to the next round and (re)build the columns, popping cubes in with animation. */
    startRound(): void {
        this._round++;
        this._buildRound();
    }

    /** (Re)build the columns + runes + Aku wave for the CURRENT round (no advance). Clears the columns NOW, then
     *  refills after COLUMN_FILL_DELAY so any leftover/authored cubes are fully gone before the fresh fill. */
    private _buildRound(): void {
        const height = this._cubesForRound(this._round);
        const palette = this.allowedTypes;   // SAME set the rune spawner shoots → columns & runes always match
        console.log(`[RoundManager] build round ${this._round} — filling ${this.columns.length} column(s) to ${height} cubes (types: ${palette.map(t => RuneKind[t]).join(', ')})`);
        if (this.koolkan) this.koolkan.sleep();   // round (re)start → Koolkan back to Sleeping, energy gauge reset
        else console.warn('[RoundManager] koolkan not assigned — it won\'t be put back to sleep on round build');
        this._cancelSpirits();                    // any prayer spirits in flight fade out (no energy after the reset)
        this.arena?.setAllowedTypes(palette);   // tell the launcher which colours to fire this round
        for (const col of this.columns) if (col) col.clearCubes();   // clear NOW (leftover/authored cubes go first)
        this._sawCubes = false;
        this._roundReady = false;                                    // detector OFF until the fresh cubes are actually in
        this._akuTimer = AKU_SEND_INTERVAL;
        this.scheduleOnce(() => this._fillColumns(height, palette), COLUMN_FILL_DELAY);
        // TODO when wired: apply this round's difficulty (rune spawn rate, gauge thresholds, Aku waves).
    }

    /** Fade out any prayer spirits in flight (round-up reset) — via the spawners' shared emitter(s), deduped. */
    private _cancelSpirits(): void {
        const seen = new Set<PrayerSpirit>();
        for (const sp of this.akuSpawners) {
            const ps = sp?.prayerSpirit;
            if (ps && !seen.has(ps)) { seen.add(ps); ps.cancelAll(); }
        }
    }

    /** Fill every column with the round's cubes and send out the initial Aku wave (called after the clear delay). */
    private _fillColumns(height: number, palette: RuneKind[]): void {
        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];
            if (col) this.scheduleOnce(() => col.fillCubes(height, palette), i * COLUMN_STAGGER);   // one column after another
        }
        if (AKU_AUTO) this._spawnInitialWave(height);  // send the round's Aku out after the (last) column is up
        this._sawCubes = false;                        // fresh round: cubes haven't been "seen" yet (they pop in next)
        this._roundReady = true;                       // arm the cleared-detector now that the fill is in progress
    }

    /** Send one Aku per spawner to climb, starting AKU_AFTER_COLUMNS s after the columns finish building, then
     *  one every AKU_WAVE_STAGGER s (they pop out one after another). The periodic refill (update) tops up after. */
    private _spawnInitialWave(height: number): void {
        // wait for the LAST column to finish (they start staggered) + a beat
        const base = Math.max(0, this.columns.length - 1) * COLUMN_STAGGER + Column.fillDuration(height) + AKU_AFTER_COLUMNS;
        for (let i = 0; i < this.akuSpawners.length; i++) {
            const sp = this.akuSpawners[i];
            if (!sp) continue;
            this.scheduleOnce(() => { if (sp.liveCount === 0) sp.spawnOnColumn(); }, base + i * AKU_WAVE_STAGGER);
        }
    }

    update(dt: number): void {
        if (EDITOR || this._round <= 0) return;
        if (this._roundReady) this._checkRoundCleared();   // all columns empty → level passed (off during clear→fill)
        // Aku-on-column refill
        if (!AKU_AUTO || this.akuSpawners.length === 0) return;
        this._akuTimer -= dt;
        if (this._akuTimer > 0) return;
        this._akuTimer = AKU_SEND_INTERVAL;
        this._sendOneAku();
    }

    /** ROUND UP: once this round's cubes have appeared and are ALL then cleared, the level is passed. (For now we
     *  just rebuild the SAME round — real progression comes later.) The _sawCubes arm avoids firing during the
     *  initial build, when the columns are momentarily empty. */
    private _checkRoundCleared(): void {
        if (this._totalCubes() > 0) { this._sawCubes = true; return; }
        if (!this._sawCubes) return;                 // not armed yet (still building) → ignore
        this._sawCubes = false;
        const next = Math.min(this._round + 1, MAX_ROUND);   // advance, capped (round 1 → 2, then stays at 2)
        console.log(`[RoundManager] all columns cleared — LEVEL PASSED → ROUND UP! (round ${this._round} → ${next})`);
        this._round = next;
        this._buildRound();
    }

    /** Total cubes still standing across all columns. */
    private _totalCubes(): number {
        let n = 0;
        for (const col of this.columns) if (col) n += col.cubeList().length;
        return n;
    }

    /** Tell the next spawner (round-robin) whose column still has cubes to send an Aku up its column. The
     *  spawner caps at maxCount and ignores when not ready, so we try the others until one accepts. */
    private _sendOneAku(): void {
        const n = this.akuSpawners.length;
        for (let k = 0; k < n; k++) {
            const idx = (this._nextSpawner + k) % n;
            const sp = this.akuSpawners[idx];
            // one Aku per column: only refill a spawner that has no live Aku (and whose column still has cubes)
            if (sp && sp.column && sp.liveCount === 0 && sp.column.cubeList().length > 0 && sp.spawnOnColumn()) {
                this._nextSpawner = (idx + 1) % n;
                return;
            }
        }
    }

    /** Advance to the NEXT round (taller columns, wider palette). Hook for the real progression — for now the
     *  clear-detector rebuilds the same round instead; switch _checkRoundCleared to call this when wiring it. */
    advanceRound(): void { this.startRound(); }

    /** Cubes per column for a given round (from ROUND_CUBES; capped at the last entry for higher rounds). */
    private _cubesForRound(round: number): number {
        return ROUND_CUBES[Math.min(Math.max(0, round - 1), ROUND_CUBES.length - 1)];
    }
}
