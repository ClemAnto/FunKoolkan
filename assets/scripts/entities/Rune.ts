import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Component on the Rune prefab root. Exposes the inner nodes the launcher/Stone drive:
 *  - rotationNode: spins with the physics body (assign the "rotation" node).
 *  - gems: one gem node per type, in order; setType(t) shows gems[t] and hides the rest.
 * Wired in the prefab editor — never resolved by name.
 */
@ccclass('Rune')
export class Rune extends Component {
    @property({ type: Node, tooltip: 'Node (under gem) that spins with the physics body — assign the "rotation" node.' })
    rotationNode: Node | null = null;

    @property({ type: [Node], tooltip: 'Gem nodes, one per type, in order (0, 1, …). Only the type\'s gem is shown.' })
    gems: Node[] = [];

    private _type = -1;
    get type(): number { return this._type; }

    /** Show the gem for type t, hide the others. */
    setType(t: number): void {
        this._type = t;
        for (let i = 0; i < this.gems.length; i++) {
            if (this.gems[i]) this.gems[i].active = (i === t);
        }
    }
}
