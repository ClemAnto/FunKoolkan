import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** Game version — keep aligned with package.json (see CLAUDE.md §Versioning). */
export const VERSION = '0.1.25';

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
    start(): void {
        console.log(`[FunKoolkan] v${VERSION} — GameManager placeholder (legacy warrior engine removed).`);
    }
}
