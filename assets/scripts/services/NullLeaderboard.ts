import { LeaderboardEntry, LeaderboardService, SubmitResult } from './LeaderboardService';

/**
 * No-op leaderboard. Used on portal builds (Poki/CrazyGames) where the platform
 * provides its own native leaderboard, or whenever the feature is disabled.
 *
 * Every query degrades to "nothing here": empty board, never qualifies, submit
 * silently succeeds-as-noop. Callers can treat it like any other backend.
 */
export class NullLeaderboard implements LeaderboardService {
    readonly isAvailable = false;

    async init(): Promise<boolean> {
        return false;
    }

    async getTop(_limit: number): Promise<LeaderboardEntry[]> {
        return [];
    }

    async qualifies(_score: number): Promise<boolean> {
        return false;
    }

    async submit(_entry: LeaderboardEntry): Promise<SubmitResult> {
        return { ok: false, rank: null, error: 'leaderboard disabled' };
    }
}
