import { _decorator, Component, Node } from 'cc';

const { ccclass } = _decorator;

/**
 * Depth (Y) sort for a 1-point-perspective layer. Orders this node's children back-to-front by their
 * local Y so the stones and the pole sprites (dawn/sunset), which live as siblings in the same layer,
 * interleave correctly with depth: farther objects (higher on screen = larger Y) render BEHIND, nearer
 * ones (smaller Y) render in FRONT.
 *
 * Attach to the StoneLayer node (the container of the stone views + the pole nodes). Runs in lateUpdate
 * (after the stones have been re-projected for the frame). Re-orders only when the depth order actually
 * changes, so a settled board costs almost nothing.
 */
@ccclass('DepthSort')
export class DepthSort extends Component {
    private _order: Node[] = [];

    lateUpdate(): void {
        const kids = this.node.children;
        const n = kids.length;
        if (n < 2) return;

        this._order.length = 0;
        for (let i = 0; i < n; i++) this._order.push(kids[i]);
        // Largest Y first → farthest → lowest sibling index (rendered first = behind).
        this._order.sort((a, b) => b.position.y - a.position.y);

        let changed = false;
        for (let i = 0; i < n; i++) { if (kids[i] !== this._order[i]) { changed = true; break; } }
        if (!changed) return;

        for (let i = 0; i < n; i++) this._order[i].setSiblingIndex(i);
    }
}
