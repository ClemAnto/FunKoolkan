import { Color } from 'cc';

/** One rune/gem type: a stable id (the gem index used everywhere), a name, and its signature colour. */
export interface RuneType {
    readonly id: number;
    readonly name: string;
    readonly color: Color;
}

/**
 * The 6 rune types — the single SOURCE OF TRUTH for identifying a rune/stone in gameplay.
 *
 * `id` is the gem type used throughout (Rune.setType, the launch queue, scoring…).
 * `color` is the gem's signature colour (e.g. the launch-trajectory dots read it from here). The
 * `gem_*` nodes in the Rune prefab must be authored in THIS SAME ORDER (gems[id]).
 *
 * Only the first `numGemTypes` (ArenaManager) are in play at a time; the rest are reserved for the
 * difficulty ramp (GDD §13 — number of colours per round).
 */
export const RUNES: readonly RuneType[] = [
    { id: 0, name: 'green',     color: new Color(90, 210, 90) },
    { id: 1, name: 'yellow',    color: new Color(245, 210, 70) },
    { id: 2, name: 'red',       color: new Color(235, 80, 80) },
    { id: 3, name: 'turquoise', color: new Color(60, 205, 220) },
    { id: 4, name: 'purple',    color: new Color(180, 110, 235) },
    { id: 5, name: 'amber',     color: new Color(245, 150, 55) },
];

/** Total number of rune types defined. */
export const RUNE_COUNT = RUNES.length;
