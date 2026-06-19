import { _decorator, Component, Node, Button, UIOpacity, tween, Tween } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Pause modal panel. Behaviour only: layout lives in the prefab, editable in the
 * Cocos editor. Replaces the old code-drawn pause overlay in GameManager.
 *
 * The owning scene (GameManager) sets the host hooks; it calls `open()` to pause
 * (also used by the blur/visibility auto-pause) and the Resume button calls
 * `close()`, which fires onResume after the fade:
 *   - onResume  → resume the game
 *   - onRestart → restart the current game
 *   - onMenu    → go to the main menu
 *
 * Starts hidden (opacity 0, inactive).
 */
@ccclass('PausePanel')
export class PausePanel extends Component {
    @property({ type: Button }) resumeButton: Button | null = null;
    @property({ type: Button }) restartButton: Button | null = null;
    @property({ type: Button }) menuButton: Button | null = null;

    /** Host hooks — set by the owning scene (GameManager). */
    onResume:  (() => void) | null = null;
    onRestart: (() => void) | null = null;
    onMenu:    (() => void) | null = null;

    private _op: UIOpacity | null = null;
    private _closing = false;

    get isOpen(): boolean { return this.node.active; }

    onLoad(): void {
        // Leave the node INACTIVE in the editor — this onLoad runs on the first open() activation
        // (so it must NOT self-hide via active=false, or the panel would re-hide on first show).
        this._op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        this._op.opacity = 0;
        this.resumeButton?.node.on(Button.EventType.CLICK,  () => this.close(),        this);
        this.restartButton?.node.on(Button.EventType.CLICK, () => this.onRestart?.(),  this);
        this.menuButton?.node.on(Button.EventType.CLICK,    () => this.onMenu?.(),     this);
    }

    /** Show the panel (fade in). Game pausing is handled by the caller before this. */
    open(): void {
        if (this.node.active && !this._closing) return;
        this._closing = false;
        this.node.active = true;
        if (this._op) {
            Tween.stopAllByTarget(this._op);
            this._op.opacity = 0;
            tween(this._op).to(0.2, { opacity: 255 }).start();
        }
    }

    /** Hide the panel (fade out), then fire onResume. */
    close(): void {
        if (!this.node.active || this._closing) return;
        const done = (): void => { this._closing = false; this.node.active = false; this.onResume?.(); };
        if (!this._op) { done(); return; }
        this._closing = true;
        Tween.stopAllByTarget(this._op);
        tween(this._op).to(0.2, { opacity: 0 }).call(done).start();
    }

    onDestroy(): void {
        if (this._op) Tween.stopAllByTarget(this._op);
    }
}
