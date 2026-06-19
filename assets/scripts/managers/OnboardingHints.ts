import { _decorator, Component, Node, UIOpacity, Tween, tween, Vec3, sys } from 'cc';
import { SafeStorage } from '../utils/SafeStorage';

const { ccclass, property } = _decorator;

const LS_HINT_AIM   = 'fw_hint_aim_seen';
const LS_HINT_MERGE = 'fw_hint_merge_seen';

/**
 * In-gameplay onboarding hints (CrazyGames: land in gameplay, teach via visuals, skippable).
 * This component only DRIVES nodes authored in the editor — it never creates UI. Wire the hint
 * containers in the inspector. Both hints are non-blocking overlays that vanish as the player acts,
 * so the onboarding is inherently skippable. Each hint is shown at most once ever (localStorage flag);
 * call `fwResetHints()` from the browser console to re-arm them.
 */
@ccclass('OnboardingHints')
export class OnboardingHints extends Component {
    @property({ type: Node, tooltip: 'Aim/launch hint container (hand + "drag & release" label). Starts hidden.' })
    aimHint: Node | null = null;
    @property({ type: Node, tooltip: 'The hand/finger node bobbed down & up inside aimHint to mime the drag-release gesture.' })
    aimHand: Node | null = null;
    @property({ type: Node, tooltip: 'Merge-goal hint container ("match 2 to merge"). Starts hidden, auto-dismisses.' })
    mergeHint: Node | null = null;
    @property({ tooltip: 'Pull-down distance (design px) for the hand bob animation.' })
    handBob = 70;
    @property({ tooltip: 'Seconds after the shot is launched before the merge-goal hint fades out.' })
    mergeHoldSec = 1.5;

    private _aimShown = false;
    private _handStart: Vec3 | null = null;

    start(): void {
        // Hints stay inactive until triggered (non-blocking; never gate play).
        if (this.aimHint)   this.aimHint.active = false;
        if (this.mergeHint) this.mergeHint.active = false;

        if (sys.isBrowser) {
            (window as any).fwResetHints = (): void => {
                SafeStorage.set(LS_HINT_AIM, '');
                SafeStorage.set(LS_HINT_MERGE, '');
                console.log('[QA] onboarding hint flags cleared — reload the Game scene to see them');
            };
            (window as any).fwShowHints = (): void => this.replay();
        }
    }

    /** Replay the onboarding from scratch (clears the seen flags). Triggered by QA helper or the
     *  double-tap-on-score gesture — also usable as a "replay tutorial" entry point. */
    replay(): void {
        SafeStorage.set(LS_HINT_AIM, '');
        SafeStorage.set(LS_HINT_MERGE, '');
        this._aimShown = false;
        this.maybeShowAimHint();  // MergeHint re-arms on the next merge (its flag is cleared too)
    }

    /** Show the "drag down & release" hint on the first turn (once ever). */
    maybeShowAimHint(): void {
        if (this._aimShown || SafeStorage.get(LS_HINT_AIM) === '1' || !this.aimHint) return;
        this._aimShown = true;
        this.aimHint.active = true;
        const op = this._opacity(this.aimHint);
        op.opacity = 0;
        tween(op).to(0.3, { opacity: 255 }).start();
        this._startHandBob();
    }

    /** Hide the aim hint (on first drag / launch) and remember it so it never shows again. */
    hideAimHint(): void {
        if (!this.aimHint || !this.aimHint.active) return;
        SafeStorage.set(LS_HINT_AIM, '1');
        if (this.aimHand) {
            Tween.stopAllByTarget(this.aimHand);
            if (this._handStart) this.aimHand.setPosition(this._handStart);
        }
        const op = this._opacity(this.aimHint);
        tween(op).to(0.2, { opacity: 0 })
            .call(() => { if (this.aimHint) this.aimHint.active = false; })
            .start();
    }

    /** Show the merge-goal hint once (on the first aim drag). Stays visible until dismissed by
     *  fadeMergeHintAfterLaunch() — i.e. it lingers through the drag and flight, then fades. */
    maybeShowMergeHint(): void {
        if (SafeStorage.get(LS_HINT_MERGE) === '1' || !this.mergeHint) return;
        SafeStorage.set(LS_HINT_MERGE, '1');
        this.mergeHint.active = true;
        const op = this._opacity(this.mergeHint);
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op).to(0.3, { opacity: 255 }).start();
    }

    /** Fade the merge-goal hint out a few seconds after the shot is launched. */
    fadeMergeHintAfterLaunch(): void {
        if (!this.mergeHint || !this.mergeHint.active) return;
        const op = this._opacity(this.mergeHint);
        Tween.stopAllByTarget(op);
        tween(op)
            .delay(this.mergeHoldSec)
            .to(0.4, { opacity: 0 })
            .call(() => { if (this.mergeHint) this.mergeHint.active = false; })
            .start();
    }

    /** Loop, anchored at the hand's editor position (the warrior's feet, on the crossbow):
     *  press (squash) → pull down to charge → release (un-squash) → return up → pause → repeat.
     *  The hand sprite art should point UP (finger toward the warrior it launches). */
    private _startHandBob(): void {
        if (!this.aimHand) return;
        this._handStart = this.aimHand.position.clone();
        const s          = this._handStart;
        const down       = new Vec3(s.x, s.y - this.handBob, s.z);
        const baseScale  = this.aimHand.scale.clone();
        const pressScale = new Vec3(baseScale.x * 1.05, baseScale.y * 0.85, baseScale.z); // squash = pressing
        const loop = (): void => {
            if (!this.aimHand?.isValid) return;
            this.aimHand.setPosition(s);
            this.aimHand.setScale(baseScale);
            tween(this.aimHand)
                .to(0.12, { scale: pressScale }, { easing: 'quadOut' })  // press (squash down)
                .to(0.5,  { position: down },    { easing: 'sineIn'  })  // pull down to charge (held squashed)
                .to(0.14, { scale: baseScale },  { easing: 'backOut' })  // release (un-squash, pops the launch)
                .to(0.35, { position: s },       { easing: 'sineOut' })  // return to the start position
                .delay(0.6)
                .call(loop)
                .start();
        };
        loop();
    }

    private _opacity(n: Node): UIOpacity {
        return n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
    }
}
