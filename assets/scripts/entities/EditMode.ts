import { _decorator, Component, Node, Vec2, Vec3, UITransform, Sprite, Color, Button, input, Input, EventTouch, EventMouse, RigidBody2D, ERigidBody2DType } from 'cc';
import { Stone } from './Stone';
import { StoneLauncher } from './StoneLauncher';
import { unprojectX, unprojectY, physicsDepth } from '../config/Perspective';

const { ccclass, property, disallowMultiple } = _decorator;

const _tmp = new Vec3();
const _zero = new Vec2(0, 0);
const GRAB_MARGIN = 8;   // extra ground px around a stone's radius that still grabs it (forgiving touch)
const EDIT_ACTIVE_TINT = new Color(186, 214, 71, 255);   // EDIT button tint while active (the button's own pressed green)

/**
 * EDIT mode — a dev/authoring tool to reposition the stones already in the arena by dragging them.
 *
 * Toggled by the HUD EDIT button (bind its click to `toggle()`): ON tints the button active and SUSPENDS
 * the launcher (so touching/dragging a stone never fires), OFF restores normal play. While editing,
 * a touch grabs the nearest stone under it (ground-space hit-test against `Stone.all`), turns its body
 * KINEMATIC so it follows the finger cleanly without physics fighting back, and on release restores it
 * to DYNAMIC (at rest). Deliberately SEPARATE from the launcher: it only suspends it via setSuspended().
 */
@ccclass('EditMode')
@disallowMultiple
export class EditMode extends Component {
    @property({ type: StoneLauncher, tooltip: 'The launcher — suspended (input ignored) while EDIT mode is active.' })
    launcher: StoneLauncher | null = null;
    @property({ type: Node, tooltip: 'Arena container (stones live in its flat ground space). Optional — falls back to the launcher\'s arena.' })
    arena: Node | null = null;
    @property({ type: Node, tooltip: 'The HUD EDIT button node — tinted active while editing (bind its click to toggle()).' })
    editButton: Node | null = null;

    private _editing = false;
    private _grabbed: Stone | null = null;
    private _grabRb: RigidBody2D | null = null;
    private _grabType: ERigidBody2DType = ERigidBody2DType.Dynamic;
    private _btnColor: Color | null = null;   // EDIT button's resting Sprite colour, captured to restore on exit

    /** True while EDIT mode is active. */
    get editing(): boolean { return this._editing; }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START,  this._onDown, this);
        input.on(Input.EventType.TOUCH_MOVE,   this._onMove, this);
        input.on(Input.EventType.TOUCH_END,    this._onUp,   this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onUp,   this);
        input.on(Input.EventType.MOUSE_DOWN,   this._onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE,   this._onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP,     this._onMouseUp,   this);
        // Bind the EDIT button's click here (no manual ClickEvent needed): assign editButton and it just works.
        if (this.editButton?.isValid) this.editButton.on(Button.EventType.CLICK, this.toggle, this);
        else console.warn('[EditMode] editButton not assigned — the EDIT button will not toggle edit mode');
    }
    onDisable(): void {
        if (this.editButton?.isValid) this.editButton.off(Button.EventType.CLICK, this.toggle, this);
        input.off(Input.EventType.TOUCH_START,  this._onDown, this);
        input.off(Input.EventType.TOUCH_MOVE,   this._onMove, this);
        input.off(Input.EventType.TOUCH_END,    this._onUp,   this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onUp,   this);
        input.off(Input.EventType.MOUSE_DOWN,   this._onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE,   this._onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP,     this._onMouseUp,   this);
        this._drop();
    }

    /** Toggle EDIT mode. Bind the HUD EDIT button's click event to this method. */
    toggle(): void {
        this._editing = !this._editing;
        this._setButtonActive(this._editing);
        if (!this._editing) this._drop();
        // NOTE: the launcher is NOT suspended by being in EDIT mode — launching stays available. It is
        // suspended only WHILE a stone is actually being dragged (see _grab/_drop), so a drag can't fire.
        console.log(`[EditMode] ${this._editing ? 'ON — drag stones (launcher still works)' : 'OFF'}`);
    }

    /** Tint the EDIT button to show the active state (its Sprite colour; restored on exit). The button's
     *  SCALE transition leaves the Sprite colour to us, so the tint sticks while editing. */
    private _setButtonActive(active: boolean): void {
        const sp = this.editButton?.getComponent(Sprite);
        if (!sp) return;
        if (!this._btnColor) this._btnColor = sp.color.clone();
        sp.color = active ? EDIT_ACTIVE_TINT : this._btnColor;
    }

    // ── input (acts only while editing) ──

    private _onDown(e: EventTouch): void { const p = e.getUILocation(); this._grab(p.x, p.y); }
    private _onMove(e: EventTouch): void { const p = e.getUILocation(); this._move(p.x, p.y); }
    private _onUp(): void { this._drop(); }
    private _onMouseDown(e: EventMouse): void { const p = e.getUILocation(); this._grab(p.x, p.y); }
    private _onMouseMove(e: EventMouse): void { if (this._grabbed) { const p = e.getUILocation(); this._move(p.x, p.y); } }
    private _onMouseUp(): void { this._drop(); }

    /** Grab the nearest stone whose body circle contains the touch point (in ground space). */
    private _grab(uiX: number, uiY: number): void {
        if (!this._editing || this._grabbed) return;
        const g = this._toGround(uiX, uiY);
        if (!g) return;
        let best: Stone | null = null, bestD = Infinity;
        const stones = Stone.all;
        for (let i = 0; i < stones.length; i++) {
            const st = stones[i];
            if (!st.node?.isValid) continue;
            const p = st.node.position;
            const d = Math.hypot(p.x - g.x, p.y - g.y);
            if (d <= st.radius + GRAB_MARGIN && d < bestD) { best = st; bestD = d; }
        }
        if (!best) return;
        this._grabbed = best;
        this.launcher?.setSuspended(true);   // a stone is in hand → stop the launcher (aborts any aim from this same touch)
        this._grabRb = best.getComponent(RigidBody2D);
        if (this._grabRb) {
            this._grabType = this._grabRb.type;
            this._grabRb.type = ERigidBody2DType.Kinematic;   // follow the finger cleanly; physics can't fight it
            this._grabRb.linearVelocity = _zero;
            this._grabRb.angularVelocity = 0;
        }
    }

    /** Move the grabbed stone's body to the touch point (ground space); its view follows in lateUpdate. */
    private _move(uiX: number, uiY: number): void {
        if (!this._grabbed?.node?.isValid) return;
        const g = this._toGround(uiX, uiY);
        if (!g) return;
        this._grabbed.node.setPosition(g.x, g.y, 0);
    }

    /** Release the grabbed stone: back to DYNAMIC, at rest. */
    private _drop(): void {
        if (this._grabbed?.node?.isValid && this._grabRb?.isValid) {
            this._grabRb.type = this._grabType;
            this._grabRb.linearVelocity = _zero;
            this._grabRb.angularVelocity = 0;
        }
        if (this._grabbed) this.launcher?.setSuspended(false);   // stone released → the launcher works again
        this._grabbed = null;
        this._grabRb = null;
    }

    /** Convert a UI touch point to the arena's flat ground space (world → arena-local → unproject). */
    private _toGround(uiX: number, uiY: number): { x: number; y: number } | null {
        const arena = this.arena ?? this.launcher?.arena ?? null;
        const ut = arena?.getComponent(UITransform);
        if (!ut || physicsDepth() <= 0) return null;
        _tmp.set(uiX, uiY, 0);
        ut.convertToNodeSpaceAR(_tmp, _tmp);   // touch → arena-local (visual)
        return { x: unprojectX(_tmp.x, _tmp.y), y: unprojectY(_tmp.y) };
    }
}
