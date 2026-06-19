/**
 * Leaderboard service — backend-agnostic contract.
 *
 * REUSABLE: this interface and the LeaderboardEntry type carry no project- nor
 * engine-specific dependency. Implementations live alongside (Null / Mock /
 * Firestore) and are selected by LeaderboardProvider based on LeaderboardConfig.
 *
 * All methods are async and MUST NOT throw: network/availability problems are
 * surfaced as a resolved result, never a rejected promise — so the UI never
 * needs a try/catch and a dead backend degrades gracefully.
 */

/** One row of the leaderboard. */
export interface LeaderboardEntry {
    /** Player name — exactly NAME_LEN uppercase letters (e.g. "ABC"). */
    name: string;
    /** Score, an integer in [0, SCORE_CAP]. */
    score: number;
    /** Highest round the player reached, an integer in [1, ROUND_CAP]. */
    round: number;
    /** App version that produced the entry (e.g. "0.8.54"), max VERSION_MAX_LEN chars. */
    version: string;
    /** Epoch milliseconds when the entry was created (server time when available). */
    createdAt: number;
}

/** Result of a submit attempt. */
export interface SubmitResult {
    ok: boolean;
    /** 1-based position in the board after insertion, or null if not placed / unknown. */
    rank: number | null;
    /** Present when ok is false — short reason, for logging (not user-facing). */
    error?: string;
}

export interface LeaderboardService {
    /** True if this backend can actually talk to a store (false for Null). */
    readonly isAvailable: boolean;

    /** Prepare the backend (SDK init, connection). Idempotent; resolves false on failure. */
    init(): Promise<boolean>;

    /** Top entries, already sorted desc by score. Resolves to [] on any failure. */
    getTop(limit: number): Promise<LeaderboardEntry[]>;

    /**
     * Would `score` make the board? Lets the UI decide whether to prompt for a name.
     * Resolves false on any failure (fail-closed: don't prompt if we can't confirm).
     */
    qualifies(score: number): Promise<boolean>;

    /** Submit an entry. Never throws; failures come back as { ok: false }. */
    submit(entry: LeaderboardEntry): Promise<SubmitResult>;
}
