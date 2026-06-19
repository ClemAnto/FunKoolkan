import { sys } from 'cc';

/**
 * localStorage wrapper that never throws — in private/incognito browsing or with
 * a full quota, getItem/setItem can raise; portals (Poki/CrazyGames) make this a
 * real scenario. Reads fall back, writes are silently dropped.
 */
export class SafeStorage {
    static get(key: string, fallback: string | null = null): string | null {
        try { return sys.localStorage.getItem(key) ?? fallback; }
        catch { return fallback; }
    }

    static set(key: string, value: string): void {
        try { sys.localStorage.setItem(key, value); }
        catch { /* storage unavailable — ignore */ }
    }

    static remove(key: string): void {
        try { sys.localStorage.removeItem(key); }
        catch { /* storage unavailable — ignore */ }
    }
}
