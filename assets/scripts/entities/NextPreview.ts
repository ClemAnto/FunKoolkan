import { _decorator, Component, Node, Vec2, UITransform, CCFloat, Prefab, instantiate } from 'cc';
import { Rune } from './Rune';

const { ccclass, property } = _decorator;
const _hit = new Vec2();   // reused for the hit-test (no per-touch alloc)

/**
 * NEXT preview — shows the upcoming gem beside the launcher. Owns ONLY the preview rune and its
 * pop-out/pop-in animation. The QUEUE (which gem is current vs next) and the launch/swap INTERACTION
 * live in the coordinator (ArenaManager), which calls reload()/swapTo() and reads containsUIPoint().
 *
 * Attach this to the NEXT container node in the editor; the rune is instantiated as its child.
 */
@ccclass('NextPreview')
export class NextPreview extends Component {
    @property({ type: Prefab, tooltip: 'Rune prefab shown as the upcoming gem.' })
    runePrefab: Prefab | null = null;
    @property({ type: CCFloat, tooltip: 'Scale of the rune shown in the NEXT preview.' })
    previewScale = 0.4;
    @property({ type: CCFloat, tooltip: 'Duration (s) of each pop-out / pop-in.' })
    popDuration = 0.18;
    @property({ type: CCFloat, tooltip: 'Delay (s) after the pop-out before the new gem pops in (launch reload).' })
    refillDelay = 0.5;

    private _rune: Rune | null = null;
    private _animS = 1;                  // 0..1 scale multiplier during a pop
    private _phase: 0 | 1 | 2 | 3 = 0;   // 0 idle, 1 pop-out, 2 empty/waiting refill, 3 pop-in
    private _swap = false;               // true when the pop is a swap (no refill delay)
    private _refillT = 0;                // s left (after pop-out) before the new gem pops in
    private _pendingType = -1;           // gem type to reveal once the current gem has popped out

    /** True while a pop sequence is running (the coordinator uses it to gate a swap). */
    get isAnimating(): boolean { return this._phase !== 0; }

    /** Build the rune child (once) and pop the first gem in. */
    showInitial(type: number): void {
        this._build();
        this._rune?.setType(type);
        this._animS = 0; this._phase = 3;   // pop the first gem in
    }

    /** Launch reload: pop the current gem OUT → wait refillDelay → pop the new gem IN. */
    reload(newType: number): void {
        if (!this._rune?.isValid) { this.showInitial(newType); return; }
        this._pendingType = newType; this._swap = false; this._phase = 1;
    }

    /** Swap (tap on NEXT): pop OUT → pop the swapped gem straight back IN (no refill wait). */
    swapTo(newType: number): void {
        if (!this._rune?.isValid) { this.showInitial(newType); return; }
        this._pendingType = newType; this._swap = true; this._phase = 1;
    }

    /** True if a UI point falls inside this preview's box (used to route a tap to a swap). */
    containsUIPoint(uiX: number, uiY: number): boolean {
        const ut = this.getComponent(UITransform);
        if (!ut) return false;
        return ut.getBoundingBoxToWorld().contains(_hit.set(uiX, uiY));
    }

    /** Instantiate the rune as a child of this node (keeps any existing children, e.g. a frame). */
    private _build(): void {
        if (this._rune?.isValid || !this.runePrefab) return;
        const r = instantiate(this.runePrefab) as unknown as Node;
        r.setParent(this.node);
        r.setPosition(0, 0, 0);
        r.setScale(this.previewScale, this.previewScale, 1);
        this._rune = r.getComponent(Rune);
    }

    /** Ease-out-back 0→1 with a slight overshoot, for the pop-in. */
    private _popScale(t: number): number {
        if (t >= 1) return 1;
        const c1 = 1.70158, c3 = c1 + 1, x = t - 1;
        return 1 + c3 * x * x * x + c1 * x * x;
    }

    update(dt: number): void {
        const node = this._rune?.node;
        if (this._phase === 0 || !node?.isValid) return;
        const k = dt / Math.max(1e-3, this.popDuration);
        if (this._phase === 1) {                       // pop the current gem out (linear shrink)
            this._animS = Math.max(0, this._animS - k);
            const s = this.previewScale * this._animS;
            node.setScale(s, s, 1);
            if (this._animS <= 0) {
                if (this._swap) {                      // swap: no refill wait, pop the swapped gem straight back in
                    if (this._pendingType >= 0) { this._rune!.setType(this._pendingType); this._pendingType = -1; }
                    this._phase = 3;
                } else {                               // launch reload: NEXT empty → wait the refill, then pop the new gem in
                    this._refillT = this.refillDelay;
                    this._phase = 2;
                }
            }
        } else if (this._phase === 2) {                // empty, waiting to refill
            this._refillT -= dt;
            if (this._refillT <= 0) {
                if (this._pendingType >= 0) this._rune!.setType(this._pendingType);
                this._animS = 0; this._phase = 3;
            }
        } else {                                       // pop the new gem in (eased, overshoot)
            this._animS = Math.min(1, this._animS + k);
            const s = this.previewScale * this._popScale(this._animS);
            node.setScale(s, s, 1);
            if (this._animS >= 1) { this._phase = 0; this._swap = false; }
        }
    }
}
