import { _decorator, Node, SpriteFrame } from 'cc';
import { Warrior } from './Warrior';
import { GlowPulseEffect } from './GlowPulseEffect';

const { ccclass } = _decorator;

/** Launcher glow for the Brotherhood powerup — implementation in GlowPulseEffect, plus an expire timer. */
@ccclass('BrotherhoodEffect')
export class BrotherhoodEffect extends GlowPulseEffect {
    protected readonly nodePrefix      = 'Br';
    protected readonly pulseStep       = 0.55;
    protected readonly innerFadeTarget = 130;
    protected readonly sparkleInterval = 0.11;
    protected readonly fadeOutDur      = 0.5;

    onExpired: (() => void) | null = null;
    private _expireCb = () => { this.onExpired?.(); };

    static attach(warrior: Warrior, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): BrotherhoodEffect {
        const node = new Node('BrotherhoodEffect');
        node.setParent(warrior.viewNode);
        const ge = node.addComponent(BrotherhoodEffect);
        ge._radius       = warrior.radius;
        ge._sparkleFrame = sparkleFrame;
        ge._startVFX(glowFrame);
        return ge;
    }

    startTimer(sec: number): void {
        this.unschedule(this._expireCb);
        this.scheduleOnce(this._expireCb, sec);
    }

    protected _onDetach(): void {
        this.unschedule(this._expireCb);
    }
}
