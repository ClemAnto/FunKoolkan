import { _decorator, Component, CCFloat, CCInteger } from 'cc';
import { Magnet } from '../entities/Magnet';
import { StoneLauncher } from '../entities/StoneLauncher';
import { NextPreview } from '../entities/NextPreview';

const { ccclass, property } = _decorator;

const FORCE_FPS_REF = 60;   // per-frame magnet forces scaled by (dt × this) so integration matches 60 fps

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

    @property({ type: CCFloat, tooltip: 'Magnet attraction range — surface-surface GROUND px within which stones are pulled.' })
    magnetRange = 100;
    @property({ type: CCFloat, tooltip: 'Magnet base pull force (tune in play).' })
    magnetForce = 600;
    @property({ type: CCFloat, tooltip: 'Contact-hold ramp: pull = force×(1 + t²·hold), t→1 at contact. Higher = harder to separate attached stones.' })
    magnetHold = 14;
    @property({ type: CCFloat, tooltip: 'Surface-surface GROUND px counted as "connected/touching" (chain conductivity threshold).' })
    magnetContactGap = 16;
    @property({ type: CCFloat, slide: true, range: [0, 16, 0.5], tooltip: 'linearDamping applied to a connected stone (settles clusters so they hardly drift apart).' })
    magnetSettleDamping = 6;

    private _currentType = 0;   // gem loaded on the launcher (fires next)
    private _nextType = 0;      // gem shown in the NEXT preview

    start(): void {
        // 1. System-wide magnet tuning (poles self-register via their editor Magnet; stones at spawn).
        Magnet.attractGap    = this.magnetRange;
        Magnet.contactGap    = this.magnetContactGap;
        Magnet.force         = this.magnetForce;
        Magnet.hold          = this.magnetHold;
        Magnet.settleDamping = this.magnetSettleDamping;

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
        Magnet.solve(dt * FORCE_FPS_REF);   // mana-circuit magnetism (poles + connected same-colour stones)
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
