import { _decorator, Component, Node, Label, Button, director, view, ResolutionPolicy, resources, SpriteFrame, Sprite, UIOpacity, tween, find, Graphics, Color } from 'cc';
import { AudioManager, SFX } from './AudioManager';
import { VERSION } from './GameManager';
import { SafeStorage } from '../utils/SafeStorage';
import { PortalProvider } from '../services/PortalProvider';
import { LEADERBOARD_ALLOWED } from '../config/PortalConfig';
import { ENABLED as LEADERBOARD_CONFIG_ENABLED } from '../config/LeaderboardConfig';
import { BgFill } from '../entities/BgFill';

const { ccclass, property } = _decorator;

const LS_BEST_SCORE  = 'fw_best_score';
const GAME_SCENE     = 'Game';
const RANKING_SCENE  = 'Ranking';

/**
 * Main menu scene controller — splash + PLAY + LEADERBOARD.
 * The options dialog is handled by the shared Settings component (on the Dialog node),
 * not here, so both scenes use the same logic.
 */
@ccclass('MainMenu')
export class MainMenu extends Component {
    @property({ type: Node, tooltip: 'PLAY button — starts the Game scene.' })
    playButton: Node | null = null;
    @property({ type: Label, tooltip: 'Best score label.' })
    bestLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Version label.' })
    versionLabel: Label | null = null;
    @property({ type: Node, tooltip: 'LEADERBOARD button — opens the Ranking scene.' })
    leaderboardButton: Node | null = null;

    start(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);

        // Audio: shared singleton, mute state persisted in localStorage. Menu uses the tavern loop.
        AudioManager.instance.playMusic(SFX.MUSIC_MENU);
        AudioManager.instance.ensureMusic();

        // Portal SDK (no-op on standalone builds): entry scene = game loaded.
        const portal = PortalProvider.get();
        void portal.init().then(() => portal.gameLoadingFinished());

        // Background is lazy-loaded (not a scene dependency) so it stays off the loading-screen critical
        // path; the menu shows instantly on the camera's dark-blue clear colour, then the art fades in.
        this._loadMenuBg();

        // Preload the Game in the background so PLAY transitions instantly (CrazyGames: land in
        // gameplay with a single click — onboarding is now in-game, no separate tutorial scene).
        director.preloadScene(GAME_SCENE);

        const best = parseInt(SafeStorage.get(LS_BEST_SCORE) ?? '0', 10) || 0;
        if (this.bestLabel)    this.bestLabel.string    = `Best Score\n${best}`;
        if (this.versionLabel) this.versionLabel.string = `v${VERSION}`;

        this.playButton?.on(Button.EventType.CLICK, this.onPlay, this);
        if (this.leaderboardButton) {
            // Hide the LEADERBOARD button when the online leaderboard is off for this build
            // (GameDistribution §7) — the Ranking scene would otherwise be empty/dead.
            if (!(LEADERBOARD_CONFIG_ENABLED && LEADERBOARD_ALLOWED)) {
                this.leaderboardButton.active = false;
            } else {
                // Ensure a Button exists so CLICK is emitted even if the node lacks one.
                this.leaderboardButton.getComponent(Button) ?? this.leaderboardButton.addComponent(Button);
                this.leaderboardButton.on(Button.EventType.CLICK, this.onLeaderboard, this);
            }
        }
    }

    private _playing = false;

    /** Public so it can also be wired via the editor's clickEvents if preferred. */
    onPlay(): void {
        if (this._playing) return;
        this._playing = true;
        // No commercial break here: portals forbid ads before the first gameplay. PLAY goes straight
        // to the Game (single click into gameplay); onboarding is handled in-game.
        const target = GAME_SCENE;

        const overlay = find('Canvas/FadeOverlay');
        const op = overlay?.getComponent(UIOpacity);
        const loadTarget = (): void => {
            // Spinner only if the scene isn't ready almost immediately (avoids a 1-frame flash on a
            // preloaded scene). On scene launch this whole scene — overlay + spinner — is destroyed.
            if (overlay) this.scheduleOnce(() => this._showFadeSpinner(overlay), 0.15);
            director.loadScene(target);
        };
        if (op && overlay) {
            overlay.active = true;
            tween(op).to(0.35, { opacity: 255 }).call(loadTarget).start();
        } else {
            loadTarget();
        }
    }

    /** Small spinning arc on the (black) fade overlay while the next scene finishes loading. */
    private _showFadeSpinner(parent: Node): void {
        if (!parent?.isValid || parent.getChildByName('FadeSpinner')) return;
        const n = new Node('FadeSpinner');
        n.layer = parent.layer;
        n.setParent(parent);
        const g = n.addComponent(Graphics);
        g.lineWidth = 6;
        g.strokeColor = new Color(255, 212, 50, 230);
        g.arc(0, 0, 28, 0, Math.PI * 1.5, false);
        g.stroke();
        const spin = (): void => { if (n.isValid) tween(n).by(0.7, { angle: -360 }).call(spin).start(); };
        spin();
    }

    /** Lazy-load the menu background from resources/ and fade it in (kept off the loading-screen path). */
    private _loadMenuBg(): void {
        const bgNode = find('Canvas/Background');
        const sp = bgNode?.getComponent(Sprite);
        if (!sp) return;
        resources.load('bg/title_bg/spriteFrame', SpriteFrame, (err, sf) => {
            if (err || !sp.isValid || !sf) return;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;  // keep the Widget's fullscreen size (don't resize to texture)
            const op = bgNode!.getComponent(UIOpacity) ?? bgNode!.addComponent(UIOpacity);
            op.opacity = 0;
            sp.spriteFrame = sf;
            bgNode!.getComponent(BgFill)?.refit();  // cover-fit now that the texture is loaded
            tween(op).to(0.3, { opacity: 255 }).start();
        });
    }

    /** Opens the dedicated Ranking scene (leaderboard always visible there). */
    onLeaderboard(): void {
        director.loadScene(RANKING_SCENE);
    }
}
