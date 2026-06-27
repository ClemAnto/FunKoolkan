import { _decorator, Component, Vec3, Color, RigidBody2D, UIOpacity, tween } from 'cc';
import { Stone } from './Stone';
import { Glue } from './Glue';
import { ManaLightning } from './ManaLightning';

const { ccclass } = _decorator;

const HOP_STEP = 0.09;       // s the shock takes to jump from one rune to the next (the chain spreads outward)
const AB_DELAY = 0.16;       // s from a rune being struck to it shattering (the bolt's travel/impact)
const NEIGHBOUR_GAP = 0.6;   // a rune is a neighbour if its edge-to-edge gap is under this × the current rune's radius (glued ≈ touching)
const ARM_SPEED = 25;        // it must have actually flown (above this) before a settle can fire
const REST_SPEED = 12;       // settled once the body's speed stays under this…
const REST_DELAY = 0.18;     // …for this long (s) — the rune has come to rest in the blob
const MAX_WAIT = 1.8;        // safety: trigger anyway this long after arming, even if the blob keeps it jiggling
const FADE_TIME = 0.4;       // fizzle: fade the overpower rune out over this (s) when it lands off-colour
const SHOCK_FLASH = new Color(255, 255, 255, 255);   // white wash as the shock reaches each rune

/** One step of the chain: a bolt from `fromPos` (the rune that passes the shock on) to `target`, fired at `time`
 *  seconds into the cascade. `fromPos` is null for the root (the overpower rune itself — it has no incoming bolt). */
interface Hop { fromPos: Vec3 | null; toPos: Vec3; target: Stone; time: number; }

/**
 * OVERPOWER shot (GameMode.stickyPrototype) — the launcher's overcharge spawns this ALONGSIDE a normal Glue
 * (Stone.spawn adds both): so it flies in and STICKS to the blob like any rune, compacting into it. Then, the
 * moment it has come to REST, it "activates": if it is touching at least one rune of its OWN colour it detonates
 * the whole CONTIGUOUS same-colour cluster; if it landed where no same-colour rune touches it, it simply FIZZLES
 * (fades out), no explosion. It never becomes a star.
 *
 * The detonation is a CHAIN, not a fan-out: the shock starts at the overpower rune and PROPAGATES rune→rune
 * outward (BFS over same-colour neighbours), each hop a ManaLightning bolt from the rune that carries the shock
 * to the next one, scattered in time by depth. Each rune shatters just after the bolt reaches it.
 */
@ccclass('Overpower')
export class Overpower extends Component {
    /** Collider radius in ground px (set at spawn). */
    radius = 24;
    private _done = false;
    private _armed = false;       // has actually flown (so a settle isn't detected at spawn)
    private _restDwell = 0;       // time spent below REST_SPEED
    private _sinceArmed = 0;      // time since arming (the MAX_WAIT safety)
    private _rb: RigidBody2D | null = null;

    update(dt: number): void {
        if (this._done) return;
        if (!this._rb) this._rb = this.getComponent(RigidBody2D);
        if (!this._rb) return;
        const v = this._rb.linearVelocity, sp2 = v.x * v.x + v.y * v.y;
        if (sp2 > ARM_SPEED * ARM_SPEED) { this._armed = true; this._restDwell = 0; }
        if (!this._armed) return;
        this._sinceArmed += dt;
        this._restDwell = sp2 < REST_SPEED * REST_SPEED ? this._restDwell + dt : 0;
        if (this._restDwell >= REST_DELAY || this._sinceArmed >= MAX_WAIT) this._settle();
    }

    /** Come to rest: detonate the own-colour cluster (as a chain) if one is touching, else fizzle. */
    private _settle(): void {
        this._done = true;
        const type = this.getComponent(Glue)?.gemType ?? -1;
        const chain = this._buildChain(type);          // BFS from this rune, root first then outward
        if (chain.length > 1) this._detonate(chain);   // at least one same-colour rune is touching → boom
        else this._fizzle();                            // landed off-colour → fade away, no explosion
    }

    /** BFS the same-colour cluster from this overpower rune, recording each hop: which rune passes the shock to
     *  which, and WHEN (depth × HOP_STEP). World positions are captured NOW (the blob is at rest) so a bolt stays
     *  correct even once its source rune has already shattered. */
    private _buildChain(type: number): Hop[] {
        const self = this.getComponent(Stone);
        if (!self) return [];
        const all = Stone.all;
        const selfPos = (self.viewNode?.isValid ? self.viewNode : self.node).worldPosition.clone();
        const chain: Hop[] = [{ fromPos: null, toPos: selfPos, target: self, time: 0 }];
        const seen = new Set<Stone>([self]);
        const queue: { stone: Stone; pos: Vec3; time: number }[] = [{ stone: self, pos: selfPos, time: 0 }];
        while (queue.length) {
            const cur = queue.shift()!;
            if (!cur.stone.node?.isValid) continue;
            const cp = cur.stone.node.position, maxGap = cur.stone.radius * NEIGHBOUR_GAP;
            for (let i = 0; i < all.length; i++) {
                const s = all[i];
                if (seen.has(s) || !s.node?.isValid) continue;
                if (s.getComponent(Glue)?.gemType !== type) continue;
                const gap = Math.hypot(s.node.position.x - cp.x, s.node.position.y - cp.y) - cur.stone.radius - s.radius;
                if (gap >= maxGap) continue;
                seen.add(s);
                const time = cur.time + HOP_STEP, pos = (s.viewNode?.isValid ? s.viewNode : s.node).worldPosition.clone();
                chain.push({ fromPos: cur.pos, toPos: pos, target: s, time });   // bolt: this rune → its neighbour
                queue.push({ stone: s, pos, time });
            }
        }
        return chain;
    }

    /** Play the chain: at each hop fire the bolt from its source rune to the struck rune, flash it white, then
     *  shatter it a beat later. The overpower rune (root) has no incoming bolt — it just flashes and pops. No star. */
    private _detonate(chain: Hop[]): void {
        const lit = ManaLightning.instance;
        for (let i = 0; i < chain.length; i++) {
            const hop = chain[i];
            this.scheduleOnce(() => {
                if (hop.fromPos && lit?.isValid) lit.strike(hop.fromPos, hop.toPos);
                if (hop.target.isValid) hop.target.flashWhite(SHOCK_FLASH, 0.8, 0.08);
                this.scheduleOnce(() => { if (hop.target.isValid) hop.target.shatter(); }, AB_DELAY);
            }, hop.time);
        }
    }

    /** Fizzle: the overpower landed where no same-colour rune touches it → fade out gently and vanish (no boom). */
    private _fizzle(): void {
        const view = this.getComponent(Stone)?.viewNode;
        if (!view?.isValid) { if (this.node?.isValid) this.node.destroy(); return; }
        const op = view.getComponent(UIOpacity) ?? view.addComponent(UIOpacity);
        tween(op).to(FADE_TIME, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (this.node?.isValid) this.node.destroy(); }).start();
    }
}
