/**
 * Portal SDK abstraction (Poki / CrazyGames / none) — same layering as the
 * leaderboard service: pure TS, no scene/engine UI dependency, every method
 * is no-throw so a missing/broken SDK degrades silently.
 *
 * Lifecycle contract (Poki guidelines):
 *  - init() once at boot (idempotent, coalesced), then gameLoadingFinished()
 *    when the game is ready to play.
 *  - gameplayStart() whenever active play (re)starts — new game, resume from pause.
 *  - gameplayStop() whenever active play halts — pause, game over, victory.
 *  - commercialBreak(onAdStart?) ONLY between sessions (never during gameplay,
 *    and NEVER before the first gameplay); resolves when the game may proceed.
 *    `onAdStart` fires ONLY when an ad actually starts playing — mute audio there,
 *    not before the request (per CrazyGames: no visual change = no mute). Callers
 *    unmute unconditionally once the promise resolves.
 *
 * Implementations may dedupe start/stop internally — call sites don't need to
 * track whether gameplay is already flagged active.
 */
export interface PortalSdk {
    init(): Promise<void>;
    gameLoadingFinished(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    commercialBreak(onAdStart?: () => void): Promise<void>;
}
