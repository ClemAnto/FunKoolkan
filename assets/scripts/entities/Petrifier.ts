import { _decorator, Component, RigidBody2D, ERigidBody2DType } from 'cc';
import { House } from './House';
import { ArenaBounds } from './ArenaBounds';
import { Stone } from './Stone';
import { GameMode } from '../config/GameMode';

const { ccclass, property, disallowMultiple, menu } = _decorator;

const FALLBACK_RESTITUTION = 1;   // wall bounce used if no ArenaBounds is found on the node

/**
 * Petrifier — the self-punishment director. Authored in the EDITOR on the Arena node (sibling of House and
 * CurlingScorer); assign the `house` (the geometry authority) or leave it empty to auto-grab from this node.
 *
 * A rune that is left at REST OUTSIDE the house turns to stone: an immovable Static obstacle that blocks the
 * slide of future runes and crowds the arena toward overflow. This is the missing penalty — in an open
 * physics arena a stray rune is otherwise just pushed around and ignored; petrification converts it into
 * terrain, the way a misplaced piece stays on the board in Puzzle Bobble / Tetris. The house is the SAFE
 * zone (a rune inside it never petrifies → there is a positive reason to aim there and a cost for missing).
 *
 * Each frame it scans live stones: a Dynamic body below restSpeed and outside the house accrues a dwell
 * timer; entering the last warnLead seconds it starts a warning throb (so the player can still save it);
 * at petrifyDelay it sets. Dragged (Kinematic) or already-locked (Static) bodies are exempt, so a stone in
 * an EDIT drag or mid-curling-sequence is never petrified out from under those systems.
 */
@ccclass('Petrifier')
@disallowMultiple
@menu('Arena/Petrifier')
export class Petrifier extends Component {
    @property({ type: House, tooltip: 'The House (geometry authority) — stones inside the HOUSE never petrify. Leave empty to auto-grab from this node.' })
    house: House | null = null;

    @property({ tooltip: 'A stone counts as "at rest" when its speed drops below this (physics units/s). Keep it small — near-parked.' })
    restSpeed = 4;

    @property({ tooltip: 'Seconds a rune must stay at rest OUTSIDE the house before it petrifies into an obstacle. The grace window.' })
    petrifyDelay = 2.5;

    @property({ tooltip: 'Seconds before petrifying that the rune starts the warning throb, so the player can still save it. Must be < petrifyDelay.' })
    warnLead = 1.0;

    private _bounds: ArenaBounds | null = null;

    onLoad(): void {
        // Convenience: House and ArenaBounds both live on the Arena node — grab them so no extra wiring is needed.
        if (!this.house) this.house = this.getComponent(House);
        this._bounds = this.getComponent(ArenaBounds);   // its wall restitution → petrified stones bounce the same
    }

    update(dt: number): void {
        if (GameMode.stickyPrototype) return;   // sticky-blob prototype: no petrification
        if (!this.house) return;
        const maxSqr = this.restSpeed * this.restSpeed;
        const warnAt = this.petrifyDelay - this.warnLead;
        const stones = Stone.all;
        for (let i = 0; i < stones.length; i++) {
            const s = stones[i];
            if (!s.node?.isValid || s.petrified) continue;

            const rb = s.getComponent(RigidBody2D);
            const dynamic = !!rb && rb.type === ERigidBody2DType.Dynamic;   // dragged (Kinematic) / locked (Static) → exempt
            const v = dynamic ? rb!.linearVelocity : null;
            const atRest = !!v && v.x * v.x + v.y * v.y <= maxSqr;
            // Inside the house is the safe working/scoring zone — never petrifies, however long it rests.
            const exposed = atRest && !this.house.isInHouse(s);

            if (!exposed) {
                if (s.petrifyDwell > 0) { s.petrifyDwell = 0; s.clearPetrifyWarning(); }   // moved / entered house → reset
                continue;
            }

            const prev = s.petrifyDwell;
            s.petrifyDwell += dt;
            if (prev < warnAt && s.petrifyDwell >= warnAt) s.warnPetrify();                 // entered the warning window
            if (s.petrifyDwell >= this.petrifyDelay) {                                       // set into stone
                s.petrify(this._bounds?.restitution ?? FALLBACK_RESTITUTION);               // crisp bounce = the arena borders
            }
        }
    }
}
