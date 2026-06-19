import { sys } from 'cc';
import { LeaderboardEntry, LeaderboardService, SubmitResult } from './LeaderboardService';
import { SCORE_CAP, TOP_N } from '../config/LeaderboardConfig';

const LS_KEY = 'fw_leaderboard_mock';

/**
 * Local, network-free leaderboard. Persists to localStorage so it survives reloads.
 * Use it to develop and test the full UI flow (qualify → name entry → submit →
 * board) before the real Firestore backend exists or while offline.
 *
 * Seeded with a few entries on first use so the board isn't empty.
 */
export class MockLeaderboard implements LeaderboardService {
    readonly isAvailable = true;

    private _entries: LeaderboardEntry[] = [];
    private _loaded = false;

    async init(): Promise<boolean> {
        this._load();
        return true;
    }

    async getTop(limit: number): Promise<LeaderboardEntry[]> {
        this._load();
        return this._sorted().slice(0, limit);
    }

    async qualifies(score: number): Promise<boolean> {
        if (!Number.isInteger(score) || score <= 0 || score > SCORE_CAP) return false;
        this._load();
        const top = this._sorted();
        if (top.length < TOP_N) return true;
        return score > top[TOP_N - 1].score;
    }

    async submit(entry: LeaderboardEntry): Promise<SubmitResult> {
        if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > SCORE_CAP) {
            return { ok: false, rank: null, error: 'score out of range' };
        }
        this._load();
        const stored: LeaderboardEntry = { ...entry };
        this._entries.push(stored);
        const sorted = this._sorted();
        this._entries = sorted;
        this._save();
        const idx = sorted.indexOf(stored);
        return { ok: true, rank: idx >= 0 ? idx + 1 : null };
    }

    private _sorted(): LeaderboardEntry[] {
        return [...this._entries].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
    }

    private _load(): void {
        if (this._loaded) return;
        this._loaded = true;
        try {
            const raw = sys.localStorage.getItem(LS_KEY);
            if (raw) {
                this._entries = JSON.parse(raw);
                return;
            }
        } catch { /* fall through to seed */ }
        this._entries = MockLeaderboard._seed();
        this._save();
    }

    private _save(): void {
        try {
            sys.localStorage.setItem(LS_KEY, JSON.stringify(this._sorted().slice(0, TOP_N)));
        } catch { /* ignore quota errors */ }
    }

    private static _seed(): LeaderboardEntry[] {
        const base = 1_700_000_000_000;
        const names = ['ACE', 'BOB', 'CAT', 'DOG', 'EVE', 'FOX', 'GUS', 'HAL', 'IVY', 'JET'];
        const scores = [9800, 8400, 7100, 6050, 5200, 4300, 3600, 2900, 1800, 900];
        const rounds = [12, 11, 9, 8, 7, 6, 5, 4, 3, 2];
        return names.map((name, i) => ({ name, score: scores[i], round: rounds[i], version: '0.0.0', createdAt: base + i * 86_400_000 }));
    }
}
