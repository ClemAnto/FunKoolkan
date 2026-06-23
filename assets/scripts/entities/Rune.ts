import { _decorator, Component, Node, Sprite, Color, Enum } from 'cc';
import { RuneKind } from '../config/RuneTypes';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * Component on the Rune prefab root. Exposes the inner nodes the launcher/Stone drive:
 *  - rotationNode: spins with the physics body (assign the "rotation" node).
 *  - gems: the gem nodes INDEXED BY TYPE — gems[gemType] is shown, the rest hidden. The type id (0..5)
 *    is the universal key in the game (RUNES, RuneKind, Glue.gemType, scoring), and RuneKind's values ARE
 *    these indices, so `gemType` doubles as the index into `gems` — they are not two separate selections.
 *  - gemType: the rune's colour/type — pickable in the editor (a dropdown of RuneKind). Authors a rune
 *    with a preset colour; the launcher/Stone override it at runtime via setType().
 * Wired in the prefab editor — never resolved by name. @executeInEditMode so picking gemType previews live.
 */
@ccclass('Rune')
@executeInEditMode
export class Rune extends Component {
    @property({ type: Node, tooltip: 'Node (under gem) that spins with the physics body — assign the "rotation" node.' })
    rotationNode: Node | null = null;

    @property({ type: [Node], tooltip: 'Gem nodes INDEXED BY TYPE: gems[gemType] is shown. Author one per type in RuneKind order (gems[0]=Green, gems[1]=Yellow, …).' })
    gems: Node[] = [];

    @property({ visible: false })
    private _gemType = 0;   // serialized backing for gemType — a RuneKind id, AND the index into gems

    @property({ type: Enum(RuneKind), tooltip: 'Colour/type of this rune — picks which gem shows (gems[gemType]). Set it to author a rune; the launcher overrides it at runtime via setType().' })
    get gemType(): RuneKind { return this._gemType as RuneKind; }
    set gemType(v: RuneKind) { this.setType(v); }

    /** Current gem type (alias of gemType, for callers using `type`). */
    get type(): number { return this._gemType; }

    private _warnedGem = false;

    onLoad(): void { this._applyGems(); }   // apply the authored/serialized type (runtime + editor preview)

    /** Show the gem for type t (gems[t]), hide the others. */
    setType(t: number): void {
        this._gemType = t;
        this._applyGems();
    }

    private _applyGems(): void {
        for (let i = 0; i < this.gems.length; i++) {
            if (this.gems[i]) this.gems[i].active = (i === this._gemType);
        }
        if (!this._warnedGem && this._gemType >= 0 && !this.gems[this._gemType]) {
            this._warnedGem = true;   // misalignment guard: the selected type has no gem node (would show nothing)
            console.warn(`[Rune] no gem node for type ${this._gemType} (gems[${this._gemType}] is empty) — check the gems array order/size against RuneKind`);
        }
    }

    /** Tint the whole rune (every sprite in the subtree — a runtime colour, like opacity) — e.g. red while a
     *  shot is charged to a bomb; pass white to clear. */
    setTint(color: Color): void {
        const sprites = this.getComponentsInChildren(Sprite);
        for (let i = 0; i < sprites.length; i++) sprites[i].color = color;
    }
}
