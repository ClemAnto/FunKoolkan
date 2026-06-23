import { _decorator, Component, Node, Sprite, Color, Button } from 'cc';
import { DebugDraw } from '../config/DebugDraw';

const { ccclass, property, disallowMultiple } = _decorator;

const ACTIVE_TINT = new Color(186, 214, 71, 255);   // DEBUG button tint while debug draw is on (the button's pressed green)

/**
 * The HUD DEBUG toggle: flips the GLOBAL debug-draw switch (DebugDraw) so every debug overlay in the game
 * (poles, glue, stones, the HOUSE/TEE zones, the arena rim, the launcher body) turns on/off at once. The
 * choice is persisted in localStorage (it survives a reload).
 *
 * Authored in the EDITOR: attach to any node (e.g. GameManager) and assign `debugButton`. Mirrors EditMode
 * — it auto-binds the button's CLICK in onEnable, so no manual ClickEvent is needed. The button is tinted
 * while debug draw is active (and reflects the persisted state on start).
 */
@ccclass('DebugToggle')
@disallowMultiple
export class DebugToggle extends Component {
    @property({ type: Node, tooltip: 'The HUD DEBUG button node — toggles ALL debug drawing (this auto-binds its click; no ClickEvent needed).' })
    debugButton: Node | null = null;

    private _btnColor: Color | null = null;   // the button's resting Sprite colour, captured to restore when off

    onEnable(): void {
        if (this.debugButton?.isValid) this.debugButton.on(Button.EventType.CLICK, this._toggle, this);
        else console.warn('[DebugToggle] debugButton not assigned — the DEBUG button will not toggle debug drawing');
        this._refreshTint();   // reflect the persisted state on the button
    }
    onDisable(): void {
        if (this.debugButton?.isValid) this.debugButton.off(Button.EventType.CLICK, this._toggle, this);
    }

    private _toggle(): void {
        const on = DebugDraw.toggle();
        this._refreshTint();
        console.log(`[DebugToggle] debug draw ${on ? 'ON' : 'OFF'}`);
    }

    /** Tint the DEBUG button to mirror the current state (its Sprite colour; restored when off). The
     *  button's SCALE transition leaves the Sprite colour to us, so the tint sticks while active. */
    private _refreshTint(): void {
        const sp = this.debugButton?.getComponent(Sprite);
        if (!sp) return;
        if (!this._btnColor) this._btnColor = sp.color.clone();
        sp.color = DebugDraw.enabled ? ACTIVE_TINT : this._btnColor;
    }
}
