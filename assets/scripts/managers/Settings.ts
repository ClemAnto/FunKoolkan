import { _decorator, Component, Node, Toggle, Button, UIOpacity, tween, sys, instantiate, Label, UITransform, Widget } from 'cc';
import { AudioManager } from './AudioManager';
import { SafeStorage } from '../utils/SafeStorage';
import { PORTAL } from '../config/PortalConfig';

const { ccclass, property } = _decorator;

const LS_VIBRATION = 'fw_vibration';

/**
 * Centralized settings dialog — shared by MainMenu and Game scenes.
 * Attach to an ALWAYS-ACTIVE node (e.g. Canvas) and set `dialogNode` to the
 * Dialog panel — that way the Dialog can stay inactive in the editor and onLoad
 * still runs. (If left unset, `dialogNode` falls back to this component's own node.)
 * The component hides the dialog itself in onLoad before the first frame renders.
 *
 * Owns the four toggles (vibration / sfx / music / fullscreen) and the open/close
 * fade. Audio mute state lives in AudioManager (persisted in localStorage), vibration
 * in localStorage under fw_vibration — both shared across scenes automatically.
 *
 * Host hooks let a scene react without duplicating the dialog logic:
 *   - canOpen      → return false to veto opening (e.g. game over)
 *   - onBeforeOpen → called right before the dialog fades in (e.g. pause the game)
 *   - onAfterClose → called after the dialog is hidden (e.g. resume the game)
 */
@ccclass('Settings')
export class Settings extends Component {
    @property({ type: Node, tooltip: 'The Dialog panel to show/hide. If unset, uses this component\'s own node.' })
    dialogNode: Node | null = null;
    @property({ type: Node, tooltip: 'Button that opens this dialog (outside the dialog).' })
    menuButton: Node | null = null;
    @property({ type: Node, tooltip: 'Button that closes this dialog.' })
    closeButton: Node | null = null;
    @property({ type: Node, tooltip: 'Optional pre-made "Quit" button. If unset, one is cloned from closeButton when onQuit is provided (Game scene only).' })
    quitButton: Node | null = null;
    @property({ type: Toggle, tooltip: 'Vibration on/off.' })
    vibrToggle: Toggle | null = null;
    @property({ type: Toggle, tooltip: 'SFX on/off.' })
    sfxToggle: Toggle | null = null;
    @property({ type: Toggle, tooltip: 'Music on/off.' })
    musicToggle: Toggle | null = null;
    @property({ type: Toggle, tooltip: 'Fullscreen on/off.' })
    fsToggle: Toggle | null = null;

    /** Host hooks — set by the owning scene (GameManager). Null in MainMenu. */
    canOpen:      (() => boolean) | null = null;
    onBeforeOpen: (() => void)    | null = null;
    onAfterClose: (() => void)    | null = null;
    /** Quit the current game and return to the menu. Set by GameManager (Game scene only); null in MainMenu → no button. */
    onQuit:       (() => void)    | null = null;

    private _op: UIOpacity | null = null;
    private _syncing = false;
    private _quitBtn: Node | null = null;
    private _quitArmed = false;

    /** Shared source of truth for the vibration preference. */
    static get vibrationEnabled(): boolean {
        return SafeStorage.get(LS_VIBRATION) !== '0';
    }

    /** The dialog panel — explicit dialogNode, or this component's own node as fallback. */
    private get _dialog(): Node {
        return this.dialogNode ?? this.node;
    }

    onLoad(): void {
        const dlg = this._dialog;
        this._op = dlg.getComponent(UIOpacity) ?? dlg.addComponent(UIOpacity);
        this._op.opacity = 0;
        dlg.active = false;

        // Ensure a Button exists so CLICK is emitted, then wire it (matches the old GameManager behavior).
        if (this.menuButton) {
            this.menuButton.getComponent(Button) ?? this.menuButton.addComponent(Button);
            this.menuButton.on(Button.EventType.CLICK, this.open, this);
        }
        if (this.closeButton) {
            this.closeButton.getComponent(Button) ?? this.closeButton.addComponent(Button);
            this.closeButton.on(Button.EventType.CLICK, this.close, this);
        }
        if (this.quitButton) {
            this.quitButton.getComponent(Button) ?? this.quitButton.addComponent(Button);
            this.quitButton.on(Button.EventType.CLICK, this._doQuit, this);
        }

        this.vibrToggle?.node.on('toggle',  () => { if (!this._syncing) this._toggleVibration(); }, this);
        this.sfxToggle?.node.on('toggle',   () => { if (!this._syncing) AudioManager.instance.toggleSfx(); }, this);
        this.musicToggle?.node.on('toggle', () => { if (!this._syncing) AudioManager.instance.toggleMusic(); }, this);
        this.fsToggle?.node.on('toggle',    () => { if (!this._syncing) this._toggleFullscreen(); }, this);

        // Hide the fullscreen row when unsupported (no requestFullscreen) OR on CrazyGames:
        // custom in-game fullscreen buttons are prohibited there (the platform owns fullscreen).
        const fsUnsupported = !sys.isBrowser || !(document.documentElement as any).requestFullscreen;
        if (this.fsToggle && (fsUnsupported || PORTAL === 'crazygames')) {
            this.fsToggle.node.active = false;
        }
    }

    open(): void {
        const dlg = this._dialog;
        if (dlg.active) return;
        if (this.canOpen && !this.canOpen()) return;
        this.onBeforeOpen?.();
        dlg.active = true;
        this._ensureQuitButton();
        this._disarmQuit();
        const quitNode = this.quitButton ?? this._quitBtn;
        if (quitNode) quitNode.active = !!this.onQuit;
        this._syncToggles();
        if (this._op) {
            this._op.opacity = 0;
            tween(this._op).to(0.2, { opacity: 255 }).start();
        }
    }

    close(): void {
        const dlg = this._dialog;
        if (!dlg.active) return;
        if (!this._op) {
            dlg.active = false;
            this.onAfterClose?.();
            return;
        }
        tween(this._op)
            .to(0.2, { opacity: 0 })
            .call(() => {
                dlg.active = false;
                this.onAfterClose?.();
            })
            .start();
    }

    /** Two-step confirm: first click arms the button ("Sure?"), second click quits to the menu. */
    private _doQuit(): void {
        if (!this.onQuit) return;
        if (!this._quitArmed) {
            this._quitArmed = true;
            const lbl = (this.quitButton ?? this._quitBtn)?.getComponentInChildren(Label);
            if (lbl) lbl.string = 'Sure?';
            return;
        }
        const quit = this.onQuit;
        this.close();
        quit();
    }

    /** Reset the quit confirmation state and restore the button label. */
    private _disarmQuit(): void {
        if (!this._quitArmed) return;
        this._quitArmed = false;
        const lbl = (this.quitButton ?? this._quitBtn)?.getComponentInChildren(Label);
        if (lbl) lbl.string = 'Quit';
    }

    /**
     * Build a "Quit" button by cloning closeButton the first time the dialog opens with
     * an onQuit hook set (Game scene only). No-op if a dedicated quitButton was assigned
     * in the editor, or if there's no closeButton to clone, or in MainMenu (onQuit null).
     */
    private _ensureQuitButton(): void {
        if (this._quitBtn || this.quitButton || !this.onQuit || !this.closeButton) return;
        const cb    = this.closeButton;
        const clone = instantiate(cb);
        clone.name  = 'QuitButton';
        clone.setParent(cb.parent);
        // The source button's Widget (alignMode ALWAYS, pinned to the panel bottom) would snap
        // the clone back on top of the original. destroy() alone is deferred to end-of-frame,
        // so the Widget would still align once AFTER our setPosition — disable it right away.
        const w = clone.getComponent(Widget);
        if (w) { w.enabled = false; w.destroy(); }
        // Side by side: the close button sits left of center (editor Widget), the clone mirrors
        // it on the right. If close is centered (no room beside it), stack the clone above instead.
        const p = cb.position;
        if (Math.abs(p.x) > 1) {
            clone.setPosition(-p.x, p.y, p.z);
        } else {
            const uit = cb.getComponent(UITransform);
            const dy  = (uit ? uit.contentSize.height : 40) * cb.scale.y * 1.4;
            clone.setPosition(p.x, p.y + dy, p.z);
        }
        const lbl = clone.getComponentInChildren(Label);
        if (lbl) { lbl.string = 'Quit'; lbl.overflow = Label.Overflow.SHRINK; }
        clone.getComponent(Button) ?? clone.addComponent(Button);
        clone.on(Button.EventType.CLICK, this._doQuit, this);
        this._quitBtn = clone;
    }

    private _syncToggles(): void {
        this._syncing = true;
        if (this.vibrToggle)  this.vibrToggle.isChecked  = Settings.vibrationEnabled;
        if (this.sfxToggle)   this.sfxToggle.isChecked   = !AudioManager.instance.sfxMuted;
        if (this.musicToggle) this.musicToggle.isChecked = !AudioManager.instance.musicMuted;
        if (this.fsToggle)    this.fsToggle.isChecked    = sys.isBrowser && !!document.fullscreenElement;
        this._syncing = false;
    }

    private _toggleVibration(): void {
        const enabled = !Settings.vibrationEnabled;
        SafeStorage.set(LS_VIBRATION, enabled ? '1' : '0');
    }

    private _toggleFullscreen(): void {
        if (!sys.isBrowser) return;
        if (!(document as any).fullscreenElement) {
            (document.documentElement as any).requestFullscreen?.().catch?.(() => {});
        } else {
            (document as any).exitFullscreen?.().catch?.(() => {});
        }
    }
}
