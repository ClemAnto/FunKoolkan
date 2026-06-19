import { PortalSdk } from './PortalSdk';
import { CRAZYGAMES_SDK_URL, BREAK_TIMEOUT_MS } from '../config/PortalConfig';

/** Minimal surface of the CrazyGames SDK v3 we use (window.CrazyGames.SDK). */
interface CrazyAdCallbacks {
    adStarted?: () => void;
    adFinished?: () => void;
    adError?: (error: unknown) => void;
}
interface CrazyGamesSDKLike {
    init(): Promise<void>;
    game: {
        sdkGameLoadingStart(): void;
        sdkGameLoadingStop(): void;
        gameplayStart(): void;
        gameplayStop(): void;
    };
    ad: {
        requestAd(type: 'midgame' | 'rewarded', callbacks: CrazyAdCallbacks): void;
    };
}

/**
 * CrazyGames SDK v3 adapter — mirrors PokiPortal. The script is loaded lazily
 * from the CrazyGames CDN at init (same pattern as PokiPortal/FirestoreLeaderboard)
 * so index.html stays untouched and the standalone build never references it.
 * Every method is no-throw; if the SDK fails to load the adapter degrades to a no-op.
 *
 * Mapping of the PortalSdk lifecycle onto CrazyGames:
 *  - init()                → SDK.init() + game.sdkGameLoadingStart()
 *  - gameLoadingFinished() → game.sdkGameLoadingStop()
 *  - gameplayStart/Stop()  → game.gameplayStart/Stop() (deduped, same as Poki)
 *  - commercialBreak(cb)   → game.gameplayStop() then ad.requestAd('midgame'),
 *    wrapped in a promise that resolves on adFinished/adError or the safety timeout.
 *    `onAdStart` is invoked from the SDK's adStarted callback ONLY — CrazyGames
 *    requires muting audio when the ad actually plays, never on the mere request.
 */
export class CrazyGamesPortal implements PortalSdk {
    private _initPromise: Promise<void> | null = null;
    private _sdk: CrazyGamesSDKLike | null = null;
    private _loadingFinishedSent = false;
    private _gameplayActive = false;

    init(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            try {
                await this._loadScript();
                const sdk = (window as unknown as { CrazyGames?: { SDK?: CrazyGamesSDKLike } }).CrazyGames?.SDK;
                if (!sdk) { console.warn('[Portal] CrazyGames SDK missing after script load'); return; }
                await sdk.init();
                this._sdk = sdk;
                try { sdk.game.sdkGameLoadingStart(); } catch { /* ignore */ }
                console.log('[Portal] CrazyGames SDK initialized');
            } catch (e) {
                console.warn('[Portal] CrazyGames SDK init failed (continuing without):', e);
            }
        })();
        return this._initPromise;
    }

    gameLoadingFinished(): void {
        if (this._loadingFinishedSent) return;
        this._loadingFinishedSent = true;
        try { this._sdk?.game.sdkGameLoadingStop(); } catch { /* ignore */ }
    }

    gameplayStart(): void {
        if (this._gameplayActive) return;
        this._gameplayActive = true;
        try { this._sdk?.game.gameplayStart(); } catch { /* ignore */ }
    }

    gameplayStop(): void {
        if (!this._gameplayActive) return;
        this._gameplayActive = false;
        try { this._sdk?.game.gameplayStop(); } catch { /* ignore */ }
    }

    commercialBreak(onAdStart?: () => void): Promise<void> {
        if (!this._sdk) return Promise.resolve();
        this.gameplayStop();  // gameplay must be stopped during ads
        let done = false;
        const breakP = new Promise<void>(resolve => {
            const finish = () => { if (!done) { done = true; resolve(); } };
            try {
                this._sdk!.ad.requestAd('midgame', {
                    // Mute ONLY here: if no ad is available adStarted never fires, so no flicker.
                    adStarted: () => { try { onAdStart?.(); } catch { /* ignore */ } },
                    adFinished: finish,
                    adError: (e) => { console.warn('[Portal] CrazyGames ad error (ignored):', e); finish(); },
                });
            } catch (e) {
                console.warn('[Portal] requestAd threw (ignored):', e);
                finish();
            }
        });
        // Never let a stuck ad block the game flow
        const timeout = new Promise<void>(res => setTimeout(() => { done = true; res(); }, BREAK_TIMEOUT_MS));
        return Promise.race([breakP, timeout]);
    }

    private _loadScript(): Promise<void> {
        if ((window as unknown as { CrazyGames?: unknown }).CrazyGames) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = CRAZYGAMES_SDK_URL;
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error('CrazyGames SDK script failed to load'));
            document.head.appendChild(s);
        });
    }
}
