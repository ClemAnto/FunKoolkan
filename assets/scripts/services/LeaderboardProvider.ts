import { BACKEND, ENABLED } from '../config/LeaderboardConfig';
import { LEADERBOARD_ALLOWED } from '../config/PortalConfig';
import { LeaderboardService } from './LeaderboardService';
import { NullLeaderboard } from './NullLeaderboard';
import { MockLeaderboard } from './MockLeaderboard';
import { FirestoreLeaderboard } from './FirestoreLeaderboard';

/**
 * Single entry point for the rest of the game: `LeaderboardProvider.get()`.
 *
 * Picks the implementation from LeaderboardConfig (ENABLED + BACKEND) and caches
 * it as a singleton. Callers never reference a concrete backend, so disabling the
 * leaderboard for a portal build is a one-line config change with zero call-site edits.
 */
export class LeaderboardProvider {
    private static _instance: LeaderboardService | null = null;

    static get(): LeaderboardService {
        if (this._instance) return this._instance;
        this._instance = this._create();
        return this._instance;
    }

    /** Test/scene-reset hook: drop the cached singleton so the next get() rebuilds it. */
    static reset(): void {
        this._instance = null;
    }

    private static _create(): LeaderboardService {
        if (!ENABLED) return new NullLeaderboard();
        // GameDistribution §7: external data collection/storage (Firestore) is prohibited.
        // LEADERBOARD_ALLOWED is false on GD → force the no-op backend. CrazyGames / Poki /
        // standalone are untouched.
        if (!LEADERBOARD_ALLOWED) return new NullLeaderboard();
        switch (BACKEND) {
            case 'firestore': return new FirestoreLeaderboard();
            case 'mock':      return new MockLeaderboard();
            case 'null':      return new NullLeaderboard();
            default:          return new NullLeaderboard();
        }
    }
}
