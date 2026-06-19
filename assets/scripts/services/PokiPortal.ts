import { PortalSdk } from './PortalSdk';
import { POKI_SDK_URL, BREAK_TIMEOUT_MS } from '../config/PortalConfig';

/** Minimal surface of the Poki SDK v2 we use (window.PokiSDK). */
interface PokiSDKLike {
    init(): Promise<void>;
    gameLoadingFinished(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    commercialBreak(beforeAd?: () => void): Promise<void>;
}

/**
 * Poki SDK v2 adapter. The script is loaded lazily from the Poki CDN at init
 * (same pattern as FirestoreLeaderboard) so index.html stays untouched and the
 * standalone build never references it. Every method is no-throw; if the SDK
 * fails to load the adapter degrades to a no-op.
 *
 * Internal `_gameplayActive` dedupes start/stop (Poki wants balanced calls) and
 * commercialBreak() auto-stops gameplay first, as required by their guidelines.
 */
export class PokiPortal implements PortalSdk {
    private _initPromise: Promise<void> | null = null;
    private _sdk: PokiSDKLike | null = null;
    private _loadingFinishedSent = false;
    private _gameplayActive = false;

    init(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            try {
                await this._loadScript();
                const sdk = (window as unknown as { PokiSDK?: PokiSDKLike }).PokiSDK;
                if (!sdk) { console.warn('[Portal] PokiSDK missing after script load'); return; }
                await sdk.init();
                this._sdk = sdk;
                console.log('[Portal] PokiSDK initialized');
            } catch (e) {
                console.warn('[Portal] PokiSDK init failed (continuing without):', e);
            }
        })();
        return this._initPromise;
    }

    gameLoadingFinished(): void {
        if (this._loadingFinishedSent) return;
        this._loadingFinishedSent = true;
        try { this._sdk?.gameLoadingFinished(); } catch { /* ignore */ }
    }

    gameplayStart(): void {
        if (this._gameplayActive) return;
        this._gameplayActive = true;
        try { this._sdk?.gameplayStart(); } catch { /* ignore */ }
    }

    gameplayStop(): void {
        if (!this._gameplayActive) return;
        this._gameplayActive = false;
        try { this._sdk?.gameplayStop(); } catch { /* ignore */ }
    }

    commercialBreak(onAdStart?: () => void): Promise<void> {
        if (!this._sdk) return Promise.resolve();
        this.gameplayStop();  // Poki requires gameplay to be stopped during ads
        // Poki's beforeAd callback fires right as the ad is shown — mute there, not before.
        const breakP = (async () => {
            try { await this._sdk!.commercialBreak(() => { try { onAdStart?.(); } catch { /* ignore */ } }); }
            catch (e) { console.warn('[Portal] commercialBreak failed (ignored):', e); }
        })();
        // Never let a stuck ad block the game flow
        const timeout = new Promise<void>(res => setTimeout(res, BREAK_TIMEOUT_MS));
        return Promise.race([breakP, timeout]);
    }

    private _loadScript(): Promise<void> {
        if ((window as unknown as { PokiSDK?: unknown }).PokiSDK) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = POKI_SDK_URL;
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error('Poki SDK script failed to load'));
            document.head.appendChild(s);
        });
    }
}
