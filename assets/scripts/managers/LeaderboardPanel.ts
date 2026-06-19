import { _decorator, Component, Node, Button, Label, Color, UIOpacity, tween, director, view, ResolutionPolicy } from 'cc';
import { TOP_N, ENABLED } from '../config/LeaderboardConfig';
import { LeaderboardEntry } from '../services/LeaderboardService';
import { LeaderboardProvider } from '../services/LeaderboardProvider';
import { NameEntry } from './NameEntry';

const { ccclass, property } = _decorator;

/** Scene to return to when closing the leaderboard view. */
const BACK_SCENE = 'MainMenu';

/**
 * Leaderboard view — the whole content of the Ranking scene (no longer a modal).
 *
 * Two ways the scene is entered:
 *   - From the menu "Leaderboard" button → just show the top-N board.
 *   - From game-over, when the score qualifies → GameManager sets
 *     {@link LeaderboardPanel.pendingScore} and loads this scene; start() then
 *     runs the name-entry → submit → board flow.
 *
 * Layout lives in the scene; this component only drives behavior. Each Board row
 * node must contain child Labels named "Rank", "Name", "Score".
 */
@ccclass('LeaderboardPanel')
export class LeaderboardPanel extends Component {
    /**
     * Score handed off from the game-over flow. Set by GameManager right before
     * loading the Ranking scene; consumed once in start(). Null when the scene is
     * opened just to view the board (e.g. from the menu).
     */
    static pendingScore: number | null = null;
    /**
     * Round reached, handed off alongside {@link pendingScore} from the game-over
     * flow. Submitted with the score; consumed once in start(). Defaults to 1 when
     * unset (e.g. older callers).
     */
    static pendingRound: number = 1;
    /**
     * App version, handed off alongside {@link pendingScore} from the game-over
     * flow. Submitted with the score; consumed once in start().
     */
    static pendingVersion: string = '';

    @property({ type: Node, tooltip: 'The Board sub-panel (the list; hidden during name entry).' })
    boardNode: Node | null = null;
    @property({ type: NameEntry, tooltip: 'The NameEntry component (arcade name selector).' })
    nameEntry: NameEntry | null = null;
    @property({ type: [Node], tooltip: 'One row node per rank (top→bottom). Each contains child Labels "Rank","Name","Score". Length = TOP_N.' })
    rowNodes: Node[] = [];
    @property({ type: Label, tooltip: 'Status label (loading / empty).' })
    statusLabel: Label | null = null;
    @property({ type: Button, tooltip: 'Board close button.' })
    closeButton: Button | null = null;
    @property({ tooltip: 'Highlight tint for the player\'s own row.' })
    highlightColor: Color = new Color(255, 215, 60, 255);
    @property({ tooltip: 'Normal row text tint.' })
    normalColor: Color = new Color(255, 255, 255, 255);

    private _boardOp: UIOpacity | null = null;
    private _highlightName = '';
    private _highlightScore = -1;

    /** The Board sub-panel, or the root as a fallback when unbound. */
    private get _board(): Node {
        return this.boardNode ?? this.node;
    }
    /** True when boardNode is a real child distinct from the root. */
    private get _hasBoardChild(): boolean {
        return !!this.boardNode && this.boardNode !== this.node;
    }

    onLoad(): void {
        const board = this._board;
        this._boardOp = board.getComponent(UIOpacity) ?? board.addComponent(UIOpacity);
        this.closeButton?.node.on(Button.EventType.CLICK, this._close, this);
    }

    start(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        const pending = LeaderboardPanel.pendingScore;
        const pendingRound = LeaderboardPanel.pendingRound;
        const pendingVersion = LeaderboardPanel.pendingVersion;
        LeaderboardPanel.pendingScore = null; // consume once
        LeaderboardPanel.pendingRound = 1;
        LeaderboardPanel.pendingVersion = '';
        if (pending != null) {
            this._runNameEntry(pending, pendingRound, pendingVersion);
        } else {
            this._showBoard();
        }
    }

    /**
     * Name entry → submit → board (own row highlighted). The score has already
     * qualified (GameManager checked before loading this scene), so we go straight
     * to the selector. Falls back to just showing the board if NameEntry is unbound.
     */
    private _runNameEntry(score: number, round: number, version: string): void {
        if (!ENABLED || !this.nameEntry) { this._showBoard(); return; }
        const svc = LeaderboardProvider.get();
        if (this._hasBoardChild) this.boardNode!.active = false; // board hidden during entry
        // Activate the NameEntry node first so its onLoad (binds buttons + self-hides) runs
        // BEFORE open(); otherwise open()'s own activation would trigger onLoad and re-hide it.
        this.nameEntry.node.active = true;
        this.nameEntry.open(score, (name) => {
            void (async () => {
                try {
                    await svc.init();
                    await svc.submit({ name, score, round, version, createdAt: Date.now() });
                } catch (e) {
                    console.warn('[LeaderboardPanel] submit failed:', e); // show board anyway
                }
                this._showBoard(name, score);
            })();
        });
    }

    private _showBoard(highlightName?: string, highlightScore?: number): void {
        this._highlightName = highlightName ?? '';
        this._highlightScore = highlightScore ?? -1;
        this._board.active = true;
        if (this._boardOp) {
            this._boardOp.opacity = 0;
            tween(this._boardOp).to(0.25, { opacity: 255 }, { easing: 'sineOut' }).start();
        }
        this._setStatus('Loading…');
        this._clearRows();
        void this._load();
    }

    private async _load(): Promise<void> {
        const svc = LeaderboardProvider.get();
        await svc.init();
        const entries = await svc.getTop(TOP_N);
        if (!this.node?.isValid) return; // scene changed while awaiting
        this._render(entries);
    }

    private _render(entries: LeaderboardEntry[]): void {
        this._setStatus(entries.length === 0 ? 'No scores yet.' : '');
        let highlighted = false;
        for (let i = 0; i < this.rowNodes.length; i++) {
            const row = this.rowNodes[i];
            if (!row) continue;
            const e = entries[i];
            if (!e) { row.active = false; continue; }
            row.active = true;
            const isMine = !highlighted && e.name === this._highlightName && e.score === this._highlightScore;
            if (isMine) highlighted = true;
            const tint = isMine ? this.highlightColor : this.normalColor;
            this._setRowLabel(row, 'Rank', String(i + 1), tint);
            this._setRowLabel(row, 'Name', e.name, tint);
            this._setRowLabel(row, 'Score', String(e.score), tint);
            // Round is shown if the prefab row has a "Round" Label (optional).
            // Date and Version are stored (Firestore) but intentionally NOT shown in the UI.
            this._setRowLabel(row, 'Round', String(e.round ?? 1), tint);
        }
    }

    private _clearRows(): void {
        for (const row of this.rowNodes) if (row) row.active = false;
    }

    private _setRowLabel(row: Node, childName: string, value: string, color: Color): void {
        const lbl = row.getChildByName(childName)?.getComponent(Label);
        if (!lbl) return;
        lbl.string = value;
        lbl.color = color;
    }

    private _setStatus(msg: string): void {
        if (!this.statusLabel) return;
        this.statusLabel.string = msg;
        this.statusLabel.node.active = msg.length > 0;
    }

    private _close(): void {
        director.loadScene(BACK_SCENE);
    }
}
