import { PortalSdk } from './PortalSdk';
import { GAMEDISTRIBUTION_SDK_URL, GAMEDISTRIBUTION_GAME_ID, BREAK_TIMEOUT_MS } from '../config/PortalConfig';

/** Minimal surface of the GameDistribution HTML5 SDK we use (window.gdsdk). */
interface GdSdkLike {
    showAd(type?: unknown): Promise<unknown>;
}

/** Event payload shape passed to GD_OPTIONS.onEvent. */
interface GdEvent { name: string; }

/**
 * GameDistribution HTML5 SDK adapter — mirrors PokiPortal / CrazyGamesPortal, but
 * GD's model is event-driven via a global GD_OPTIONS.onEvent callback (it must be set
 * BEFORE the script loads), not per-request callbacks. The script is loaded lazily from
 * the GD CDN at init so index.html stays untouched and the standalone build never
 * references it. Every method is no-throw; if the SDK fails to load it degrades to a no-op.
 *
 * Mapping of the PortalSdk lifecycle onto GameDistribution:
 *  - init()                → set GD_OPTIONS (gameId + onEvent) then load the SDK; resolves
 *                            on SDK_READY (or a timeout, so boot is never blocked).
 *  - gameLoadingFinished() → no-op: GD has no loading-finished signal.
 *  - gameplayStart/Stop()  → no-op: GD has no gameplay start/stop API.
 *  - commercialBreak(cb)   → gdsdk.showAd() (interstitial), resolves when the promise
 *                            settles or the safety timeout fires. GD fires SDK_GAME_PAUSE
 *                            when the ad actually starts → that's where `onAdStart` (mute)
 *                            runs; the caller unmutes unconditionally once we resolve.
 *                            If no ad is available showAd rejects fast and PAUSE never
 *                            fires, so there's no audio flicker.
 */
export class GameDistributionPortal implements PortalSdk {
    private _initPromise: Promise<void> | null = null;
    private _sdk: GdSdkLike | null = null;
    private _ready = false;
    /** Set for the duration of a commercialBreak so SDK_GAME_PAUSE can mute audio. */
    private _onAdStart: (() => void) | null = null;

    init(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        this._initPromise = new Promise<void>(resolve => {
            let settled = false;
            const finish = () => { if (!settled) { settled = true; resolve(); } };
            try {
                (window as unknown as { GD_OPTIONS?: unknown }).GD_OPTIONS = {
                    gameId: GAMEDISTRIBUTION_GAME_ID,
                    onEvent: (event: GdEvent) => {
                        switch (event?.name) {
                            case 'SDK_READY':
                                this._sdk = (window as unknown as { gdsdk?: GdSdkLike }).gdsdk ?? null;
                                this._ready = !!this._sdk;
                                console.log('[Portal] GameDistribution SDK ready');
                                finish();
                                break;
                            case 'SDK_ERROR':
                                console.warn('[Portal] GameDistribution SDK error (continuing without)');
                                finish();
                                break;
                            case 'SDK_GAME_PAUSE':
                                // Ad actually started — mute now (no audio change before this).
                                try { this._onAdStart?.(); } catch { /* ignore */ }
                                break;
                            // SDK_GAME_START → ad done; caller unmutes on commercialBreak resolve.
                            default: break;
                        }
                    },
                };
                this._loadScript();
            } catch (e) {
                console.warn('[Portal] GameDistribution init failed (continuing without):', e);
                finish();
            }
            // Never let a missing/blocked SDK (AdBlock) stall boot.
            setTimeout(finish, BREAK_TIMEOUT_MS);
        });
        return this._initPromise;
    }

    gameLoadingFinished(): void { /* GD has no loading-finished signal */ }
    gameplayStart(): void { /* GD has no gameplay start API */ }
    gameplayStop(): void { /* GD has no gameplay stop API */ }

    commercialBreak(onAdStart?: () => void): Promise<void> {
        if (!this._ready || !this._sdk) return Promise.resolve();
        let done = false;
        this._onAdStart = onAdStart ?? null;
        const clear = () => { this._onAdStart = null; };
        const breakP = (async () => {
            try { await this._sdk!.showAd(); }
            catch (e) { console.warn('[Portal] GameDistribution showAd failed (ignored):', e); }
            finally { clear(); }
        })().then(() => { done = true; });
        // Never let a stuck ad block the game flow.
        const timeout = new Promise<void>(res => setTimeout(() => {
            if (!done) { done = true; clear(); }
            res();
        }, BREAK_TIMEOUT_MS));
        return Promise.race([breakP, timeout]);
    }

    private _loadScript(): void {
        if ((window as unknown as { gdsdk?: unknown }).gdsdk) return;
        if (document.getElementById('gamedistribution-jssdk')) return;
        const s = document.createElement('script');
        s.id = 'gamedistribution-jssdk';
        s.src = GAMEDISTRIBUTION_SDK_URL;
        s.onerror = () => console.warn('[Portal] GameDistribution SDK script failed to load');
        const first = document.getElementsByTagName('script')[0];
        first?.parentNode?.insertBefore(s, first) ?? document.head.appendChild(s);
    }
}
