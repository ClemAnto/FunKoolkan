import { _decorator, Node, SpriteFrame } from 'cc';
import { Warrior } from './Warrior';
import { GlowPulseEffect } from './GlowPulseEffect';

const { ccclass } = _decorator;

/** Launcher glow for the WildRiver powerup — implementation in GlowPulseEffect. */
@ccclass('WildRiverEffect')
export class WildRiverEffect extends GlowPulseEffect {
    protected readonly nodePrefix      = 'Wr';
    protected readonly pulseStep       = 0.65;
    protected readonly innerFadeTarget = 120;
    protected readonly sparkleInterval = 0.13;
    protected readonly fadeOutDur      = 0.6;

    static attach(warrior: Warrior, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): WildRiverEffect {
        const node = new Node('WildRiverEffect');
        node.setParent(warrior.viewNode);
        const wr = node.addComponent(WildRiverEffect);
        wr._radius       = warrior.radius;
        wr._sparkleFrame = sparkleFrame;
        wr._startVFX(glowFrame);
        return wr;
    }
}
