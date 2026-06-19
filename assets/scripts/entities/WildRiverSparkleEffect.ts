import { _decorator, Node } from 'cc';
import { Warrior } from './Warrior';
import { TintSparkleEffect } from './TintSparkleEffect';

const { ccclass } = _decorator;

/** Infected-warrior tint+hop for the WildRiver cascade — implementation in TintSparkleEffect. */
@ccclass('WildRiverSparkleEffect')
export class WildRiverSparkleEffect extends TintSparkleEffect {
    protected readonly hopUpSec         = 0.13;
    protected readonly hopDownSec       = 0.13;
    protected readonly hopHeight        = 18;
    protected readonly tintInSec        = 0.12;
    protected readonly pulseSec         = 0.35;
    protected readonly mapperRestoreSec = 0.12;
    protected readonly spriteRestoreSec = 0.25;

    static attach(warrior: Warrior): WildRiverSparkleEffect {
        const node = new Node('WRSparkle');
        node.setParent(warrior.viewNode);
        const wrs = node.addComponent(WildRiverSparkleEffect);
        wrs._warrior = warrior;
        wrs._startVFX();
        return wrs;
    }
}
