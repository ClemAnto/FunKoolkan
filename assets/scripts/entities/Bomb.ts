import { _decorator, Component, RigidBody2D } from 'cc';
import { Stone } from './Stone';
import { StoneExplosion } from './StoneExplosion';

const { ccclass } = _decorator;

const STOP_SPEED = 6;    // ground units/s: at/below this the bomb has come to rest → detonate
const ARM_SPEED = 25;    // it must have actually been flying (above this) before a "stopped" detonation can fire

/**
 * Bomb powerup — a rune fired at MAX charge becomes a bomb (added by Stone.spawn instead of Glue). It flies
 * as a normal stone (it does NOT glue) and EXPLODES either the moment it touches another Stone OR once it
 * comes to rest. The blast destroys every Stone whose centre is within 2× its radius (itself included).
 * Pure gameplay — no VFX yet.
 */
@ccclass('Bomb')
export class Bomb extends Component {
    /** Collider radius in ground px (set at spawn); the blast reaches 2× this. */
    radius = 24;
    private _done = false;
    private _armed = false;
    private _rb: RigidBody2D | null = null;

    update(): void {
        if (this._done) return;
        const p = this.node.position, all = Stone.all;
        // 1. touched another stone → boom
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (s.node === this.node || !s.node?.isValid) continue;
            const dx = s.node.position.x - p.x, dy = s.node.position.y - p.y;
            const touch = this.radius + s.radius;
            if (dx * dx + dy * dy <= touch * touch) { this._explode(); return; }
        }
        // 2. came to rest (after actually flying) → boom (no inert duds left lying around)
        if (!this._rb) this._rb = this.getComponent(RigidBody2D);
        if (this._rb) {
            const v = this._rb.linearVelocity, sp2 = v.x * v.x + v.y * v.y;
            if (sp2 > ARM_SPEED * ARM_SPEED) this._armed = true;
            else if (this._armed && sp2 < STOP_SPEED * STOP_SPEED) { this._explode(); return; }
        }
    }

    /** Destroy every Stone (incl. self) whose centre is within 2× the bomb radius. */
    private _explode(): void {
        this._done = true;
        const p = this.node.position, r = 2 * this.radius, r2 = r * r, all = Stone.all;
        const victims: Stone[] = [];
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (!s.node?.isValid) continue;
            const dx = s.node.position.x - p.x, dy = s.node.position.y - p.y;
            if (dx * dx + dy * dy <= r2) victims.push(s);
        }
        console.log(`[Bomb] exploded — ${victims.length} stones destroyed (blast radius ${r.toFixed(0)}px)`);
        for (let i = 0; i < victims.length; i++) {
            const s = victims[i], view = s.viewNode;
            if (view?.isValid) StoneExplosion.play(view.parent, view.worldPosition, view.worldScale);   // burst at the stone's on-screen spot
            if (s.node?.isValid) s.node.destroy();
        }
    }
}
