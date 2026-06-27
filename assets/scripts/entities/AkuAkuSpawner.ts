import { _decorator, Component, Node, Prefab, instantiate, Vec3, CCInteger, CCFloat, NodePool, ParticleSystem2D, UITransform } from 'cc';
import { EDITOR } from 'cc/env';
import { AkuAku } from './AkuAku';
import { AkuAkuBehavior } from './AkuAkuBehavior';
import { Column } from './Column';
import { PrayerSpirit } from './PrayerSpirit';
import { unprojectX, unprojectY, physicsDepth } from '../config/Perspective';

const { ccclass, property, disallowMultiple, menu } = _decorator;

const _w = new Vec3();

/**
 * Spawns Aku-aku into the arena over time: every `spawnInterval` seconds it pops one out of THIS node's
 * position (the "hole" — place the spawner where you want them to emerge), up to `maxCount` alive, with a
 * rubbery emerge bounce + a puff of dust. Each
 * Aku-aku gets a DYNAMIC Box2D body (a child of the arena, like a Stone) so the launched runes collide
 * with it and shove it around. Attach this to a node on the Arena and wire the references in the editor.
 *
 * Mirrors the Stone split: the physics body lives in the arena's flat GROUND space; the Aku-aku VIEW
 * (the prefab instance) lives in the stone layer and follows the body through the 1-point projection.
 *
 * Movement / wake-gauge / how the player knocks them off the cliff is NOT here yet — the spawner only
 * brings them out and keeps the population topped up.
 */
@ccclass('AkuAkuSpawner')
@disallowMultiple
@menu('Enemies/AkuAkuSpawner')
export class AkuAkuSpawner extends Component {
    @property({ type: Node, tooltip: 'Arena container — Aku-aku physics bodies spawn as its children (ground space), like the stones.' })
    arena: Node | null = null;

    @property({ type: Node, tooltip: 'Optional: layer where the Aku-aku view (prefab instance) is placed — the same layer as the rune views. Leave empty to use the arena itself.' })
    stoneLayer: Node | null = null;

    @property({ type: Prefab, tooltip: 'The AkuAku prefab (carries the AkuAku component).' })
    akuPrefab: Prefab | null = null;

    @property({ type: Column, tooltip: 'The column this spawner sends its Aku-aku to climb (the hole sits near it). RoundManager drives spawnOnColumn() onto this column.' })
    column: Column | null = null;

    @property({ type: PrayerSpirit, tooltip: 'Emitter for the purple prayer spirit (→ energy to Koolkan). Passed to each Aku that climbs; empty = no spirits.' })
    prayerSpirit: PrayerSpirit | null = null;

    @property({ type: ParticleSystem2D, tooltip: 'Optional dust puff — an authored ParticleSystem2D placed as a child of this spawner (on the hole). Played each time an Aku pops out. Empty = no dust.' })
    dust: ParticleSystem2D | null = null;

    @property({ type: Node, tooltip: 'Background node: an eliminated Aku-aku drops INTO this (as its last child) during its descent, so it falls into the background. Empty = it stays in the stone layer.' })
    background: Node | null = null;

    @property({ type: CCInteger, tooltip: 'Maximum Aku-aku alive at once — none spawn past this.' })
    maxCount = 5;

    @property({ type: CCFloat, tooltip: 'Seconds between spawns.' })
    spawnInterval = 3;

    @property({ tooltip: 'Start spawning automatically on load (else drive it via setRunning(true)).' })
    autoStart = true;

    private _timer = 0;
    private _running = false;
    private readonly _live: AkuAku[] = [];
    private readonly _pool = new NodePool();

    start(): void {
        this._running = this.autoStart;
        this._timer = this.spawnInterval;   // first one pops out after a full interval
    }

    /** Turn spawning on/off at runtime (e.g. between rounds). */
    setRunning(v: boolean): void { this._running = v; }

    /** Aku-aku currently alive (prunes any that were destroyed). */
    get liveCount(): number { this._prune(); return this._live.length; }

    update(dt: number): void {
        if (EDITOR || !this._running) return;
        this._prune();
        if (this._live.length >= this.maxCount) return;
        if (physicsDepth() <= 0 || !this.arena?.isValid || !this.akuPrefab) return;   // wait for the perspective to be configured
        this._timer += dt;
        if (this._timer < this.spawnInterval) return;
        this._timer = 0;
        this._spawnOne();
    }

    private _spawnOne(): void {
        const pos = this._spawnGroundPos();
        if (!pos) return;
        const node = this._obtain();
        if (!node) return;
        node.setParent(this.stoneLayer ?? this.arena!);   // the VIEW lives in the stone layer (it follows the body)
        const aku = node.getComponent(AkuAku);
        if (!aku) { node.destroy(); return; }
        let beh = node.getComponent(AkuAkuBehavior);
        if (!beh) beh = node.addComponent(AkuAkuBehavior);   // brain (prefer authoring it on the prefab; added here as a fallback)
        aku.background = this.background;                    // where it drops during the eliminate descent
        beh.onGone = () => this.recycle(aku);                // off the cliff → free the slot + pool the node
        this._playDust();
        beh.spawn(this.arena!, pos.x, pos.y);                // place + body + emerge + run the behaviour loop
        this._live.push(aku);
    }

    /** Spawn an Aku-aku that climbs onto `column` and prays (GDD v0.4): pops from THIS hole, holds, hops to the
     *  column, leaps on top, then prays after 2s. Called by the RoundManager when it wants one on a column.
     *  Respects `maxCount`. Returns the spawned AkuAku (null if capped / not ready). */
    spawnOnColumn(column?: Column): AkuAku | null {
        if (EDITOR || !this.node.activeInHierarchy) return null;   // a disabled spawner node never spawns, even if called
        const col = column ?? this.column;   // default to this spawner's associated column
        if (!col?.node?.isValid) return null;
        this._prune();
        if (this._live.length >= this.maxCount) return null;
        if (physicsDepth() <= 0 || !this.arena?.isValid || !this.akuPrefab) return null;
        const pos = this._spawnGroundPos();
        if (!pos) return null;
        const node = this._obtain();
        if (!node) return null;
        node.setParent(this.stoneLayer ?? this.arena!);
        const aku = node.getComponent(AkuAku);
        if (!aku) { node.destroy(); return null; }
        let beh = node.getComponent(AkuAkuBehavior);
        if (!beh) beh = node.addComponent(AkuAkuBehavior);
        aku.background = this.background;
        beh.prayerSpirit = this.prayerSpirit;   // so its prayer emits spirits toward Koolkan
        beh.onGone = () => this.recycle(aku);
        this._playDust();
        beh.spawnOnColumn(this.arena!, pos.x, pos.y, col);
        this._live.push(aku);
        return aku;
    }

    /** Recycle an eliminated Aku-aku back into the pool (call from its eliminate() onGone, once wired). */
    recycle(aku: AkuAku): void {
        const i = this._live.indexOf(aku);
        if (i >= 0) this._live.splice(i, 1);
        const node = aku.node;
        aku.reset();                          // destroys the body, stops the tweens, restores the pose
        if (node?.isValid) this._pool.put(node);
    }

    /** The spawn point in GROUND space: THIS node's position (the "hole"), de-projected from its on-screen
     *  spot. Converts the spawner's world position to arena-local (visual) and un-projects it, so it works
     *  regardless of where the spawner sits in the hierarchy. */
    private _spawnGroundPos(): { x: number; y: number } | null {
        const arena = this.arena;
        const ut = arena?.getComponent(UITransform);
        if (!arena?.isValid || !ut || physicsDepth() <= 0) return null;
        this.node.getWorldPosition(_w);
        ut.convertToNodeSpaceAR(_w, _w);                       // world → arena-local (visual)
        return { x: unprojectX(_w.x, _w.y), y: unprojectY(_w.y) };
    }

    private _obtain(): Node | null {
        if (this._pool.size() > 0) return this._pool.get();
        return this.akuPrefab ? (instantiate(this.akuPrefab) as unknown as Node) : null;
    }

    private _prune(): void {
        for (let i = this._live.length - 1; i >= 0; i--) {
            if (!this._live[i]?.node?.isValid) this._live.splice(i, 1);
        }
    }

    /** Puff the dust VFX at the ground spot (projected to screen, depth-scaled), then auto-destroy it. */
    /** Puff the authored dust ParticleSystem2D (a child of this spawner, sitting on the hole). No-op if none.
     *  Activates the node first so the system has initialised (resetSystem crashes on an inactive/uninitialised PS). */
    private _playDust(): void {
        const ps = this.dust;
        if (!ps?.isValid) return;
        if (!ps.node.active) ps.node.active = true;
        ps.resetSystem();
    }

    onDestroy(): void {
        this._pool.clear();
    }
}
