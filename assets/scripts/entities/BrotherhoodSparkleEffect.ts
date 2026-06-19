import { _decorator, Node } from 'cc';
import { Warrior } from './Warrior';
import { TintSparkleEffect } from './TintSparkleEffect';

const { ccclass } = _decorator;

/** Infected-warrior tint+hop for the Brotherhood cascade — implementation in TintSparkleEffect (faster timings). */
@ccclass('BrotherhoodSparkleEffect')
export class BrotherhoodSparkleEffect extends TintSparkleEffect {
    protected readonly hopUpSec         = 0.10;
    protected readonly hopDownSec       = 0.10;
    protected readonly hopHeight        = 14;
    protected readonly tintInSec        = 0.08;
    protected readonly pulseSec         = 0.25;
    protected readonly mapperRestoreSec = 0.08;
    protected readonly spriteRestoreSec = 0.15;

    static attach(warrior: Warrior): BrotherhoodSparkleEffect {
        const node = new Node('BRSparkle');
        node.setParent(warrior.viewNode);
        const brs = node.addComponent(BrotherhoodSparkleEffect);
        brs._warrior = warrior;
        brs._startVFX();
        return brs;
    }
}
