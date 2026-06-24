import { _decorator, Component, Node, Vec2, Color, RigidBody2D, ERigidBody2DType } from 'cc';
import { House } from './House';
import { ManaLightning } from './ManaLightning';
import { RaisingStar } from './RaisingStar';
import { Stone } from './Stone';
import { Glue } from './Glue';

const { ccclass, property, disallowMultiple, menu } = _decorator;

const STAGGER_JITTER = 0.5;   // random fraction of strikeStagger added per strike, so the cascade looks scattered
const RECOIL_AB_DELAY = 0.2;  // s between the source (A) recoil and the struck stone (B) recoil — the bolt's travel
const _zero = new Vec2(0, 0); // reused scratch to zero a body's velocity when locking it
const WHITE = new Color(255, 255, 255, 255);          // hit flash of the STRUCK stone B (full white)
const SOURCE_FLASH = new Color(220, 240, 255, 255);   // hit flash of the SOURCE/TEE stone A (cool white)

/**
 * CurlingScorer — the curling trigger. Authored in the EDITOR on the Arena node; assign the `house`
 * (zones) and the `discharge` (VFX). When a stone comes to REST on the TEE, it fires a ManaLightning from
 * that stone to every OTHER stone of the SAME type currently touching the HOUSE — the mana circuit firing.
 * (`discharge` is a ManaLightning — the property name is kept for the editor binding.)
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

    @property({ type: ManaLightning, tooltip: 'The ManaLightning VFX fired from the TEE stone to each matching stone.' })
    discharge: ManaLightning | null = null;

    @property({ type: RaisingStar, tooltip: 'The RaisingStar VFX: each struck stone (TEE stone last) leaps up and becomes a star that flies into Koolkan. Leave empty to fall back to a plain recoil nudge.' })
    raisingStar: RaisingStar | null = null;

    @property({ tooltip: 'A stone on the TEE counts as "stopped" when its speed drops below this (physics units/s). Keep it SMALL — near-zero, i.e. actually parked. Too high and a stone still gliding across the tee counts as stopped and fires early.' })
    restSpeed = 4;

    @property({ tooltip: 'It must stay below restSpeed on the TEE for this long (s) before firing — so a stone merely gliding across the tee does not trigger.' })
    restDelay = 0.2;

    @property({ tooltip: 'When several stones in the HOUSE match, their discharges start SCATTERED in time, not all on one frame: each fires this many seconds after the previous (plus a little random jitter). 0 = all at once.' })
    strikeStagger = 0.08;

    @property({ tooltip: 'Recoil nudge (px) of the VIEW when a discharge fires: the source lurches back, the struck stone lurches forward along the bolt, then both ease back. Pure animation — the bodies are locked. 0 = no nudge.' })
    recoilPixels = 8;

    private _served: Node | null = null;            // tee stone already zapped (one-shot until the tee clears)
    private _candidate: Node | null = null;         // stone currently resting on the tee
    private _dwell = 0;                             // how long the candidate has stayed below restSpeed on the tee
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

        // The discharge fires when a stone is genuinely STOPPED on the tee: a DYNAMIC body (a stone being
        // dragged in EDIT mode is Kinematic → ignored, so a drag never fires) whose speed has dropped below
        // restSpeed and STAYS below it for restDelay seconds. A stone still gliding across the tee is above
        // restSpeed (so it is not picked, and never accrues dwell) → it does not fire until it actually rests.
        let cand: Stone | null = null;
        const maxSqr = this.restSpeed * this.restSpeed;
        for (let i = 0; i < this._onTee.length; i++) {
            const s = this._onTee[i];
            const rb = s.getComponent(RigidBody2D);
            if (!rb || rb.type !== ERigidBody2DType.Dynamic) continue;   // dragged (Kinematic) / static → not a resting launch
            const v = rb.linearVelocity;
            if (v.x * v.x + v.y * v.y <= maxSqr) { cand = s; break; }    // below the "stopped" speed → a rest candidate
        }
        if (!cand) { this._candidate = null; this._dwell = 0; this._served = null; return; }   // none resting → re-arm

        if (cand.node !== this._candidate) { this._candidate = cand.node; this._dwell = 0; }    // a new stone settling
        else this._dwell += dt;                                                                 // same one, still stopped

        if (this._dwell >= this.restDelay && cand.node !== this._served) {
            this._served = cand.node;
            this._discharge(cand);
        }
    }

    /** Zap every same-type stone touching the HOUSE from the resting TEE stone. With several matches the
     *  discharges start SCATTERED in time (strikeStagger + jitter) instead of all firing on the same frame. */
    private _discharge(tee: Stone): void {
        const type = tee.getComponent(Glue)?.gemType;
        if (type === undefined) return;                  // bombs / typeless stones don't form a circuit
        const from = (tee.viewNode ?? tee.node).worldPosition.clone();   // stable copy — delayed strikes can't share a scratch
        this._lock(tee);                                 // the source is frozen too — impacts can't shove it

        this.house!.collectStonesInHouse(this._inHouse);
        let order = 0;                                   // index among the MATCHING stones (drives the stagger)
        let others = 0;                                  // ANY other stone touching the HOUSE (whatever its type)
        for (let i = 0; i < this._inHouse.length; i++) {
            const s = this._inHouse[i];
            if (s === tee) continue;
            others++;
            if (s.getComponent(Glue)?.gemType !== type) continue;
            this._lock(s);                               // every involved stone is physically locked for the sequence
            const to = (s.viewNode ?? s.node).worldPosition.clone();
            // Bolt direction on SCREEN — the nudge is a VIEW offset, so use screen space (not the physics plane).
            const sx = to.x - from.x, sy = to.y - from.y;
            const slen = Math.hypot(sx, sy) || 1;
            const fwdX = sx / slen, fwdY = sy / slen;    // toward the struck stone (the bolt's travel direction)
            const target = s;
            const fire = (): void => {
                if (!this.discharge?.isValid) return;
                this.discharge.strike(from, to);
                tee.nudge(-fwdX, -fwdY, this.recoilPixels);    // A (source) lurches BACK the moment the bolt leaves
                tee.flashWhite(SOURCE_FLASH, 0.5);             // …and flashes cool-white (gentle) as it discharges
                // B (struck) reacts RECOIL_AB_DELAY later, as the bolt reaches it: it flashes WHITE and becomes a
                // RaisingStar (pops & vanishes → sparkle → flies into Koolkan). No RaisingStar wired → recoil nudge.
                this.scheduleOnce(() => {
                    if (!target.isValid) return;
                    target.flashWhite(WHITE, 0.5);
                    if (this.raisingStar?.isValid) this.raisingStar.launch(target);
                    else target.nudge(fwdX, fwdY, this.recoilPixels);
                }, RECOIL_AB_DELAY);
            };
            const delay = order === 0 ? 0 : order * this.strikeStagger + Math.random() * this.strikeStagger * STAGGER_JITTER;
            if (delay <= 0) fire();
            else this.scheduleOnce(fire, delay);
            order++;
        }

        if (this.raisingStar?.isValid) {
            if (order > 0) {
                // A circuit fired: the TEE stone is the LAST projectile — it too becomes a star into Koolkan,
                // timed just after the last struck stone's launch (its fire delay + the bolt's travel + a beat).
                const teeDelay = order * this.strikeStagger + this.strikeStagger * STAGGER_JITTER + RECOIL_AB_DELAY + 0.2;
                this.scheduleOnce(() => { if (tee.isValid && this.raisingStar?.isValid) this.raisingStar.launch(tee); }, teeDelay);
            } else if (others === 0) {
                // The TEE stone rested ALONE on the house (nothing to zap) → it becomes a star right away.
                this.raisingStar.launch(tee);
            }
            // (others > 0 but none matching → no circuit; the stone stays, awaiting a same-type companion.)
        }
        // TODO(curling): award score for the consumed stones (and tune Koolkan's hit reaction / shield).
    }

    /** Freeze a stone's body (Static) so impacts can't move it while it is involved in the lightning. The
     *  recoil is a VIEW-only nudge (Stone.nudge), so a locked body still animates. */
    private _lock(stone: Stone): void {
        const rb = stone.node?.isValid ? stone.getComponent(RigidBody2D) : null;
        if (!rb || rb.type === ERigidBody2DType.Static) return;
        rb.linearVelocity = _zero;
        rb.angularVelocity = 0;
        rb.type = ERigidBody2DType.Static;
    }
}
