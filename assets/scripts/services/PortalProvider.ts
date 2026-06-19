import { PortalSdk } from './PortalSdk';
import { NullPortal } from './NullPortal';
import { PokiPortal } from './PokiPortal';
import { CrazyGamesPortal } from './CrazyGamesPortal';
import { GameDistributionPortal } from './GameDistributionPortal';
import { PORTAL } from '../config/PortalConfig';

/** Singleton factory — picks the portal implementation from the PORTAL flag. */
export class PortalProvider {
    private static _instance: PortalSdk | null = null;

    static get(): PortalSdk {
        if (!PortalProvider._instance) {
            switch (PORTAL) {
                case 'poki':             PortalProvider._instance = new PokiPortal();             break;
                case 'crazygames':       PortalProvider._instance = new CrazyGamesPortal();       break;
                case 'gamedistribution': PortalProvider._instance = new GameDistributionPortal(); break;
                default:                 PortalProvider._instance = new NullPortal();              break;
            }
        }
        return PortalProvider._instance;
    }
}
