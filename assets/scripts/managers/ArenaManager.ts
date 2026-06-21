import { _decorator, Component, CCFloat, CCInteger } from 'cc';
import { Magnet } from '../entities/Magnet';
import { StoneLauncher } from '../entities/StoneLauncher';
import { NextPreview } from '../entities/NextPreview';

const { ccclass, property } = _decorator;

/**
 * FunKoolkan gameplay coordinator for the arena. Two jobs:
 *
 *  1. The mana-circuit magnetism: holds the system-wide Magnet tuning and drives the per-frame solve.
 *     (Poles carry their OWN Magnet component, attached in the editor; stones register at spawn.)
 *  2. The launch QUEUE: owns the current/next gems and coordinates the launcher ↔ NEXT interaction —
 *     on fire it advances the queue and reloads both; a tap on the NEXT swaps loaded ↔ next.
 *
 * Deliberately the place where the launcher and NEXT INTERACT (the launcher fires + shows the loaded
 * stone, NextPreview shows the upcoming gem — neither knows about the other). The circuit closure /
 * mana wave / Koolkan shield logic will grow here too. Keep specialised classes, not a monolith.
 */
@ccclass('ArenaManager')
export class ArenaManager extends Component {
    @property({ type: StoneLauncher, tooltip: 'The launcher — fires stones and shows the loaded one.' })
    launcher: StoneLauncher | null = null;
    @property({ type: NextPreview, tooltip: 'The NEXT preview — shows the upcoming gem.' })
    next: NextPreview | null = null;
    @property({ type: CCInteger, tooltip: 'Number of gem types (random pick per launch).' })
    numGemTypes = 3;

    @property({ type: CCFloat, tooltip: 'Grab range — surface-surface GROUND px beyond the circumference within which a free stone is pulled (keep SMALL, a few px).' })
    magnetRange = 12;
    @property({ type: CCFloat, tooltip: 'Attraction pull strength (stronger as a stone nears contact).' })
    magnetForce = 600;
    @property({ type: CCFloat, tooltip: 'Touch gap — surface-surface GROUND px counted as "edges touching": only here does the petrify timer run.' })
    snapGap = 3;
    @property({ type: CCFloat, tooltip: 'Seconds a stone must stay in the magnetism zone NEAR-STILL before it petrifies (attaches).' })
    petrifyDelay = 2;
    @property({ type: CCFloat, tooltip: 'Ground units/s: at or below this speed a stone counts as "near-still" for the petrify timer.' })
    petrifyMaxSpeed = 8;
    @property({ type: CCFloat, tooltip: 'Repel range — surface-surface GROUND px within which a repel magnet pushes free stones away.' })
    repelRange = 120;
    @property({ type: CCFloat, tooltip: 'Repel push strength.' })
    repelForce = 800;
    @property({ tooltip: 'Log petrify events + a periodic tree summary to the console (diagnostics).' })
    debugLog = false;
    @property({ tooltip: 'Draw the magnetized tree (links from each petrified stone to its parent) for debug.' })
    debugTree = false;

    private _currentType = 0;   // gem loaded on the launcher (fires next)
    private _nextType = 0;      // gem shown in the NEXT preview

    start(): void {
        // 1. System-wide magnet tuning (poles self-register via their editor Magnet; stones at spawn).
        Magnet.attractGap      = this.magnetRange;
        Magnet.attractForce    = this.magnetForce;
        Magnet.snapGap         = this.snapGap;
        Magnet.petrifyDelay    = this.petrifyDelay;
        Magnet.petrifyMaxSpeed = this.petrifyMaxSpeed;
        Magnet.repelRange      = this.repelRange;
        Magnet.repelForce      = this.repelForce;
        Magnet.debugLog        = this.debugLog;
        Magnet.debugTree       = this.debugTree;

        // 2. Launch queue: own current/next and wire the launcher ↔ NEXT interaction.
        this._currentType = this._randomType();
        this._nextType = this._randomType();
        if (this.launcher) {
            this.launcher.onLaunch = (t) => this._onLaunch(t);
            this.launcher.onAimPress = (x, y) => this._onAimPress(x, y);
            this.launcher.showInitial(this._currentType);
        }
        this.next?.showInitial(this._nextType);
    }

    update(dt: number): void {
        Magnet.solve(dt);   // mana-circuit magnetism (attract → petrify; Magnet normalises forces to 60 fps internally)
    }

    private _randomType(): number { return Math.floor(Math.random() * Math.max(1, this.numGemTypes)); }

    /** A stone was fired: NEXT becomes the loaded gem (reload the launcher), pick a fresh NEXT. */
    private _onLaunch(_firedType: number): void {
        this._currentType = this._nextType;
        this._nextType = this._randomType();
        this.launcher?.armReload(this._currentType);
        this.next?.reload(this._nextType);
    }

    /** Press handler from the launcher: a tap on the NEXT preview swaps it with the loaded gem
     *  (and consumes the press so it never launches). Returns true if consumed. */
    private _onAimPress(uiX: number, uiY: number): boolean {
        if (this.next?.containsUIPoint(uiX, uiY)) { this._trySwap(); return true; }
        return false;
    }

    /** Swap the loaded and NEXT gems, each with its pop. Ignored while either pop is in flight. */
    private _trySwap(): void {
        if (!this.launcher || !this.next) return;
        if (this.launcher.isLoadAnimating || this.next.isAnimating) return;
        const c = this._currentType;
        this._currentType = this._nextType;
        this._nextType = c;
        this.launcher.swapLoaded(this._currentType);
        this.next.swapTo(this._nextType);
    }
}
