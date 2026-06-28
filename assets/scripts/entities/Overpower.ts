import { _decorator, Component, Vec2, Vec3, Color, RigidBody2D, CircleCollider2D, Collider2D, Contact2DType, UIOpacity, tween } from 'cc';
import { Stone } from './Stone';
import { Glue } from './Glue';
import { ManaLightning } from './ManaLightning';
import { RaisingStar } from './RaisingStar';

const { ccclass } = _decorator;

const HOP_STEP = 0.09;       // s the shock takes to jump from one rune to the next (the chain spreads outward)
const AB_DELAY = 0.16;       // s from a rune being struck to it shattering (the bolt's travel/impact)
const NEIGHBOUR_GAP = 0.6;   // a rune is a neighbour if its edge-to-edge gap is under this × the current rune's radius (glued ≈ touching)
const ARM_SPEED = 25;        // it must have actually flown (above this) before a settle can fire
const REST_SPEED = 12;       // settled once the body's speed stays under this…
const REST_DELAY = 0.18;     // …for this long (s) — the rune has come to rest in the blob
const MAX_WAIT = 3.0;        // safety: detonate anyway this long after arming (a boosted rune ricochets a while)
const FADE_TIME = 0.4;       // fizzle: fade the rune out over this (s) when it lands off-colour
const INITIAL_BOOST = 35;    // speed (ground u/s) added along the current direction when ignited; HALVES each use
const SHOCK_FLASH = new Color(255, 255, 255, 255);   // white wash as the shock reaches each rune
const FLAME_COLOR = new Color(255, 150, 40, 255);    // inflamed throb on the lit rune (warm orange)
const IGNITE_FLASH = new Color(190, 245, 255, 255);  // white/cyan pop the instant the rune ignites in the flame
const _bv = new Vec2();      // scratch for boosted velocity (set-then-assign)

/** One step of the chain: a bolt from `fromPos` (the rune that passes the shock on) to `target`, fired at `time`
 *  seconds into the cascade. `fromPos` is null for the root (the lit rune itself — it has no incoming bolt). */
interface Hop { fromPos: Vec3 | null; toPos: Vec3; target: Stone; time: number; }

/**
 * OVERPOWER / inflamed-rune behaviour (GameMode.stickyPrototype). NOT spawned directly: a ManaFlame adds this
 * to a normal (Glue) rune the instant the rune flies THROUGH the flame — see ManaFlame. On ignite the rune gets
 * a SPEED BOOST along its current heading, and ANOTHER (halved) boost on every wall bounce, so it ricochets
 * faster and faster. It still sticks/compacts like a normal rune; once it has come to REST it detonates the
 * contiguous same-colour cluster it landed in — or FIZZLES if it landed off-colour. It never becomes a star.
 *
 * The detonation is a CHAIN: the shock starts at the lit rune and PROPAGATES rune→rune outward (BFS over
 * same-colour neighbours), each hop a ManaLightning bolt from the rune that carries the shock to the next one.
 */
@ccclass('Overpower')
export class Overpower extends Component {
    /** Collider radius in ground px (set when armed). */
    radius = 24;
    private _done = false;
    private _armed = false;       // has actually flown (so a settle isn't detected at spawn)
    private _restDwell = 0;       // time spent below REST_SPEED
    private _sinceArmed = 0;      // time since arming (the MAX_WAIT safety)
    private _rb: RigidBody2D | null = null;
    private _boost = 0;           // remaining boost magnitude; halves on each use (ignite + each bounce)
    private _bouncePending = false;   // a wall bounce was registered → apply a (halved) boost next frame
    private _col: Collider2D | null = null;

    /** Ignite (called by the ManaFlame): give the first speed boost along the current heading, throb the rune
     *  orange, and start listening for wall bounces (each grants another, halved boost). */
    ignite(): void {
        if (!this._rb) this._rb = this.getComponent(RigidBody2D);
        const stone = this.getComponent(Stone);
        stone?.flashWhite(IGNITE_FLASH, 1, 0.06, 0.22);   // white/cyan pop the instant it ignites
        // then carry the inflamed throb (after the flash, so they don't fight over the flash channel)
        this.scheduleOnce(() => { if (stone?.isValid) stone.flashPulse(FLAME_COLOR, 0.3, 0.2, 10); }, 0.3);
        this._boost = INITIAL_BOOST;
        this._applyBoost();
        this._col = this.getComponent(CircleCollider2D);
        this._col?.on(Contact2DType.BEGIN_CONTACT, this._onContact, this);
    }

    /** Add the current boost along the body's heading, then halve it for next time. */
    private _applyBoost(): void {
        const rb = this._rb;
        if (!rb || this._boost <= 0) return;
        const v = rb.linearVelocity, sp = Math.hypot(v.x, v.y);
        if (sp < 1) return;
        rb.linearVelocity = _bv.set(v.x + v.x / sp * this._boost, v.y + v.y / sp * this._boost);
        this._boost *= 0.5;
    }

    /** A contact with anything that is NOT a blob rune (a wall / the launcher body) = a bounce → boost next frame
     *  (after Box2D has reflected the velocity, so the boost follows the new heading). Blob contacts are left to
     *  Glue (sticking) and end the flight. */
    private _onContact(_self: Collider2D, other: Collider2D | null): void {
        if (other?.getComponent(Stone)) return;   // hit the blob → not a bounce; let it stick/settle
        this._bouncePending = true;
    }

    update(dt: number): void {
        if (this._done) return;
        if (!this._rb) this._rb = this.getComponent(RigidBody2D);
        if (!this._rb) return;
        if (this._bouncePending) { this._bouncePending = false; this._applyBoost(); }   // post-bounce re-boost
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
        const chain = this._buildChain(type);                // BFS from this rune, root first then outward
        if (chain.length > 1) this._detonate(chain, type);   // at least one same-colour rune is touching → boom
        else this._fizzle();                                  // landed off-colour → fade away, no explosion
    }

    /** BFS the same-colour cluster from this lit rune, recording each hop: which rune passes the shock to which,
     *  and WHEN (depth × HOP_STEP). World positions are captured NOW (the blob is at rest) so a bolt stays
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
     *  a beat later the rune POPS into a star that flies into Koolkan (RaisingStar). If no RaisingStar/Koolkan is
     *  available it just shatters. The lit rune (root) has no incoming bolt — it flashes and becomes a star too. */
    private _detonate(chain: Hop[], type: number): void {
        const lit = ManaLightning.instance;
        for (let i = 0; i < chain.length; i++) {
            const hop = chain[i];
            this.scheduleOnce(() => {
                if (hop.fromPos && lit?.isValid) lit.strike(hop.fromPos, hop.toPos);
                if (!hop.target.isValid) return;
                hop.target.flashWhite(SHOCK_FLASH, 0.8, 0.08);
                this.scheduleOnce(() => {
                    if (!hop.target.isValid) return;
                    const rs = RaisingStar.instance;
                    if (rs) rs.launchAtKoolkan(hop.target, type);   // pop → star → flies into Koolkan
                    else hop.target.shatter();                       // no RaisingStar wired → just shatter
                }, AB_DELAY);
            }, hop.time);
        }
    }

    /** Fizzle: the rune landed where no same-colour rune touches it → fade out gently and vanish (no boom). */
    private _fizzle(): void {
        const view = this.getComponent(Stone)?.viewNode;
        if (!view?.isValid) { if (this.node?.isValid) this.node.destroy(); return; }
        const op = view.getComponent(UIOpacity) ?? view.addComponent(UIOpacity);
        tween(op).to(FADE_TIME, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => { if (this.node?.isValid) this.node.destroy(); }).start();
    }

    onDestroy(): void {
        this._col?.off(Contact2DType.BEGIN_CONTACT, this._onContact, this);
        this._col = null;
    }
}
