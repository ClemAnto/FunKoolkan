import { _decorator, Component, Node, Vec2, Color, RigidBody2D, ERigidBody2DType, tween } from 'cc';
import { House } from './House';
import { ManaLightning } from './ManaLightning';
import { RaisingStar } from './RaisingStar';
import { Stone } from './Stone';
import { Glue } from './Glue';

const { ccclass, property, disallowMultiple, menu } = _decorator;

const STAGGER_JITTER = 0.5;   // random fraction of strikeStagger added per strike, so the cascade looks scattered
const RECOIL_AB_DELAY = 0.2;  // s between the source (A) recoil and the struck stone (B) recoil — the bolt's travel
const CHAIN_REACH = 0.5;      // a shock jumps to a same-type stone whose edge-to-edge gap is under 1/4 of the
                              // shocking stone's DIAMETER (= its radius × this) — "almost touching" (GDD: chain outside the house)
const _zero = new Vec2(0, 0); // reused scratch to zero a body's velocity when locking it
const _bv = new Vec2();       // reused scratch for the per-frame braking velocity (set-then-assign, single frame)
const BRAKE_TIME = 0.4;       // s to ramp a locked body's velocity LINEARLY to exactly zero, then freeze Static
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

    @property({ type: RaisingStar, tooltip: 'The RaisingStar VFX: each struck stone (TEE stone last) leaps up and becomes a star that flies into the topmost same-type column cube. Leave empty to fall back to a plain recoil nudge.' })
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

    /** Zap every same-type stone touching the HOUSE from the resting TEE stone, then let the shock CHAIN
     *  outward: each struck stone passes it on to any same-type stone almost touching it (edge-to-edge gap
     *  under 1/4 of its diameter — GDD's "chain outside the house"). Discharges start SCATTERED in time
     *  (strikeStagger + jitter) instead of all firing on the same frame. */
    private _discharge(tee: Stone): void {
        const type = tee.getComponent(Glue)?.gemType;
        if (type === undefined) return;                  // bombs / typeless stones don't form a circuit
        this._lock(tee);                                 // the source is frozen too — impacts can't shove it

        const shocked = new Set<Stone>();                // every stone reached by the cascade (so none is zapped twice)
        shocked.add(tee);

        // 1. Direct fan-out: the tee zaps every same-type stone touching the HOUSE.
        this.house!.collectStonesInHouse(this._inHouse);
        let order = 0;                                   // running index across the whole cascade (drives the stagger)
        let others = 0;                                  // ANY other stone touching the HOUSE (whatever its type)
        for (let i = 0; i < this._inHouse.length; i++) {
            const s = this._inHouse[i];
            if (s === tee) continue;
            others++;
            if (s.getComponent(Glue)?.gemType !== type || shocked.has(s)) continue;
            this._shock(tee, s, type, this._staggerDelay(order), shocked);
            order++;
        }

        // 2. The shock also chains from the tee itself to any same-type stone almost touching it — covers a
        //    tee with a near neighbour OUTSIDE the house (the house fan-out only reaches stones in the ring).
        order = this._propagate(tee, type, shocked, order);

        if (this.raisingStar?.isValid) {
            const hits = shocked.size - 1;               // stones shocked besides the tee
            if (hits > 0) {
                // A circuit fired: the TEE stone is the LAST projectile — it too becomes a star, timed just
                // after the rest (their stagger window + the bolt's travel + a beat).
                const teeDelay = hits * this.strikeStagger + this.strikeStagger * STAGGER_JITTER + RECOIL_AB_DELAY + 0.2;
                this.scheduleOnce(() => { if (tee.isValid && this.raisingStar?.isValid) this.raisingStar!.launch(tee, type); }, teeDelay);
            } else if (others === 0) {
                // The TEE stone rested ALONE on the house (nothing to zap) → it becomes a star right away.
                this.raisingStar.launch(tee, type);
            }
            // (others > 0 but none matching → no circuit; the stone stays, awaiting a same-type companion.)
        }
        // TODO(curling): award score for the consumed stones (and tune the column hit reaction).
    }

    /** Shock one stone from `source`: lock it, fire the bolt source→target (staggered by `delay`), then as the
     *  bolt lands the struck stone flashes white and becomes a RaisingStar (or recoils if none wired) AND passes
     *  the shock on to its own near same-type neighbours. `shocked` tracks the whole cascade so none is hit twice. */
    private _shock(source: Stone, target: Stone, type: number, delay: number, shocked: Set<Stone>): void {
        shocked.add(target);
        this._lock(target);                              // every involved stone is physically locked for the sequence
        const from = (source.viewNode ?? source.node).worldPosition.clone();   // stable copies — delayed strikes can't share a scratch
        const to = (target.viewNode ?? target.node).worldPosition.clone();
        // Bolt direction on SCREEN — the nudge is a VIEW offset, so use screen space (not the physics plane).
        const sx = to.x - from.x, sy = to.y - from.y;
        const slen = Math.hypot(sx, sy) || 1;
        const fwdX = sx / slen, fwdY = sy / slen;        // toward the struck stone (the bolt's travel direction)
        const fire = (): void => {
            if (!this.discharge?.isValid || !target.isValid) return;
            this.discharge.strike(from, to);
            if (source.isValid) {
                source.nudge(-fwdX, -fwdY, this.recoilPixels);   // A (source) lurches BACK the moment the bolt leaves
                source.flashWhite(SOURCE_FLASH, 0.5);            // …and flashes cool-white (gentle) as it discharges
            }
            // B (struck) reacts RECOIL_AB_DELAY later, as the bolt reaches it: it flashes WHITE, becomes a
            // RaisingStar (pops → sparkle → same-type column cube), and relays the shock to its near neighbours.
            this.scheduleOnce(() => {
                if (!target.isValid) return;
                // A PETRIFIED rune is the recovery valve: the discharge SHATTERS it (it can be hit) but the shock
                // DEAD-ENDS here — it does not become a star and does not propagate onward (a dead conductor).
                if (target.petrified) { target.shatter(); return; }
                target.flashWhite(WHITE, 0.8, 0.1);   // initial flash ramps gradually 0 → 0.8 over 0.1s
                if (this.raisingStar?.isValid) this.raisingStar.launch(target, type);
                else target.nudge(fwdX, fwdY, this.recoilPixels);
                this._propagate(target, type, shocked, 0);   // pass the shock on to almost-touching same-type stones
            }, RECOIL_AB_DELAY);
        };
        if (delay <= 0) fire();
        else this.scheduleOnce(fire, delay);
    }

    /** Relay the shock from `source` to every not-yet-shocked same-type stone whose edge-to-edge gap (ground
     *  space) is under CHAIN_REACH × the source's radius (= 1/4 of its diameter). Each gets its own staggered
     *  bolt; returns the next stagger index so the whole cascade keeps a single scattered timeline. */
    private _propagate(source: Stone, type: number, shocked: Set<Stone>, startOrder: number): number {
        if (!source.node?.isValid) return startOrder;
        const sp = source.node.position;                 // ground space (body is a child of the arena)
        const sr = source.radius;
        const maxGap = sr * CHAIN_REACH;                 // 1/4 of the source's diameter, edge-to-edge
        let order = startOrder;
        const stones = Stone.all;
        for (let i = 0; i < stones.length; i++) {
            const s = stones[i];
            if (s === source || shocked.has(s) || !s.node?.isValid) continue;
            if (s.getComponent(Glue)?.gemType !== type) continue;
            const p = s.node.position;
            const gap = Math.hypot(p.x - sp.x, p.y - sp.y) - sr - s.radius;   // surface-to-surface distance
            if (gap >= maxGap) continue;
            this._shock(source, s, type, this._staggerDelay(order), shocked);
            order++;
        }
        return order;
    }

    /** Stagger delay (s) for the Nth strike of the cascade: the first fires now, the rest scatter. */
    private _staggerDelay(order: number): number {
        return order <= 0 ? 0 : order * this.strikeStagger + Math.random() * this.strikeStagger * STAGGER_JITTER;
    }

    /** Freeze a stone's body so impacts can't move it while it is involved in the lightning. The recoil is a
     *  VIEW-only nudge (Stone.nudge), so a locked body still animates. We do NOT zero the velocity in one step
     *  (that reads as the stone "stopping dead" the instant the shock starts, especially a stone still gliding
     *  toward the tee or caught by the chain mid-glide). Instead we ramp its velocity LINEARLY to exactly zero
     *  over BRAKE_TIME — a constant deceleration that reads as a natural glide-to-stop — then freeze it Static
     *  (a no-op by then, since the velocity is already zero, so there is no snap). */
    private _lock(stone: Stone): void {
        const rb = stone.node?.isValid ? stone.getComponent(RigidBody2D) : null;
        if (!rb || rb.type === ERigidBody2DType.Static) return;
        const vx = rb.linearVelocity.x, vy = rb.linearVelocity.y, w = rb.angularVelocity;
        const ramp = { f: 1 };
        tween(ramp)
            .to(BRAKE_TIME, { f: 0 }, {                          // linear (no easing): constant deceleration
                onUpdate: () => {
                    if (!rb.isValid) return;
                    _bv.set(vx * ramp.f, vy * ramp.f);
                    rb.linearVelocity = _bv;
                    rb.angularVelocity = w * ramp.f;
                },
            })
            .call(() => {
                if (!rb.isValid || !stone.node?.isValid) return;
                rb.linearVelocity = _zero;
                rb.angularVelocity = 0;
                rb.type = ERigidBody2DType.Static;
            })
            .start();
    }
}
