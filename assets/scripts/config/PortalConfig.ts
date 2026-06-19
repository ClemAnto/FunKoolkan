/**
 * Portal SDK configuration — the only file to edit per distribution target.
 *
 * PORTAL:
 *   'none'             → NullPortal (GitHub Pages / standalone builds — no SDK, zero overhead)
 *   'poki'             → PokiPortal (Poki submission build: SDK loaded at runtime from their CDN)
 *   'crazygames'       → CrazyGamesPortal (CrazyGames build: SDK v3 loaded at runtime from their CDN)
 *   'gamedistribution' → GameDistributionPortal (GD submission build: SDK loaded at runtime from their CDN)
 */
export type PortalKind = 'none' | 'poki' | 'crazygames' | 'gamedistribution';

export const PORTAL: PortalKind = 'none';

/**
 * Whether an external online leaderboard may run on this build. GameDistribution §7
 * prohibits collecting/storing data on third-party services (e.g. Firestore), so the
 * online leaderboard — including its UI (Ranking scene, MainMenu button, end-game routing) —
 * is OFF on GD. Consumers combine this with LeaderboardConfig.ENABLED. Keeping the GD-specific
 * rule here leaves LeaderboardConfig project-agnostic/reusable.
 */
export const LEADERBOARD_ALLOWED: boolean = PORTAL !== 'gamedistribution';

/** Poki SDK v2 script — loaded lazily at runtime when PORTAL = 'poki'. */
export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/** CrazyGames SDK v3 script — loaded lazily at runtime when PORTAL = 'crazygames'. */
export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/** GameDistribution HTML5 SDK script — loaded lazily at runtime when PORTAL = 'gamedistribution'. */
export const GAMEDISTRIBUTION_SDK_URL = 'https://html5.api.gamedistribution.com/main.min.js';

/**
 * GameDistribution game id (UUID assigned in the GD developer panel on submission).
 * Required by GD_OPTIONS before the SDK script loads. Placeholder until the game is
 * registered — ads degrade to no-op while it's the placeholder.
 */
export const GAMEDISTRIBUTION_GAME_ID = 'GD_GAME_ID_PLACEHOLDER';

/** Safety cap for commercialBreak: never block the flow longer than this (ms). */
export const BREAK_TIMEOUT_MS = 35000;
