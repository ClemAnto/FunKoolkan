import { LeaderboardEntry, LeaderboardService, SubmitResult } from './LeaderboardService';
import { COLLECTION, DOCUMENT_ID, FIREBASE_CONFIG, REQUEST_TIMEOUT_MS, ROUND_CAP, SCORE_CAP, TOP_N, VERSION_MAX_LEN } from '../config/LeaderboardConfig';

/** Firebase compat SDK version — keep in sync with build-templates/web-mobile/index.html. */
const FIREBASE_SDK_VERSION = '10.12.2';
const FIREBASE_SDK_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

/**
 * Real online leaderboard backed by Firebase Firestore.
 *
 * SINGLE-DOCUMENT model: the whole board lives in one doc (COLLECTION/DOCUMENT_ID)
 * as an `entries` array. Each submit runs a transaction that reads the array, inserts
 * the new entry, sorts desc by score, caps at TOP_N and writes it back — so Firestore
 * is self-pruning (it never accumulates excess rows). getTop just reads that array.
 *
 * Uses the Firebase **compat** SDK loaded as a global via CDN (no npm bundling); we
 * touch only `window.firebase`, so the engine bundle stays free of Firebase.
 *
 * Anti-cheat note (v1): with an array doc the rules can only cap the array length
 * (Firestore rules can't iterate to validate each element nor enforce a server
 * timestamp), so per-entry shape and `createdAt` are client-trusted. Acceptable for
 * a casual portal game; App Check is the planned hardening step.
 *
 * No method throws: network/SDK problems resolve to empty/false/{ok:false}.
 */
export class FirestoreLeaderboard implements LeaderboardService {
    readonly isAvailable = true;

    private _db: any = null;
    private _initPromise: Promise<boolean> | null = null;

    async init(): Promise<boolean> {
        if (this._db) return true;
        // Coalesce concurrent init() calls into one.
        if (!this._initPromise) this._initPromise = this._doInit();
        return this._initPromise;
    }

    private async _doInit(): Promise<boolean> {
        try {
            let fb = (globalThis as any).firebase;
            // The CDN tags only exist in real builds (build-templates index.html), not in
            // the editor Preview. Load the SDK ourselves when it's missing so the
            // leaderboard works everywhere without depending on HTML injection.
            if (!fb || !fb.firestore) {
                fb = await this._loadSdk();
            }
            if (!fb || !fb.firestore) {
                console.warn('[Leaderboard] Firebase compat SDK unavailable (CDN missing and dynamic load failed).');
                return false;
            }
            if (!fb.apps || fb.apps.length === 0) {
                fb.initializeApp(FIREBASE_CONFIG);
            }
            this._db = fb.firestore();
            return true;
        } catch (e) {
            console.warn('[Leaderboard] Firestore init failed:', e);
            this._db = null;
            return false;
        }
    }

    /** Inject the Firebase compat SDK from the CDN at runtime. Resolves to window.firebase or null. */
    private async _loadSdk(): Promise<any> {
        const g = globalThis as any;
        if (g.firebase?.firestore) return g.firebase;
        const doc = g.document;
        if (!doc || !doc.head) return null; // non-browser (headless) — can't inject
        const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
            const existing = Array.from(doc.scripts || []).find((s: any) => s.src === src) as any;
            if (existing) {
                if (existing._loaded) { resolve(); return; }
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
                return;
            }
            const el = doc.createElement('script');
            el.src = src;
            el.async = false; // preserve order: app before firestore
            el.addEventListener('load', () => { el._loaded = true; resolve(); });
            el.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
            doc.head.appendChild(el);
        });
        console.log('[Leaderboard] Firebase SDK not present — loading from CDN at runtime...');
        await loadScript(`${FIREBASE_SDK_BASE}/firebase-app-compat.js`);
        await loadScript(`${FIREBASE_SDK_BASE}/firebase-firestore-compat.js`);
        return g.firebase ?? null;
    }

    /** The single board document reference. */
    private _docRef(): any {
        return this._db.collection(COLLECTION).doc(DOCUMENT_ID);
    }

    async getTop(limit: number): Promise<LeaderboardEntry[]> {
        if (!(await this.init())) return [];
        try {
            const snap: any = await this._withTimeout(this._docRef().get());
            return FirestoreLeaderboard._readEntries(snap).slice(0, limit);
        } catch (e) {
            console.warn('[Leaderboard] getTop failed:', e);
            return [];
        }
    }

    async qualifies(score: number): Promise<boolean> {
        if (!Number.isInteger(score) || score <= 0 || score > SCORE_CAP) return false;
        if (!(await this.init())) return false; // fail-closed: don't prompt if we can't confirm
        const top = await this.getTop(TOP_N);
        if (top.length < TOP_N) return true; // empty / not-full board → anyone qualifies
        return score > top[TOP_N - 1].score;
    }

    async submit(entry: LeaderboardEntry): Promise<SubmitResult> {
        if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > SCORE_CAP) {
            return { ok: false, rank: null, error: 'score out of range' };
        }
        if (!Number.isInteger(entry.round) || entry.round < 1 || entry.round > ROUND_CAP) {
            return { ok: false, rank: null, error: 'round out of range' };
        }
        if (typeof entry.version !== 'string' || entry.version.length === 0 || entry.version.length > VERSION_MAX_LEN) {
            return { ok: false, rank: null, error: 'version invalid' };
        }
        if (!(await this.init())) return { ok: false, rank: null, error: 'backend unavailable' };
        // Normalize the row we persist (no extra fields, plain values only).
        const row: LeaderboardEntry = {
            name: entry.name,
            score: entry.score,
            round: entry.round,
            version: entry.version,
            createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
        };
        try {
            const ref = this._docRef();
            let rank: number | null = null;
            await this._withTimeout(this._db.runTransaction(async (tx: any) => {
                const snap = await tx.get(ref);
                const entries = FirestoreLeaderboard._readEntries(snap);
                entries.push(row);
                entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
                const capped = entries.slice(0, TOP_N);
                tx.set(ref, { entries: capped });
                const idx = capped.indexOf(row);
                rank = idx >= 0 ? idx + 1 : null;
            }));
            return { ok: true, rank };
        } catch (e) {
            console.warn('[Leaderboard] submit failed:', e);
            return { ok: false, rank: null, error: String(e) };
        }
    }

    /** Reject after REQUEST_TIMEOUT_MS so a hung connection can't freeze the flow. */
    private _withTimeout<T>(p: Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS);
            p.then(
                v => { clearTimeout(t); resolve(v); },
                e => { clearTimeout(t); reject(e); },
            );
        });
    }

    /** Pull a sanitized, score-sorted entries array out of a board-document snapshot. */
    private static _readEntries(snap: any): LeaderboardEntry[] {
        const data = snap && snap.exists ? snap.data() : null;
        const raw = data && Array.isArray(data.entries) ? data.entries : [];
        return raw
            .map((d: any) => ({
                name: String(d?.name ?? '???'),
                score: Number(d?.score ?? 0),
                round: Number(d?.round ?? 1),
                version: String(d?.version ?? ''),
                createdAt: Number(d?.createdAt ?? 0),
            }))
            .sort((a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score || a.createdAt - b.createdAt);
    }
}
