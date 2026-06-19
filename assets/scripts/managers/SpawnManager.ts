import { _decorator, Component, Node } from 'cc';
import { Warrior } from '../entities/Warrior';
import { WALL_LT, WALL_RB } from '../entities/Track';

const { ccclass, property } = _decorator;

@ccclass('SpawnManager')
export class SpawnManager extends Component {

    @property({ min: 1, max: 5, step: 1, tooltip: 'Copies of each species per bag cycle' })
    bagMultiplier = 2;

    @property({ min: 0, max: 1, tooltip: 'Probability of biasing toward stranded species' })
    contextBiasChance = 0.35;

    @property({ min: 0, max: 1, tooltip: 'Probability of biasing level toward a stranded warrior' })
    levelBiasChance = 0.3;

    @property({ min: 0, max: 1, tooltip: 'Probability of matching type+level of warriors in the top rows (closest to launcher)' })
    topRowBiasChance = 0.25;

    @property({ min: 1, max: 20, tooltip: 'How many top warriors (by Y) to consider for top-row bias' })
    topRowCount = 6;

    @property({ min: 1, max: 10, tooltip: 'A warrior is stranded if no compatible peer is within this × diameter' })
    strandedRadiusMultiplier = 3.0;

    private _parent: Node | null = null;
    private _visualParent: Node | null = null;
    private _layerScaleY = 1;
    private _maxLevel = 1;
    private _nextType = 0;
    private _nextLevel = 1;
    private _activeSpecies: number[] = [];
    private _currentBag: number[] = [];
    // Copies-per-bag for each species; newly unlocked species ramp 1 → bagMultiplier
    // across bag rebuilds so they trickle in instead of arriving at full frequency.
    private _speciesWeight = new Map<number, number>();

    onMergeReady:    ((a: Warrior, b: Warrior) => void) | null = null;
    onNextGenerated: (() => void) | null = null;
    getWarriors:     (() => Warrior[]) | null = null;

    private _canvasToLocal(y: number): number { return y / this._layerScaleY; }
    private get _spawnY(): number {
        return Math.round(this._canvasToLocal(WALL_RB.y + (WALL_LT.y - WALL_RB.y) * 0.25));
    }

    init(parent: Node, visualParent: Node, spawnTypes: number, layerScaleY = 1): void {
        this._parent        = parent;
        this._visualParent  = visualParent;
        this._layerScaleY   = layerScaleY;
        this.initializeBag(Array.from({ length: spawnTypes }, (_, i) => i));
        this._generateNext();
    }

    get next(): { type: number; level: number } {
        return { type: this._nextType, level: this._nextLevel };
    }

    spawnNext(): Warrior {
        const w = Warrior.spawn(this._parent!, this._visualParent!, this._nextType, this._nextLevel, 0, this._spawnY);
        w.onMergeReady = this.onMergeReady;
        this._generateNext();
        return w;
    }

    /** Spawn a launcher of an explicit type/level at the launch position — does not touch bag/next.
     *  Used to rebuild the launcher when restoring a saved game state. */
    spawnAt(type: number, level: number): Warrior {
        const w = Warrior.spawn(this._parent!, this._visualParent!, type, level, 0, this._spawnY);
        w.onMergeReady = this.onMergeReady;
        return w;
    }

    prefill(): Warrior[] {
        const py = Math.round(this._canvasToLocal(WALL_RB.y + (WALL_LT.y - WALL_RB.y) * 0.92));
        const px = Math.round((WALL_RB.x - WALL_LT.x) * 0.3);
        const n  = this._activeSpecies.length;
        const positions = [
            { x: -px, y: py },
            { x:   0, y: py },
            { x:  px, y: py },
        ];
        return positions.map(({ x, y }, i) => {
            const w = Warrior.spawn(this._parent!, this._visualParent!, i % n, 1, x, y);
            w.crossedLine = true;
            w.fired       = true;
            w.onMergeReady = this.onMergeReady;
            w.settle();
            return w;
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    initializeBag(activeSpecies: number[]): void {
        this._activeSpecies = [...activeSpecies];
        this._speciesWeight.clear();
        for (const s of this._activeSpecies) this._speciesWeight.set(s, this.bagMultiplier);
        this._currentBag = this._makeBag();
        this._shuffle(this._currentBag);
    }

    onNewSpeciesUnlocked(species: number): void {
        if (this._activeSpecies.indexOf(species) >= 0) return;
        this._activeSpecies.push(species);
        this._speciesWeight.set(species, 1);
        // Splice an ADJACENT pair into the remaining bag: the first specimen of a new
        // species would otherwise sit stranded on the track with nothing to merge with,
        // so its partner is guaranteed to be served right after it.
        const pos = Math.floor(Math.random() * (this._currentBag.length + 1));
        this._currentBag.splice(pos, 0, species, species);
    }

    setSpawnTypes(n: number): void {
        if (n === this._activeSpecies.length) return;
        if (n < this._activeSpecies.length) {
            // Debug reset to earlier round — rebuild bag from scratch
            this.initializeBag(Array.from({ length: n }, (_, i) => i));
            return;
        }
        for (let s = this._activeSpecies.length; s < n; s++) {
            this.onNewSpeciesUnlocked(s);
        }
    }

    setMaxLevel(n: number): void { this._maxLevel = n; }

    setNext(type: number, level: number): void {
        this._nextType  = type;
        this._nextLevel = level;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private _makeBag(): number[] {
        const bag: number[] = [];
        for (const s of this._activeSpecies) {
            const weight = this._speciesWeight.get(s) ?? this.bagMultiplier;
            for (let i = 0; i < weight; i++) bag.push(s);
            // Advance the ramp one step per bag rebuild
            if (weight < this.bagMultiplier) this._speciesWeight.set(s, weight + 1);
        }
        return bag;
    }

    private _shuffle(arr: number[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    private _generateNext(): void {
        if (this.topRowBiasChance > 0 && Math.random() < this.topRowBiasChance && this.getWarriors) {
            const pick = this._tryTopRowPick();
            if (pick) {
                this._nextType  = pick.type;
                this._nextLevel = pick.level;
                this.onNextGenerated?.();
                return;
            }
        }
        this._nextType  = this._pickSpecies();
        this._nextLevel = this._pickLevel(this._nextType);
        this.onNextGenerated?.();
    }

    private _tryTopRowPick(): { type: number; level: number } | null {
        const available = this._availableLevels();
        const onTrack   = this.getWarriors!()
            .filter(w => w.crossedLine && !w.merging && w.node?.isValid);
        // sort descending by Y → warriors closest to the launcher come first
        onTrack.sort((a, b) => b.node.position.y - a.node.position.y);
        const topRows = onTrack.slice(0, this.topRowCount);

        const candidates = topRows.filter(w =>
            this._currentBag.indexOf(w.type) >= 0 && available.indexOf(w.level) >= 0
        );
        if (candidates.length === 0) return null;

        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        const idx = this._currentBag.indexOf(picked.type);
        this._currentBag.splice(idx, 1);
        this._refillIfEmpty();
        return { type: picked.type, level: picked.level };
    }

    private _pickSpecies(): number {
        // Context bias: try to serve a stranded species from within the bag
        if (this.contextBiasChance > 0 && Math.random() < this.contextBiasChance) {
            const stranded = this._strandedBySpecies();
            if (stranded.size > 0) {
                const species = this._weightedPick(stranded);
                const idx = this._currentBag.indexOf(species);
                if (idx >= 0) {
                    this._currentBag.splice(idx, 1);
                    this._refillIfEmpty();
                    return species;
                }
            }
        }
        // Normal bag draw from head
        this._refillIfEmpty();
        return this._currentBag.shift()!;
    }

    private _pickLevel(species: number): number {
        const available = this._availableLevels();
        if (this.levelBiasChance > 0 && Math.random() < this.levelBiasChance && this.getWarriors) {
            const all      = this.getWarriors();
            const stranded = all.filter(w =>
                w.launched && !w.merging && w.node?.isValid &&
                w.type === species && this._isStranded(w, all)
            );
            if (stranded.length > 0) {
                const picked = stranded[Math.floor(Math.random() * stranded.length)];
                if (available.indexOf(picked.level) >= 0) return picked.level;
            }
        }
        return available[Math.floor(Math.random() * available.length)];
    }

    private _refillIfEmpty(): void {
        if (this._currentBag.length === 0) {
            this._currentBag = this._makeBag();
            this._shuffle(this._currentBag);
        }
    }

    private _availableLevels(): number[] {
        const levels: number[] = [];
        for (let l = 1; l <= this._maxLevel; l++) levels.push(l);
        return levels;
    }

    private _strandedBySpecies(): Map<number, number> {
        const result = new Map<number, number>();
        if (!this.getWarriors) return result;
        const active = this.getWarriors().filter(w => w.launched && !w.merging && w.node?.isValid);
        for (const w of active) {
            if (!this._isStranded(w, active)) continue;
            // Only bias toward species still present in the bag
            if (this._currentBag.indexOf(w.type) < 0) continue;
            result.set(w.type, (result.get(w.type) ?? 0) + 1);
        }
        return result;
    }

    private _isStranded(w: Warrior, all: Warrior[]): boolean {
        const maxDist = w.radius * 2 * this.strandedRadiusMultiplier;
        return !all.some(other =>
            other !== w &&
            other.type  === w.type &&
            other.level === w.level &&
            Math.hypot(
                w.node.position.x - other.node.position.x,
                w.node.position.y - other.node.position.y
            ) <= maxDist
        );
    }

    private _weightedPick(map: Map<number, number>): number {
        const entries = [...map.entries()];
        const total   = entries.reduce((s, [, n]) => s + n, 0);
        let r = Math.random() * total;
        for (const [species, count] of entries) {
            r -= count;
            if (r <= 0) return species;
        }
        return entries[entries.length - 1][0];
    }
}
