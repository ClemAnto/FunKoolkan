import { _decorator, Component, Node, Graphics, Color } from 'cc';
import { EDITOR } from 'cc/env';
import { projectX, projectY, sizeXFactor, floorTilt, physicsDepth } from '../config/Perspective';
import { DebugDraw } from '../config/DebugDraw';
import { Stone } from './Stone';
import { StoneLauncher } from './StoneLauncher';

const { ccclass, property, disallowMultiple, menu } = _decorator;

/**
 * LAUNCH CLEAR ZONE — a circular keep-clear bubble around the launcher. Any rune whose centre enters it is
 * ELECTRIFIED AND PULVERISED (Stone.shatter: spark burst + collapse to nothing), so spent runes can never pile
 * up over the muzzle and block the next shot. The rune CURRENTLY being launched (StoneLauncher.lastFired) is
 * exempt — it spawns inside the bubble and flies out through it untouched.
 *
 * Self-contained: it resolves the launcher (spawn point + arena) via StoneLauncher.instance — no editor wiring.
 * GameManager auto-installs it in the aku-arena core. Harmless in any core (it only clears runes near the muzzle).
 */
@ccclass('LaunchClearZone')
@disallowMultiple
@menu('Arena/LaunchClearZone')
export class LaunchClearZone extends Component {
    @property({ tooltip: 'Zone radius in GROUND px (a bubble around the launcher spawn point, shifted forward by `forwardOffset`).' })
    radius = 130;
    @property({ tooltip: 'Shift the zone centre this many GROUND px IN FRONT of the launcher (+ = toward the field).' })
    forwardOffset = 50;
    @property({ tooltip: 'Draw the zone on the floor for tuning (also shown by the global DEBUG toggle).' })
    showDebug = true;

    private _dbg: Graphics | null = null;

    update(): void {
        if (EDITOR) return;
        const L = StoneLauncher.instance;
        const arena = L?.arena;
        if (!L?.node?.isValid || !arena?.isValid || physicsDepth() <= 0 || this.radius <= 0) return;

        const lp = L.node.position;                              // launcher spawn point (arena-local = ground space)
        const cx = lp.x, cy = lp.y + this.forwardOffset;         // zone centre, shifted forward (+y = toward the field)
        const R2 = this.radius * this.radius;
        const firing = StoneLauncher.lastFired;                  // the rune being launched right now → never touch it

        const all = Stone.all;
        for (let i = 0; i < all.length; i++) {
            const s = all[i];
            if (!s.node?.isValid || s === firing) continue;      // exempt the current shot (it flies out through the zone)
            const p = s.node.position;
            const dx = p.x - cx, dy = p.y - cy;
            if (dx * dx + dy * dy < R2) s.shatter();             // inside the bubble → electrify + pulverise (guarded one-shot)
        }
        this._drawDebug(arena, cx, cy, this.radius);
    }

    /** Draw the zone as a flat ground ellipse projected onto the floor (model-aware tilt), like the tee/flame
     *  debug: its own Graphics under the arena's PARENT, mirroring the arena transform so it renders above the floor. */
    private _drawDebug(arena: Node, cx: number, cy: number, R: number): void {
        const world = arena.parent;
        if (!(this.showDebug || DebugDraw.enabled) || !world?.isValid) {
            if (this._dbg?.isValid) this._dbg.clear();
            return;
        }
        if (!this._dbg?.isValid) {
            const n = new Node('LaunchClearZoneDebug');
            n.layer = arena.layer;
            n.setParent(world);
            this._dbg = n.addComponent(Graphics);
            this._dbg.lineWidth = 3;
            this._dbg.strokeColor = new Color(80, 200, 255, 220);   // cyan
        }
        const dn = this._dbg.node;
        dn.setSiblingIndex(world.children.length - 1);
        dn.setPosition(arena.position);
        dn.setScale(arena.scale);
        const g = this._dbg;
        g.clear();
        const rx = R * sizeXFactor(cy);
        g.ellipse(projectX(cx, cy), projectY(cy), rx, rx * floorTilt(cy));
        g.stroke();
    }

    onDestroy(): void {
        if (this._dbg?.isValid) this._dbg.node.destroy();
        this._dbg = null;
    }
}
