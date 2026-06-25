import { _decorator, Component, view, ResolutionPolicy } from 'cc';
import { StoneExplosion } from '../entities/StoneExplosion';

const { ccclass } = _decorator;

/** Game version — keep aligned with package.json (see CLAUDE.md §Versioning). */
export const VERSION = '0.2.6';

/**
 * FunKoolkan game manager — PLACEHOLDER (intentionally near-empty).
 *
 * The FunWarriors warrior/merge engine that used to live here (~3600 lines: merge, species, the four
 * powerups, warrior magnetism, score formula, round thresholds, resize re-pin, leaderboard flow,
 * end/pause panel wiring) has been REMOVED — none of it is FunKoolkan gameplay. The original
 * implementation lives in the git history (pre-cleanup commit) for reference.
 *
 * Architecture going forward: keep classes SPECIALIZED, not a monolith. The launch lives in
 * `StoneLauncher` + `ArenaManager` (launch queue); the poles in their own `Pole` component; the
 * mana-circuit logic will get its own dedicated class. When the FunKoolkan loop is designed
 * (scoring/rounds/HUD for the mana circuit — GDD §22, ROADMAP Fase 2-3), wire it from small
 * dedicated managers, NOT here.
 *
 * NOTE: the scene's GameManager component still carries the old serialized @property values (prefab/
 * node refs); Cocos ignores those that no longer exist on this class — harmless. The reusable infra
 * (VFXManager, Settings, End/PausePanel, leaderboard, PortalAdapter) is untouched and will be
 * re-wired from the future FunKoolkan managers.
 */
@ccclass('GameManager')
export class GameManager extends Component {
    onLoad(): void {
        // The game runs in PORTRAIT (720×1280, fit-to-height). The old (removed) GameManager set this; it
        // MUST stay or the Game scene falls back to the project default (1280×720 landscape) and the whole
        // playfield gets letterboxed/shrunk in portrait. Same call as MainMenu/LeaderboardPanel; FitScale
        // then fits the arena to the portrait width. (See CoordConverter — the rest of the game assumes 720×1280.)
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);
        StoneExplosion.preload();   // load the explosion particle textures now, so the FIRST blast is textured
    }
    start(): void {
        console.log(`[FunKoolkan] v${VERSION} — GameManager placeholder (legacy warrior engine removed).`);
    }
}
