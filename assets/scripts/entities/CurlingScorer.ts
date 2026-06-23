import { _decorator, Component, Node, Vec3, RigidBody2D, ERigidBody2DType } from 'cc';
import { House } from './House';
import { ManaDischarge } from './ManaDischarge';
import { Stone } from './Stone';
import { Glue } from './Glue';

const { ccclass, property, disallowMultiple, menu } = _decorator;

const _from = new Vec3();   // reused scratch for the TEE-stone's on-screen position

/**
 * CurlingScorer — the curling trigger. Authored in the EDITOR on the Arena node; assign the `house`
 * (zones) and the `discharge` (VFX). When a stone comes to REST on the TEE, it fires a ManaDischarge from
 * that stone to every OTHER stone of the SAME type currently touching the HOUSE — the mana circuit firing.
 *
 * It reads which stones are in each zone from House (the geometry authority) and the stone's type from its
 * Glue component. It fires once per tee occupancy (re-arms when the tee clears). Turning the zapped stones
 * into projectiles / scoring / removing them is the next step.
 */
@ccclass('CurlingScorer')
@disallowMultiple
@menu('Arena/CurlingScorer')
export class CurlingScorer extends Component {
    @property({ type: House, tooltip: 'The House (HOUSE + TEE zones) — tells which stones are in each zone.' })
    house: House | null = null;

    @property({ type: ManaDischarge, tooltip: 'The discharge VFX fired from the TEE stone to each matching stone.' })
    discharge: ManaDischarge | null = null;

    @property({ tooltip: 'A stone on the TEE counts as "stopped" when its speed drops below this (physics units/s). Keep it small — it should be near-zero, i.e. actually parked.' })
    restSpeed = 8;

    @property({ tooltip: 'It must stay stopped on the TEE for this long (s) before firing — so a stone merely gliding across the tee does not trigger.' })
    restDelay = 0.15;

    private _served: Node | null = null;            // tee stone already zapped (one-shot until the tee clears)
    private _candidate: Node | null = null;         // stone currently settling on the tee
    private _dwell = 0;                             // how long the candidate has stayed stopped on the tee
    private readonly _onTee: Stone[] = [];
    private readonly _inHouse: Stone[] = [];

    onLoad(): void {
        // Convenience: if this sits on the same node as House (the Arena), grab it automatically so the
        // `house` slot can be left empty. NOTE: the House COMPONENT lives on the Arena node — the child
        // node also named "House" only holds the sprites, so dragging that one into the slot won't work.
        if (!this.house) this.house = this.getComponent(House);
    }

    update(dt: number): void {
        if (!this.house || !this.discharge) return;
        this.house.collectStonesOnTee(this._onTee);

        // A stone triggers only once it has actually PARKED on the tee: a DYNAMIC body (a stone being
        // dragged in EDIT mode is Kinematic → ignored, so a drag never fires), with speed below restSpeed,
        // sustained for restDelay seconds. So it fires when a launched stone comes to rest there, and when
        // an edit-mode drop settles (the released body is Dynamic at rest) — never while it glides across.
        let cand: Stone | null = null;
        const maxSqr = this.restSpeed * this.restSpeed;
        for (let i = 0; i < this._onTee.length; i++) {
            const s = this._onTee[i];
            const rb = s.getComponent(RigidBody2D);
            if (!rb || rb.type !== ERigidBody2DType.Dynamic) continue;   // dragged (Kinematic) / static → not at rest
            const v = rb.linearVelocity;
            if (v.x * v.x + v.y * v.y <= maxSqr) { cand = s; break; }
        }
        if (!cand) { this._candidate = null; this._dwell = 0; this._served = null; return; }   // tee free → re-arm

        if (cand.node !== this._candidate) { this._candidate = cand.node; this._dwell = 0; }    // a new stone settling
        else this._dwell += dt;

        if (this._dwell >= this.restDelay && cand.node !== this._served) {
            this._served = cand.node;
            this._discharge(cand);
        }
    }

    /** Zap every same-type stone touching the HOUSE from the resting TEE stone. */
    private _discharge(tee: Stone): void {
        const type = tee.getComponent(Glue)?.gemType;
        if (type === undefined) return;                  // bombs / typeless stones don't form a circuit
        Vec3.copy(_from, (tee.viewNode ?? tee.node).worldPosition);

        this.house!.collectStonesInHouse(this._inHouse);
        for (let i = 0; i < this._inHouse.length; i++) {
            const s = this._inHouse[i];
            if (s === tee) continue;
            if (s.getComponent(Glue)?.gemType !== type) continue;
            this.discharge!.strike(_from, (s.viewNode ?? s.node).worldPosition);
        }
        // TODO(curling): turn the zapped stones into projectiles toward Koolkan (the TEE stone last),
        // award score, then remove them. For now this only plays the discharges.
    }
}
