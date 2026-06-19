import { PortalSdk } from './PortalSdk';

/** No-op portal for standalone builds (GitHub Pages) — every call returns immediately. */
export class NullPortal implements PortalSdk {
    init(): Promise<void> { return Promise.resolve(); }
    gameLoadingFinished(): void { /* no-op */ }
    gameplayStart(): void { /* no-op */ }
    gameplayStop(): void { /* no-op */ }
    commercialBreak(_onAdStart?: () => void): Promise<void> { return Promise.resolve(); }
}
