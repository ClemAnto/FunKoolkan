import { Color } from 'cc';

/** One rune/gem type: a stable id (the gem index used everywhere), a name, and its signature colour. */
export interface RuneType {
    readonly id: number;
    readonly name: string;
    readonly color: Color;
}

/**
 * Named view of the rune type ids — used for the EDITOR dropdown (Rune.gemType) and for readable code.
 * Each entry's value IS the gem id. MUST stay aligned with RUNES below (RuneKind.X === RUNES[X].id) and
 * with the `gem_*` node order in the Rune prefab (gems[id]).
 */
export enum RuneKind {
    Green = 0,
    Yellow = 1,
    Red = 2,
    Blue = 3,
    Purple = 4,
    Cyan = 5,
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
    { id: 0, name: 'green',  color: new Color(90, 210, 90) },
    { id: 1, name: 'yellow', color: new Color(245, 210, 70) },
    { id: 2, name: 'red',    color: new Color(235, 80, 80) },
    { id: 3, name: 'blue',   color: new Color(70, 130, 240) },
    { id: 4, name: 'purple', color: new Color(180, 110, 235) },
    { id: 5, name: 'cyan',   color: new Color(70, 215, 230) },
];

/** Total number of rune types defined. */
export const RUNE_COUNT = RUNES.length;
