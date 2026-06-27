/**
 * GameMode — a single switch between gameplay cores, so a prototype can be A/B'd without ripping out
 * the other systems. Mirrors the DebugDraw / EditState shared-flag pattern (no fragile @property wiring).
 *
 * `stickyPrototype` (2026-06-27): the "sticky blob + OVERPOWER" experiment — runes ALWAYS glue together
 * regardless of type (one soft mass); there is NO tee/house and NO petrification; an OVERPOWER shot (the
 * launcher's overcharge: pull past full power) detonates the contiguous same-colour cluster of the first
 * rune it touches (ManaLightning + shatter), producing no star. Flip to false to restore the curling /
 * columns / Aku core (CurlingScorer + Petrifier resume, gluing reverts to the parked pole-circuit).
 */
export const GameMode = {
    stickyPrototype: true,
};
