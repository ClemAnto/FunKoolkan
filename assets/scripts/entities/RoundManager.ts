import { _decorator, Component } from 'cc';
import { Column } from './Column';
import { RuneKind } from '../config/RuneTypes';

const { ccclass, property } = _decorator;

// ── per-round configuration (internal; tuned here, not exposed in the editor) ──
// For now: round 1 → 1 cube per column, all Yellow. (Multi-colour / random comes later.)
const ROUND_COLOR = RuneKind.Yellow;   // single cube colour in play for now
const FIRST_ROUND_CUBES = 5;   // cubes per column in round 1
const CUBES_PER_ROUND = 1;     // extra cubes per column each subsequent round (columns rebuilt taller)
const AUTO_START = true;       // reset + start round 1 automatically when the game begins

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

    private _round = 0;

    /** Current round (0 = pre-game / reset, 1 = first round). */
    get round(): number { return this._round; }

    start(): void {
        this.resetGame();
        if (AUTO_START) this.startRound();
    }

    /** Full reset to pre-game state: empty every column (and any other per-round element). */
    resetGame(): void {
        this._round = 0;
        for (const col of this.columns) if (col) col.clearCubes();
        // TODO when wired: reset wake gauge to 0, put Koolkan to sleep, clear Aku, reset bomb idol.
    }

    /** Advance to the next round and (re)build the columns taller, popping cubes in with animation. */
    startRound(): void {
        this._round++;
        const height = this._cubesForRound(this._round);
        for (const col of this.columns) {
            if (col) col.fillCubes(height, ROUND_COLOR);   // the Column owns the pop sequence/animation
        }
        // TODO when wired: apply this round's difficulty (rune spawn rate, gauge thresholds, Aku waves).
    }

    /** Convenience for round-up after both columns are cleared — same as startRound(). */
    advanceRound(): void { this.startRound(); }

    /** Cubes per column for a given round: round 1 → FIRST_ROUND_CUBES, +CUBES_PER_ROUND each round after. */
    private _cubesForRound(round: number): number {
        return FIRST_ROUND_CUBES + Math.max(0, round - 1) * CUBES_PER_ROUND;
    }
}
