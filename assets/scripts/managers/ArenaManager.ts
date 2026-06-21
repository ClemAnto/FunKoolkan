import { _decorator, Component, CCInteger } from 'cc';
import { StoneLauncher } from '../entities/StoneLauncher';
import { NextPreview } from '../entities/NextPreview';

const { ccclass, property } = _decorator;

/**
 * FunKoolkan launch-queue coordinator. Owns the current/next gems and wires the launcher ↔ NEXT
 * interaction — on fire it advances the queue and reloads both; a tap on the NEXT swaps loaded ↔ next.
 *
 * Deliberately the single place where the launcher and NEXT INTERACT (the launcher fires + shows the
 * loaded stone, NextPreview shows the upcoming gem — neither knows about the other). Keep classes
 * SPECIALIZED, not a monolith: the poles carry their own `Pole` component; the mana-circuit logic
 * will live in its own dedicated class when it is designed.
 */
@ccclass('ArenaManager')
export class ArenaManager extends Component {
    @property({ type: StoneLauncher, tooltip: 'The launcher — fires stones and shows the loaded one.' })
    launcher: StoneLauncher | null = null;
    @property({ type: NextPreview, tooltip: 'The NEXT preview — shows the upcoming gem.' })
    next: NextPreview | null = null;
    @property({ type: CCInteger, tooltip: 'How many gem colours are in play (a random one is picked per launch).' })
    numGemTypes = 3;

    private _currentType = 0;   // gem loaded on the launcher (fires next)
    private _nextType = 0;      // gem shown in the NEXT preview

    start(): void {
        this._currentType = this._randomType();
        this._nextType = this._randomType();
        if (this.launcher) {
            this.launcher.onLaunch = (t) => this._onLaunch(t);
            this.launcher.onAimPress = (x, y) => this._onAimPress(x, y);
            this.launcher.showInitial(this._currentType);
        }
        this.next?.showInitial(this._nextType);
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
