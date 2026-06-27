import { _decorator, Component, Node, Prefab, instantiate, CCInteger, CCFloat, Enum, Vec3 } from 'cc';
import { ColumnCube } from './ColumnCube';
import { RuneKind } from '../config/RuneTypes';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * A sacred column (GDD v0.4): a vertical stack of ColumnCube instances, all marked with one rune type.
 * RaisingStars of that type knock cubes off the top; clearing both columns completes the round, after
 * which they are rebuilt taller.
 *
 * Authoring: set `cubes` (the stack height) in the editor and the component instantiates that many
 * `cubePrefab` clones as children, stacked vertically by `spacing`. This is the prefab-instanced-N-times
 * exception to the no-programmatic-build rule — the cubes are authored prefabs, not built node hierarchies.
 * @executeInEditMode so the stack rebuilds live as you change `cubes`.
 */
@ccclass('Column')
@executeInEditMode
export class Column extends Component {
    @property({ type: Prefab, tooltip: 'The ColumnCube prefab to stack. One clone is instantiated per cube.' })
    cubePrefab: Prefab | null = null;

    @property({ visible: false })
    private _cubes = 0;   // serialized backing for `cubes` — the current stack height

    @property({ type: CCInteger, tooltip: 'How many ColumnCube to stack. Changing this in the editor adds/removes cubes to match (and resizes cubeTypes).', min: 0, step: 1 })
    get cubes(): number { return this._cubes; }
    set cubes(n: number) {
        this._cubes = Math.max(0, Math.floor(n));
        this._syncTypesLength();
        this._rebuild();
    }

    @property({ visible: false })
    private _spacingX = 0;   // serialized backing for `spacingX`

    @property({ type: CCFloat, tooltip: 'Horizontal gap (px, local) between stacked cubes. Cube i sits at x = i * spacingX (0 = straight up; non-zero = leaning stack).' })
    get spacingX(): number { return this._spacingX; }
    set spacingX(v: number) {
        this._spacingX = v;
        this._restack();   // live update — reposition without rebuilding
    }

    @property({ visible: false })
    private _spacingY = 130;   // serialized backing for `spacingY`

    @property({ type: CCFloat, tooltip: 'Vertical gap (px, local) between stacked cubes. Cube i sits at y = i * spacingY.' })
    get spacingY(): number { return this._spacingY; }
    set spacingY(v: number) {
        this._spacingY = v;
        this._restack();   // live update — reposition without rebuilding
    }

    @property({ type: [Enum(RuneKind)], tooltip: 'Type/colour PER cube, bottom-to-top: cubeTypes[i] marks cube i. Length follows `cubes`. Editing an entry retypes that cube live.' })
    get cubeTypes(): RuneKind[] { return this._cubeTypes; }
    set cubeTypes(v: RuneKind[]) {
        this._cubeTypes = v;
        this._restack();   // live update — retype existing cubes, no rebuild
    }

    @property({ visible: false })
    private _cubeTypes: RuneKind[] = [];   // serialized backing for cubeTypes — one entry per cube

    onLoad(): void {
        // At runtime the cubes are already serialized children — just (re)apply each cube's type. Only build
        // from scratch if the prefab was assigned but no cubes were authored (defensive).
        if (this.cubeList().length === 0 && this._cubes > 0) this._rebuild();
        else this._restack();
    }

    /** All ColumnCube components currently stacked in this column, bottom-to-top (child order). */
    cubeList(): ColumnCube[] {
        const out: ColumnCube[] = [];
        for (const child of this.node.children) {
            const cc = child.getComponent(ColumnCube);
            if (cc) out.push(cc);
        }
        return out;
    }

    /** Set every cube to the same type/colour (fills cubeTypes). */
    setType(t: RuneKind): void {
        this._cubeTypes = this.cubeList().map(() => t);
        this._restack();
    }

    /** Set one cube's type/colour (bottom-to-top index) and apply it live. */
    setCubeType(index: number, t: RuneKind): void {
        if (index < 0) return;
        this._cubeTypes[index] = t;
        const cube = this.cubeList()[index];
        if (cube) cube.setType(t);
    }

    // ── runtime (round-driven) API ──

    /** Remove every cube immediately — used on game start / round reset (no animation). */
    clearCubes(): void {
        for (const c of this.cubeList()) c.node.destroy();
    }

    /** How long an existing cube takes to slide up one slot when a new cube is pushed in below it. */
    private static readonly SHIFT_TIME = 0.22;
    /** Gap (s) between successive cube pops while filling — so cubes breach one after another. */
    private static readonly POP_STAGGER = 0.1;
    /** Duration of one cube's pop-in (ColumnCube.playSpawn total) — used to know when the column is fully built. */
    private static readonly POP_DURATION = 0.4;

    /** Total time for fillCubes(count) to finish building (last cube starts at (count-1)·stagger, then pops). */
    static fillDuration(count: number): number {
        return count > 0 ? (count - 1) * Column.POP_STAGGER + Column.POP_DURATION : 0;
    }

    /** Topmost cube that is still standable (valid + not shattering) — what an Aku perches on. Null if none. */
    topLiveCube(): ColumnCube | null {
        const cubes = this.cubeList();
        for (let i = cubes.length - 1; i >= 0; i--) {
            const c = cubes[i];
            if (c.node?.isValid && !c.exploding) return c;
        }
        return null;
    }

    /** Time of the gap-collapse slide (fast, gummy — the cubes above a destroyed one drop into place). */
    private static readonly COLLAPSE_T = 0.18;

    /** A cube shattered → slide every surviving cube down to a gap-free stack (the perched Aku rides the top one
     *  down via its perch-follow). Called by each cube's onRemoved. */
    collapse(): void {
        const live = this.cubeList().filter(c => c.node?.isValid && !c.exploding);
        for (let i = 0; i < live.length; i++) {
            const slot = this._slot(i);
            live[i].slideTo(slot.x, slot.y, Column.COLLAPSE_T);   // fast gummy fall (slideTo uses backOut)
        }
    }

    /**
     * Build the column to `count` cubes, popping them in from the base one after another. `palette` is either a
     * single RuneKind (every cube that type) or a set of types (each cube gets a RANDOM type from the set — the
     * round's allowed colours). The Column owns the whole spawn sequence/animation — callers only state the target.
     */
    fillCubes(count: number, palette: RuneKind | RuneKind[], animated = true): void {
        this.clearCubes();
        const pick = (): RuneKind => Array.isArray(palette)
            ? (palette.length ? palette[Math.floor(Math.random() * palette.length)] : (0 as RuneKind))
            : palette;
        for (let i = 0; i < count; i++) {
            if (animated) this.scheduleOnce(() => this.addCube(pick(), true), i * Column.POP_STAGGER);
            else this.addCube(pick(), false);
        }
    }

    /**
     * Push a new cube in AT THE BASE (slot 0): every existing cube slides up one slot, and the new cube
     * surfaces from the hole at the bottom — so the stack reads as cubes resting one on another.
     */
    addCube(type: RuneKind, animated = true): ColumnCube | null {
        if (!this.cubePrefab) { console.warn('[Column] addCube: no cubePrefab assigned'); return null; }

        // 1. Lift the cubes already present up one slot (their list index becomes i+1 → slot i+2).
        const existing = this.cubeList();   // bottom-to-top (child order)
        for (let i = 0; i < existing.length; i++) {
            const slot = this._slot(i + 1);
            if (animated) existing[i].slideTo(slot.x, slot.y, Column.SHIFT_TIME);
            else existing[i].node.setPosition(slot.x, slot.y, 0);
        }

        // 2. New cube at the bottom slot, as the bottom-most CUBE — but kept AFTER the column's base
        //    sprite(s) in child order so the base stays behind/below in z (it isn't a cube).
        const node = instantiate(this.cubePrefab) as Node;
        this.node.addChild(node);
        const baseCount = this.node.children.filter(c => c !== node && !c.getComponent(ColumnCube)).length;
        node.setSiblingIndex(baseCount);
        const base = this._slot(0);
        node.setPosition(base.x, base.y, 0);
        const cc = node.getComponent(ColumnCube);
        if (!cc) { console.warn('[Column] cubePrefab has no ColumnCube component'); node.destroy(); return null; }
        cc.onRemoved = () => this.collapse();   // shatter → slide the cubes above down into the gap
        cc.setType(type);
        if (animated) cc.playSpawn();
        return cc;
    }

    /** Local position for cube list-index i (i=0 is the bottom cube). The column base sprite is separate. */
    private _slot(i: number): Vec3 {
        return new Vec3(i * this._spacingX, i * this._spacingY, 0);
    }

    /** Type for cube i — from cubeTypes, falling back to the last entry, then Green(0). */
    private _typeForCube(i: number): RuneKind {
        if (this._cubeTypes.length === 0) return 0 as RuneKind;
        return (this._cubeTypes[i] ?? this._cubeTypes[this._cubeTypes.length - 1]) as RuneKind;
    }

    /** Keep cubeTypes the same length as the stack — pad new slots with the top type (or Green). */
    private _syncTypesLength(): void {
        const pad = this._cubeTypes.length ? this._cubeTypes[this._cubeTypes.length - 1] : (0 as RuneKind);
        while (this._cubeTypes.length < this._cubes) this._cubeTypes.push(pad);
        this._cubeTypes.length = this._cubes;
    }

    /** Reconcile the child cube count to `_cubes`, then restack and re-type them. */
    private _rebuild(): void {
        if (!this.cubePrefab) {
            if (this._cubes > 0) console.warn('[Column] cubes > 0 but no cubePrefab assigned — nothing to stack');
            return;
        }
        const cubes = this.cubeList();

        // Remove extras (from the top).
        for (let i = cubes.length - 1; i >= this._cubes; i--) cubes[i].node.destroy();
        cubes.length = Math.min(cubes.length, this._cubes);

        // Add missing.
        for (let i = cubes.length; i < this._cubes; i++) {
            const node = instantiate(this.cubePrefab) as Node;
            this.node.addChild(node);
            const cc = node.getComponent(ColumnCube);
            if (cc) cubes.push(cc);
        }

        this._restack();
    }

    /** Reposition (and re-type) every cube to its stack slot — cheap, no instantiate/destroy. */
    private _restack(): void {
        const cubes = this.cubeList();
        for (let i = 0; i < cubes.length; i++) {
            const slot = this._slot(i);
            cubes[i].node.setPosition(slot.x, slot.y, 0);
            cubes[i].setType(this._typeForCube(i));
        }
    }
}
