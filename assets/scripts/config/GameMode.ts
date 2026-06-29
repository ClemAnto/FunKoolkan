/**
 * GameMode — a single switch between gameplay cores, so a prototype can be A/B'd without ripping out the
 * other systems. Mirrors the DebugDraw / EditState shared-flag pattern (no fragile @property wiring).
 *
 * Change the ONE line `ACTIVE_CORE = …` to pick the active core. The boolean getters below derive from it,
 * so every existing `GameMode.stickyPrototype` check keeps working unchanged.
 *
 * Cores:
 *  • Sticky    (2026-06-27): runes ALWAYS glue into one soft blob (no type), no tee/house, no petrification;
 *               an OVERPOWER shot detonates the contiguous same-colour cluster (ManaLightning + shatter). The
 *               ManaFlame detonator (GameManager auto-installs it) is the ignition source.
 *  • Curling   (GDD v0.4, parked): curling HOUSE/TEE scoring → RaisingStar → colour-marked columns (with HP);
 *               Aku-aku climb the columns and pray; Petrifier + pole-circuit Glue + House/Tee beacons active.
 *  • AkuArena  (2026-06-30, ACTIVE): the stripped-down core — Aku-aku pop from the hole, wander to a free
 *               spot and PRAY, feeding Koolkan's wake-gauge (PrayerSpirit → addEnergy). The player launches
 *               runes to hit them directly: a rune PIERCES an Aku (kills it, carries on through others). Spent
 *               runes stay on the field as obstacles. Koolkan fully waking = GAME OVER. No flame, no electric
 *               chains, no sticky blob, no columns, no petrification (all gated off below).
 */
export enum Core {
    Sticky,
    Curling,
    AkuArena,
}

/** The active gameplay core — flip this one line to switch cores. */
export const ACTIVE_CORE: Core = Core.AkuArena;

export const GameMode = {
    /** Sticky-blob + ManaFlame/OVERPOWER prototype. */
    get stickyPrototype(): boolean { return ACTIVE_CORE === Core.Sticky; },
    /** Curling / columns / Aku-climb core (GDD v0.4). House/Tee/Petrifier/RaisingStar live ONLY here. */
    get curling(): boolean { return ACTIVE_CORE === Core.Curling; },
    /** Aku-arena core: wander + pray → wake-gauge; pierce-hit runes; runes accumulate as obstacles. */
    get akuArena(): boolean { return ACTIVE_CORE === Core.AkuArena; },
};
