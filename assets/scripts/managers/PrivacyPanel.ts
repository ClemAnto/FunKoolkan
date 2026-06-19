import { _decorator, Component, Node, Label, Button, UIOpacity, tween, ScrollView } from 'cc';

const { ccclass, property } = _decorator;

/**
 * In-game Privacy Policy panel — satisfies the CrazyGames "user consent" requirement
 * (a Privacy Policy notice for games that collect data beyond SDK events; we store the
 * 3-letter tag + score for the online leaderboard).
 *
 * Behavior-only, like Settings: the panel and the "Privacy Policy" link are built in the
 * editor; this component fills the text, hides the panel on load, and toggles it.
 * Attach to an always-active node (e.g. Canvas) and assign the four properties.
 *
 * The policy text lives HERE (single source of truth) and is pushed into `textLabel`,
 * so the wording can be updated in code without touching the scene.
 */
const POLICY_TEXT =
    'FunWarriors stores only what the online leaderboard needs.\n\n' +
    'If you submit a score, we save your 3-letter tag, score and round ' +
    '(via Google Firebase). No personally identifying data, and nothing ' +
    'is sent unless you submit.\n\n' +
    'Your best score and settings stay on your device.\n\n' +
    'On game portals, ads are served by the platform under its own ' +
    'privacy policy.';

@ccclass('PrivacyPanel')
export class PrivacyPanel extends Component {
    @property({ type: Node, tooltip: 'The Privacy panel to show/hide. If unset, uses this component\'s own node.' })
    dialogNode: Node | null = null;
    @property({ type: Node, tooltip: 'The "Privacy Policy" link/button that opens the panel (outside the panel).' })
    openButton: Node | null = null;
    @property({ type: Node, tooltip: 'Button that closes the panel.' })
    closeButton: Node | null = null;
    @property({ type: Label, tooltip: 'Label inside the panel that shows the policy text (filled from code).' })
    textLabel: Label | null = null;
    @property({ type: ScrollView, tooltip: 'Optional ScrollView wrapping the text — recalculated/reset to top on open.' })
    scrollView: ScrollView | null = null;

    private _op: UIOpacity | null = null;

    private get _dialog(): Node {
        return this.dialogNode ?? this.node;
    }

    onLoad(): void {
        if (this.textLabel) this.textLabel.string = POLICY_TEXT;

        const dlg = this._dialog;
        this._op = dlg.getComponent(UIOpacity) ?? dlg.addComponent(UIOpacity);
        this._op.opacity = 0;
        dlg.active = false;

        if (this.openButton) {
            this.openButton.getComponent(Button) ?? this.openButton.addComponent(Button);
            this.openButton.on(Button.EventType.CLICK, this.open, this);
        }
        if (this.closeButton) {
            this.closeButton.getComponent(Button) ?? this.closeButton.addComponent(Button);
            this.closeButton.on(Button.EventType.CLICK, this.close, this);
        }
    }

    open(): void {
        const dlg = this._dialog;
        if (dlg.active) return;
        dlg.active = true;
        if (this._op) {
            this._op.opacity = 0;
            tween(this._op).to(0.2, { opacity: 255 }).start();
        }
        // Content height (RESIZE_HEIGHT label) is final now the panel is active — recalc scroll
        // boundary and reset to the top so the policy always opens from the start.
        if (this.scrollView) this.scheduleOnce(() => this.scrollView?.scrollToTop(0), 0);
    }

    close(): void {
        const dlg = this._dialog;
        if (!dlg.active) return;
        if (!this._op) { dlg.active = false; return; }
        tween(this._op)
            .to(0.2, { opacity: 0 })
            .call(() => { dlg.active = false; })
            .start();
    }
}
