import { _decorator, Component, Node, Vec2, Vec3, UITransform, Sprite, Button, input, Input, EventTouch, EventMouse, instantiate } from 'cc';
import { Rune } from './Rune';
import { Glue } from './Glue';
import { Stone } from './Stone';
import { StoneLauncher } from './StoneLauncher';
import { SafeStorage } from '../utils/SafeStorage';
import { EditState } from '../config/EditState';

const { ccclass, property, disallowMultiple } = _decorator;

const _p = new Vec3();     // reused for ghost world position
const _hit = new Vec2();   // reused for the palette hit-test
const LAYOUT_KEY = 'fk.arenaLayout';

/** One saved stone: gem type + its ground-space position. */
interface SavedStone { t: number; x: number; y: number; }

/**
 * The EDIT panel (HUD). It is shown only while EDIT mode is active (EditMode toggles this node's active), so
 * this component only listens while visible. It owns the panel's three edit tools:
 *
 *  - PALETTE: each child Rune is a draggable template — press one, drag a ghost copy onto the arena, and on
 *    release a stone of that rune's gemType is created at the drop point. Release off the arena cancels.
 *  - SAVE: snapshots every live stone (gem type + ground position) to localStorage.
 *  - LOAD: clears the arena (destroys every spawned stone) and re-creates the saved layout AT REST — one
 *    frame later, so the cleared Box2D bodies are gone first (else new stones spawn into a dying body and
 *    get ejected). Poles / launcher / the loaded gem are untouched (not Stones).
 *
 * Authored in the EDITOR: attach to the EditPanel node and assign `launcher` (+ optional save/load buttons).
 * Palette runes are read from this subtree (any child with a Rune component) — no name lookups, no per-rune
 * wiring. The SAVE/LOAD buttons auto-bind their CLICK (no manual ClickEvent needed).
 *
 * VISIBILITY: the panel shows/hides ITSELF from the shared EditState.editing flag (set by EditMode) — no
 * cross-node reference to wire. The node stays active (so update() can poll); when hidden it disables its
 * background Sprite + deactivates its children, and publishes its on-screen box to EditState while visible.
 */
@ccclass('EditPanel')
@disallowMultiple
export class EditPanel extends Component {
    @property({ type: StoneLauncher, tooltip: 'The launcher — spawns the dropped/restored runes as stones (reusing its stone config + arena).' })
    launcher: StoneLauncher | null = null;
    @property({ type: Node, tooltip: 'SAVE button — snapshots the current arena layout to localStorage. Optional.' })
    saveButton: Node | null = null;
    @property({ type: Node, tooltip: 'LOAD button — clears the arena and restores the saved layout. Optional.' })
    loadButton: Node | null = null;

    private _dragType = -1;               // gemType being dragged (-1 = not dragging)
    private _ghost: Node | null = null;   // visual copy of the dragged rune following the finger
    private _shown = true;                // current visible state (synced to EditState.editing in update)

    onLoad(): void { this._shown = false; this._setShown(false); }   // start hidden, no first-frame flash

    update(): void {
        if (EditState.editing !== this._shown) { this._shown = EditState.editing; this._setShown(this._shown); }
        // publish the panel box so EditMode won't grab an arena stone through it (only while visible)
        EditState.panelRect = this._shown ? this.getComponent(UITransform)?.getBoundingBoxToWorld() ?? null : null;
    }

    /** Show/hide the whole panel while keeping THIS node active (so update keeps polling): toggle the
     *  background Sprite + every child (palette + buttons). Cancels any drag when hiding. */
    private _setShown(v: boolean): void {
        const sp = this.getComponent(Sprite);
        if (sp) sp.enabled = v;
        const ch = this.node.children;
        for (let i = 0; i < ch.length; i++) ch[i].active = v;
        if (!v) this._cancel();
    }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START,  this._onDown,      this);
        input.on(Input.EventType.TOUCH_MOVE,   this._onMove,      this);
        input.on(Input.EventType.TOUCH_END,    this._onUp,        this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onCancel,    this);
        input.on(Input.EventType.MOUSE_DOWN,   this._onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE,   this._onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP,     this._onMouseUp,   this);
        if (this.saveButton?.isValid) this.saveButton.on(Button.EventType.CLICK, this.save, this);
        if (this.loadButton?.isValid) this.loadButton.on(Button.EventType.CLICK, this.load, this);
    }
    onDisable(): void {
        input.off(Input.EventType.TOUCH_START,  this._onDown,      this);
        input.off(Input.EventType.TOUCH_MOVE,   this._onMove,      this);
        input.off(Input.EventType.TOUCH_END,    this._onUp,        this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onCancel,    this);
        input.off(Input.EventType.MOUSE_DOWN,   this._onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE,   this._onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP,     this._onMouseUp,   this);
        if (this.saveButton?.isValid) this.saveButton.off(Button.EventType.CLICK, this.save, this);
        if (this.loadButton?.isValid) this.loadButton.off(Button.EventType.CLICK, this.load, this);
        this._cancel();   // dropped/hidden mid-drag → clean up the ghost
        EditState.panelRect = null;
    }

    // ── palette drag/drop ──

    private _onDown(e: EventTouch): void { const p = e.getUILocation(); this._begin(p.x, p.y); }
    private _onMove(e: EventTouch): void { const p = e.getUILocation(); this._move(p.x, p.y); }
    private _onUp(e: EventTouch): void { const p = e.getUILocation(); this._drop(p.x, p.y); }
    private _onCancel(): void { this._cancel(); }
    private _onMouseDown(e: EventMouse): void { const p = e.getUILocation(); this._begin(p.x, p.y); }
    private _onMouseMove(e: EventMouse): void { if (this._dragType >= 0) { const p = e.getUILocation(); this._move(p.x, p.y); } }
    private _onMouseUp(e: EventMouse): void { const p = e.getUILocation(); this._drop(p.x, p.y); }

    /** Start a drag if the press landed on one of the palette runes (remember its gemType, spawn a ghost). */
    private _begin(uiX: number, uiY: number): void {
        if (!EditState.editing || this._dragType >= 0) return;   // inert while the panel is hidden
        const runes = this.getComponentsInChildren(Rune);
        for (let i = 0; i < runes.length; i++) {
            const r = runes[i];
            const ut = r.node?.getComponent(UITransform);
            if (ut && ut.getBoundingBoxToWorld().contains(_hit.set(uiX, uiY))) {
                this._dragType = r.gemType;
                this._spawnGhost(r.node, uiX, uiY);
                return;
            }
        }
    }

    private _move(uiX: number, uiY: number): void {
        if (this._dragType < 0 || !this._ghost?.isValid) return;
        this._ghost.setWorldPosition(_p.set(uiX, uiY, 0));
    }

    /** On release: if over the arena, create a stone of the dragged type there (the launcher checks bounds). */
    private _drop(uiX: number, uiY: number): void {
        if (this._dragType >= 0) this.launcher?.trySpawnAtUI(uiX, uiY, this._dragType);
        this._cancel();
    }

    private _cancel(): void {
        this._dragType = -1;
        if (this._ghost?.isValid) this._ghost.destroy();
        this._ghost = null;
    }

    /** A visual copy of the dragged rune that follows the finger, parented to the HUD so it renders on top. */
    private _spawnGhost(src: Node, uiX: number, uiY: number): void {
        const layer = this.node.parent;   // the HUD — above the arena in render order
        if (!src?.isValid || !layer?.isValid) return;
        const g = instantiate(src) as unknown as Node;
        g.setParent(layer);
        g.setSiblingIndex(layer.children.length - 1);   // on top of the HUD
        g.setWorldScale(src.worldScale);                // keep the palette's on-screen size
        g.setWorldPosition(_p.set(uiX, uiY, 0));
        this._ghost = g;
    }

    // ── save / load arena layout ──

    /** Snapshot every live stone (gem type + ground position) to localStorage. */
    save(): void {
        const stones = Stone.all;
        const data: SavedStone[] = [];
        for (let i = 0; i < stones.length; i++) {
            const s = stones[i];
            const glue = s.node?.isValid ? s.getComponent(Glue) : null;
            if (!glue) continue;   // skip bombs / typeless stones
            const p = s.node.position;
            data.push({ t: glue.gemType, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
        }
        SafeStorage.set(LAYOUT_KEY, JSON.stringify(data));
        console.log(`[EditPanel] saved ${data.length} stones`);
    }

    /** Clear the arena and restore the saved layout from localStorage. */
    load(): void {
        const raw = SafeStorage.get(LAYOUT_KEY);
        if (!raw) { console.warn('[EditPanel] nothing saved to load'); return; }
        let data: SavedStone[];
        try { data = JSON.parse(raw); } catch { console.warn('[EditPanel] saved layout is corrupt — ignoring'); return; }
        if (!Array.isArray(data)) return;

        // 1) reset: destroy every spawned stone (deferred → the Box2D bodies are gone by end of frame).
        const live = Stone.all.slice();
        for (let i = 0; i < live.length; i++) if (live[i].node?.isValid) live[i].node.destroy();

        // 2) restore NEXT frame, once the cleared bodies are gone, so new stones don't spawn into a body
        //    still being destroyed (which Box2D would eject).
        this.scheduleOnce(() => {
            let n = 0;
            for (let i = 0; i < data.length; i++) {
                const e = data[i];
                if (this.launcher?.spawnRestingStone(e.x, e.y, e.t)) n++;
            }
            console.log(`[EditPanel] loaded ${n} stones`);
        }, 0);
    }
}
