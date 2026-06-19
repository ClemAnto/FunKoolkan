import { _decorator, Component, Node, Button, Label, UIOpacity, tween } from 'cc';
import { NAME_ALPHABET, NAME_LEN } from '../config/LeaderboardConfig';
import { SafeStorage } from '../utils/SafeStorage';

const { ccclass, property } = _decorator;

/** Last confirmed initials — preloaded as the default on the next entry. */
const LAST_NAME_KEY = 'fw_lb_last_name';

/**
 * Arcade-style name entry: NAME_LEN slots, each an A–Z letter cycled with an
 * up/down arrow, plus a confirm button. Behavior only — the node hierarchy lives
 * in the NameEntry prefab and is wired through the @property slots below, so the
 * layout is editable in the editor (no UI built from code).
 *
 * Bind exactly NAME_LEN entries in letterLabels / upButtons / downButtons (slot
 * order = visual left-to-right). Drive it from code with open()/close().
 *
 * REUSABLE: depends only on LeaderboardConfig constants. Drop the prefab + this
 * file into another project and rebind the slots.
 */
@ccclass('NameEntry')
export class NameEntry extends Component {
    @property({ type: [Label], tooltip: 'One Label per slot (left→right). Length must equal NAME_LEN.' })
    letterLabels: Label[] = [];
    @property({ type: [Button], tooltip: 'Up/next-letter button per slot (same order as letterLabels).' })
    upButtons: Button[] = [];
    @property({ type: [Button], tooltip: 'Down/prev-letter button per slot (same order as letterLabels).' })
    downButtons: Button[] = [];
    @property({ type: Button, tooltip: 'Confirm button — emits the assembled name.' })
    confirmButton: Button | null = null;
    @property({ type: Label, tooltip: 'Optional label that shows the qualifying score.' })
    scoreLabel: Label | null = null;
    @property({ type: Node, tooltip: 'Panel to fade. If unset, this component\'s own node is used.' })
    dialogNode: Node | null = null;

    /** Index into NAME_ALPHABET for each slot. */
    private _idx: number[] = [];
    private _op: UIOpacity | null = null;
    private _onConfirm: ((name: string) => void) | null = null;

    private get _dialog(): Node {
        return this.dialogNode ?? this.node;
    }

    onLoad(): void {
        const dlg = this._dialog;
        this._op = dlg.getComponent(UIOpacity) ?? dlg.addComponent(UIOpacity);
        this._op.opacity = 0;
        dlg.active = false;

        this.upButtons.forEach((b, i) => b?.node.on(Button.EventType.CLICK, () => this._cycle(i, +1), this));
        this.downButtons.forEach((b, i) => b?.node.on(Button.EventType.CLICK, () => this._cycle(i, -1), this));
        this.confirmButton?.node.on(Button.EventType.CLICK, this._confirm, this);

        if (this.letterLabels.length !== NAME_LEN) {
            console.warn(`[NameEntry] bound ${this.letterLabels.length} letter labels but NAME_LEN=${NAME_LEN}`);
        }
    }

    /**
     * Show the selector. `score` is displayed (if scoreLabel is set); `onConfirm`
     * receives the assembled NAME_LEN-letter name when the player confirms.
     */
    open(score: number, onConfirm: (name: string) => void): void {
        this._onConfirm = onConfirm;
        this._idx = this._loadLastName() ?? new Array(NAME_LEN).fill(0);
        if (this.confirmButton) this.confirmButton.interactable = true;
        if (this.scoreLabel) this.scoreLabel.string = String(score);
        this._refresh();
        const dlg = this._dialog;
        dlg.active = true;
        if (this._op) tween(this._op).to(0.25, { opacity: 255 }, { easing: 'sineOut' }).start();
    }

    close(): void {
        const dlg = this._dialog;
        if (!this._op) { dlg.active = false; return; }
        tween(this._op)
            .to(0.2, { opacity: 0 }, { easing: 'sineIn' })
            .call(() => { dlg.active = false; })
            .start();
    }

    private _cycle(slot: number, dir: number): void {
        const n = NAME_ALPHABET.length;
        this._idx[slot] = ((this._idx[slot] ?? 0) + dir + n) % n;
        this._refresh();
    }

    private _refresh(): void {
        for (let i = 0; i < this.letterLabels.length; i++) {
            const lbl = this.letterLabels[i];
            if (lbl) lbl.string = NAME_ALPHABET[this._idx[i] ?? 0];
        }
    }

    private _confirm(): void {
        if (!this._onConfirm) return; // already confirmed (double-click during close fade)
        if (this.confirmButton) this.confirmButton.interactable = false;
        const name = Array.from({ length: NAME_LEN }, (_, i) => NAME_ALPHABET[this._idx[i] ?? 0]).join('');
        SafeStorage.set(LAST_NAME_KEY, name);
        const cb = this._onConfirm;
        this._onConfirm = null; // guard against double-fire
        this.close();
        cb(name);
    }

    /** Slot indices for the last confirmed initials, or null if absent/invalid. */
    private _loadLastName(): number[] | null {
        const saved = SafeStorage.get(LAST_NAME_KEY);
        if (!saved || saved.length !== NAME_LEN) return null;
        const idx = [...saved].map(ch => NAME_ALPHABET.indexOf(ch));
        return idx.every(i => i >= 0) ? idx : null;
    }
}
