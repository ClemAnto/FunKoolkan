import { _decorator, Component, Node, Sprite, Color, Enum, Material, Vec3, tween, Tween } from 'cc';
import { RuneKind } from '../config/RuneTypes';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * Component on the Column-stone (cube) prefab root. A column is a stack of these cubes, each MARKED with
 * the symbol/colour of one rune type (GDD v0.4): a RaisingStar only damages column cubes of its own type.
 *
 * Mirrors Rune for type handling:
 *  - faces: the cube's marked-face nodes INDEXED BY TYPE — faces[gemType] is shown, the rest hidden. The
 *    type id (0..5) is the universal key (RUNES, RuneKind, scoring); RuneKind's values ARE these indices,
 *    so `gemType` doubles as the index into `faces` — not two separate selections.
 *  - gemType: the cube's colour/type — pickable in the editor (a dropdown of RuneKind). Authors a cube
 *    with a preset colour; the column builder overrides it at runtime via setType().
 * Wired in the prefab editor — never resolved by name. @executeInEditMode so picking gemType previews live.
 */
@ccclass('ColumnCube')
@executeInEditMode
export class ColumnCube extends Component {
    @property({ type: [Node], tooltip: 'Face nodes INDEXED BY TYPE: faces[gemType] is shown. Author one per type in RuneKind order (faces[0]=Green, faces[1]=Yellow, …).' })
    faces: Node[] = [];

    @property({ visible: false })
    private _gemType = 0;   // serialized backing for gemType — a RuneKind id, AND the index into faces

    @property({ type: Enum(RuneKind), tooltip: 'Colour/type of this column cube — picks which face shows (faces[gemType]). Set it to author a cube; the column builder overrides it at runtime via setType().' })
    get gemType(): RuneKind { return this._gemType as RuneKind; }
    set gemType(v: RuneKind) { this.setType(v); }

    /** Current cube type (alias of gemType, for callers using `type`). */
    get type(): number { return this._gemType; }

    private _warnedFace = false;

    onLoad(): void { this._applyFaces(); }   // apply the authored/serialized type (runtime + editor preview)

    /** Show the face for type t (faces[t]), hide the others. */
    setType(t: number): void {
        this._gemType = t;
        this._applyFaces();
    }

    private _applyFaces(): void {
        for (let i = 0; i < this.faces.length; i++) {
            if (this.faces[i]) this.faces[i].active = (i === this._gemType);
        }
        if (!this._warnedFace && this._gemType >= 0 && !this.faces[this._gemType]) {
            this._warnedFace = true;   // misalignment guard: the selected type has no face node (would show nothing)
            console.warn(`[ColumnCube] no face node for type ${this._gemType} (faces[${this._gemType}] is empty) — check the faces array order/size against RuneKind`);
        }
    }

    // ── spawn / slide animations (kept on SEPARATE tween refs, never stopAllByTarget, so a slide while a
    //    spawn-pop is still running doesn't freeze the scale — they animate different properties) ──
    private _spawnTween: Tween<Node> | null = null;
    private _slideTween: Tween<Node> | null = null;

    /**
     * Surface-pop: the cube breaches up from the base and bounces in like a bubble — scale 0 → wide/flat
     * breach → tall overshoot → settle. Scale only; the cube's slot position is owned by the Column.
     * Captures the node's CURRENT scale as the target, so call AFTER the cube is in place.
     */
    playSpawn(): void {
        const target = this.node.scale.clone();
        this._spawnTween?.stop();
        this.node.setScale(target.x * 0.05, target.y * 0.05, target.z);

        const breach = new Vec3(target.x * 1.18, target.y * 0.86, target.z);   // wide & flat as it pops out
        const stretch = new Vec3(target.x * 0.94, target.y * 1.08, target.z);  // overshoot tall
        this._spawnTween = tween(this.node)
            .to(0.20, { scale: breach }, { easing: 'backOut' })
            .to(0.10, { scale: stretch }, { easing: 'quadOut' })
            .to(0.10, { scale: target }, { easing: 'quadOut' })
            .start();
    }

    /** Slide the cube to a slot position (used when a new cube pushes the stack up). Position only. */
    slideTo(x: number, y: number, time: number): void {
        this._slideTween?.stop();
        this._slideTween = tween(this.node)
            .to(time, { position: new Vec3(x, y, 0) }, { easing: 'backOut' })
            .start();
    }

    /** Tint the whole cube (every sprite in the subtree — a runtime colour, like opacity); pass white to clear. */
    setTint(color: Color): void {
        const sprites = this.getComponentsInChildren(Sprite);
        for (let i = 0; i < sprites.length; i++) sprites[i].color = color;
    }

    // ── white flash (drives the SpriteFlash material on the face sprites; mirrors Rune.flashWhite) ──
    private _flashMats: Material[] = [];
    private _flashGathered = false;
    private readonly _flashColor = new Color(255, 255, 255, 0);   // .rgb = flash colour, .a = amount
    private readonly _flashT = { v: 0 };
    private _flashTween: Tween<{ v: number }> | null = null;

    /** Ramp the flash amount from its current value to `amount` over `time` (one-way, holds at `amount`). */
    flashTo(color: Color, amount: number, time: number): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        this._flashColor.set(color.r, color.g, color.b, 0);
        this._flashTween?.stop();
        const apply = (): void => this._setFlash(this._flashT.v);
        this._flashTween = tween(this._flashT).to(time, { v: amount }, { easing: 'quadOut', onUpdate: apply }).start();
    }

    /** Drive the flash amount NOW (no tween) — e.g. a quick white pop when a star strikes the cube. */
    setFlash(color: Color, amount: number): void {
        this._gatherFlashMats();
        if (!this._flashMats.length) return;
        if (this._flashTween) { this._flashTween.stop(); this._flashTween = null; }
        this._flashColor.set(color.r, color.g, color.b, 0);
        this._flashT.v = amount;
        this._setFlash(amount);
    }

    /** Cancel any flash and restore the cube to normal. */
    clearFlash(): void {
        this._flashTween?.stop(); this._flashTween = null;
        this._flashT.v = 0; this._setFlash(0);
    }

    private _gatherFlashMats(): void {
        if (this._flashGathered) return;
        this._flashGathered = true;
        const sprites = this.getComponentsInChildren(Sprite);
        for (let i = 0; i < sprites.length; i++) {
            const m = sprites[i].getMaterialInstance(0);
            if (m) this._flashMats.push(m);
        }
    }

    private _setFlash(v: number): void {
        this._flashColor.a = Math.round(Math.max(0, Math.min(1, v)) * 255);
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('flashColor', this._flashColor);
    }
}
