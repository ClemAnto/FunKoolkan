import { SafeStorage } from '../utils/SafeStorage';

const KEY = 'fk.debugDraw';

let _enabled = SafeStorage.get(KEY) === '1';

/**
 * Global DEBUG-DRAW switch. Every debug overlay in the game — pole circles (Pole), glue bonds (Glue),
 * stone discs (Stone), the HOUSE/TEE zones (House), the arena rim (ArenaBounds) and the launcher body
 * (StoneLauncher) — reads `DebugDraw.enabled` and shows/hides itself accordingly, so a single flag turns
 * ALL of them on/off at once. Flipped by the HUD DEBUG button (DebugToggle) and persisted in localStorage,
 * so the choice survives a reload.
 *
 * A component may still force its own overlay in isolation via its per-instance `showDebug*` flag — those
 * are OR-ed with this global switch.
 */
export const DebugDraw = {
    /** True when the global debug overlays are on. */
    get enabled(): boolean { return _enabled; },
    /** Set + persist the global debug-draw state. */
    set(on: boolean): void { _enabled = on; SafeStorage.set(KEY, on ? '1' : '0'); },
    /** Flip the state, persist it, and return the new value. */
    toggle(): boolean { this.set(!_enabled); return _enabled; },
};
