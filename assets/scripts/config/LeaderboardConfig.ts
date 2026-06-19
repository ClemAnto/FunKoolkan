/**
 * Leaderboard — single point of configuration.
 *
 * REUSABLE ACROSS PROJECTS: to drop this leaderboard into another game you only
 * need to edit THIS file — backend choice, Firebase keys and the tuning constants.
 * Everything else (services/, the UI components) is project-agnostic.
 *
 * The leaderboard is OPT-OUT: set `BACKEND = 'null'` (or `ENABLED = false`) for
 * portal builds (Poki/CrazyGames) that ship their own native leaderboard.
 */

/** Which implementation the provider hands out. See LeaderboardProvider. */
export type LeaderboardBackend = 'firestore' | 'mock' | 'null';

/** Master switch. When false the provider always returns the Null service. */
export const ENABLED = true;

/**
 * Active backend:
 *  - 'firestore' → real online leaderboard (Firebase compat SDK via CDN)
 *  - 'mock'      → in-memory + localStorage, no network (local dev / tests)
 *  - 'null'      → no-op (portal builds)
 */
export const BACKEND: LeaderboardBackend = 'mock';

/** How many entries the board shows / stores as "top". */
export const TOP_N = 10;

/** Player name: exactly this many letters (arcade-style A–Z slots). */
export const NAME_LEN = 3;

/** Allowed characters for each name slot, in cycling order. */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Upper bound for a submittable score. Anti-cheat v1 (Firestore security rules)
 * rejects scores outside [0, SCORE_CAP]. Keep this in sync with the rules.
 */
export const SCORE_CAP = 1_000_000;

/**
 * Upper bound for a submittable round. Anti-cheat v1 (Firestore security rules)
 * rejects rounds outside [1, ROUND_CAP]. Keep this in sync with the rules.
 */
export const ROUND_CAP = 100_000;

/**
 * Max length of the stored app version string. Anti-cheat v1 (Firestore security
 * rules) rejects longer values. Keep this in sync with the rules.
 */
export const VERSION_MAX_LEN = 16;

/** Network timeout (ms) for any single leaderboard request. */
export const REQUEST_TIMEOUT_MS = 8000;

/**
 * Firebase Web App config. Only used by the Firestore backend.
 * Project: fanwarriors-2026.
 */
export const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDogsLTgRwjaQOhxXw9bVRI_Mu_LrjY7xY',
    authDomain: 'fanwarriors-2026.firebaseapp.com',
    projectId: 'fanwarriors-2026',
    storageBucket: 'fanwarriors-2026.firebasestorage.app',
    messagingSenderId: '777085700475',
    appId: '1:777085700475:web:501055bec580804e89d5de',
    measurementId: 'G-XCRKW0TZVL',
} as const;

/** Firestore collection that holds the leaderboard document. */
export const COLLECTION = 'leaderboard';

/**
 * Single document (inside COLLECTION) that holds the whole board as an `entries`
 * array. The board is one self-pruning doc: each submit rewrites the array sorted
 * desc and capped at TOP_N — so Firestore never accumulates excess entries.
 */
export const DOCUMENT_ID = 'top';
