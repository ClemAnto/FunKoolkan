import { _decorator, Component, Node, Sprite, Color, Enum, Material, Vec3, tween, Tween, Prefab, instantiate, ParticleSystem2D, resources } from 'cc';
import { EDITOR } from 'cc/env';
import { RuneKind } from '../config/RuneTypes';

const { ccclass, property, executeInEditMode } = _decorator;

// ── HP / combat (GDD v0.4): a column cube takes HP_MAX hits from same-type RaisingStars, then explodes. ──
const HP_MAX = 3;                                       // hits a cube survives before it shatters
const HIT_WHITE = new Color(255, 255, 255, 255);        // flash colour on a (non-killing) hit
const FX_EXPLODE = 'prefabs/SparkBurst';                // shatter VFX, loaded from resources/ (same prefab the Aku death uses)

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

    // ── HP + RaisingStar targeting (runtime) ──────────────────────────────────────────────────────────
    private _hp = HP_MAX;            // remaining hits before the cube shatters
    private _reserved = 0;           // stars already in flight toward this cube → others spread to the next one
    private _exploding = false;      // shattering → no longer a valid target / takes no more hits
    private readonly _baseScale = new Vec3(1, 1, 1);   // authored resting scale (hit bounce + shatter pop animate around it)

    /** Set by the owning Column — called when this cube shatters so the column can collapse the gap above it. */
    onRemoved: (() => void) | null = null;

    /** Live registry (runtime only) — RaisingStar reads it to find the topmost cube of a given type. */
    private static _all: ColumnCube[] = [];
    static get all(): readonly ColumnCube[] { return ColumnCube._all; }

    // Shatter VFX prefab, loaded once from resources/ (no per-cube @property). undefined = not requested,
    // null = loading/failed, Prefab = ready. Returns the prefab if loaded, else kicks off the async load.
    private static _fx: Prefab | null | undefined = undefined;
    private static _fxLoad(): Prefab | null {
        if (ColumnCube._fx !== undefined) return ColumnCube._fx;
        ColumnCube._fx = null;
        resources.load(FX_EXPLODE, Prefab, (err, p) => { ColumnCube._fx = err ? null : p; });
        return null;
    }

    onEnable(): void { if (!EDITOR) ColumnCube._all.push(this); }
    onDisable(): void { if (EDITOR) return; const i = ColumnCube._all.indexOf(this); if (i >= 0) ColumnCube._all.splice(i, 1); }

    onLoad(): void {
        this._baseScale.set(this.node.scale);   // capture the authored scale for the hit bounce / shatter pop
        if (!EDITOR) ColumnCube._fxLoad();       // warm the shatter VFX prefab
        this._applyFaces();                      // apply the authored/serialized type (runtime + editor preview)
    }

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

    // ── HP / RaisingStar combat ───────────────────────────────────────────────────────────────────────
    private _hitTween: Tween<Node> | null = null;
    private _shatterTween: Tween<Node> | null = null;

    /** Remaining hits before the cube shatters. */
    get hp(): number { return this._hp; }

    /** True once the cube is shattering (popping out + about to be destroyed) — no longer a place to stand on. */
    get exploding(): boolean { return this._exploding; }

    /** Can a same-type star still aim here? Alive (not shattering) and not already fully reserved by stars in
     *  flight (so a cluster of stars spreads across cubes instead of overkilling one). */
    get targetable(): boolean { return !this._exploding && this._hp - this._reserved > 0; }

    /** A star has committed to this cube — reserve one of its remaining HP so other stars pick another cube. */
    reserve(): void { this._reserved++; }
    /** Release a reservation without dealing damage (the star died/fizzled before reaching the cube). */
    release(): void { if (this._reserved > 0) this._reserved--; }

    /** World position of the CENTRE of the player-facing marked face (faces[gemType] — the symbol, sitting low
     *  on the front of the stone toward the player). The point a RaisingStar slams into. Falls back to the cube
     *  node's own position if no face is shown. Pass `out` to avoid an allocation. */
    faceCenterWorld(out?: Vec3): Vec3 {
        const face = this.faces[this._gemType];
        const n = (face && face.isValid) ? face : this.node;
        return out ? Vec3.copy(out, n.worldPosition) : n.worldPosition.clone();
    }

    /** A reserved RaisingStar landed: consume the reservation, lose 1 HP — a small white flash + bounce — and
     *  SHATTER (explode + vanish) once HP hits 0. */
    applyHit(): void {
        if (this._exploding) return;
        if (this._reserved > 0) this._reserved--;
        this._hp--;
        if (this._hp <= 0) { this._shatter(); return; }
        this._flashHit();
        this._bounce();
    }

    /** Quick white flash on a non-killing hit: pop the flash amount up, then fade it back to normal. */
    private _flashHit(): void {
        this.setFlash(HIT_WHITE, 0.85);
        this.flashTo(HIT_WHITE, 0, 0.25);
    }

    /** Small squash-and-stretch bounce around the resting scale on a non-killing hit. */
    private _bounce(): void {
        const b = this._baseScale;
        this._hitTween?.stop();
        this.node.setScale(b);
        this._hitTween = tween(this.node)
            .to(0.06, { scale: new Vec3(b.x * 1.15, b.y * 0.82, b.z) }, { easing: 'quadOut' })
            .to(0.24, { scale: b.clone() }, { easing: 'elasticOut' })
            .start();
    }

    /** HP reached 0: pop a spark burst, swell then collapse to nothing, and destroy the node. */
    private _shatter(): void {
        this._exploding = true;
        this._reserved = 0;
        this.onRemoved?.();   // tell the column to collapse the cubes above into the gap
        this._hitTween?.stop(); this._spawnTween?.stop(); this._slideTween?.stop();
        this._spawnBurst();
        this.setFlash(HIT_WHITE, 1);
        const b = this._baseScale;
        this._shatterTween = tween(this.node)
            .to(0.07, { scale: new Vec3(b.x * 1.35, b.y * 1.35, b.z) }, { easing: 'backOut' })
            .to(0.13, { scale: new Vec3(0, 0, b.z) }, { easing: 'backIn' })
            .call(() => { if (this.node?.isValid) this.node.destroy(); })
            .start();
    }

    /** Instantiate the shatter spark burst (loaded from resources) at the cube's position, as a sibling so it
     *  outlives the cube. Additive blend is authored on the prefab — editor-first; self-removes when finished. */
    private _spawnBurst(): void {
        const prefab = ColumnCube._fxLoad(), parent = this.node?.parent;
        if (!prefab || !parent?.isValid) return;
        const n = instantiate(prefab) as unknown as Node;
        n.layer = this.node.layer;
        n.setParent(parent);
        n.setWorldPosition(this.node.worldPosition);
        const ps = n.getComponent(ParticleSystem2D) ?? n.getComponentInChildren(ParticleSystem2D);
        if (ps) { ps.autoRemoveOnFinish = true; ps.resetSystem(); }
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
            // Only keep materials that actually expose `flashColor` (the SpriteFlash effect) — a plain sprite
            // material has no such uniform, so setProperty() would warn "illegal property name" every frame.
            if (m && m.passes[0]?.getHandle('flashColor')) this._flashMats.push(m);
        }
    }

    private _setFlash(v: number): void {
        this._flashColor.a = Math.round(Math.max(0, Math.min(1, v)) * 255);
        for (let i = 0; i < this._flashMats.length; i++) this._flashMats[i].setProperty('flashColor', this._flashColor);
    }
}
