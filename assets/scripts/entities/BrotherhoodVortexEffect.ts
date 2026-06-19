import { _decorator, Component, Node, Vec3, Color, Sprite, SpriteFrame, UIOpacity, UITransform, tween, gfx } from 'cc';

const { ccclass } = _decorator;

@ccclass('BrotherhoodVortexEffect')
export class BrotherhoodVortexEffect extends Component {

    static attach(parent: Node, pos: Vec3, level: number, frame: SpriteFrame | null): void {
        const node = new Node('BrVortex');
        node.setParent(parent);
        node.setPosition(pos);
        node.addComponent(BrotherhoodVortexEffect)._startVFX(level, frame);
    }

    private _startVFX(level: number, frame: SpriteFrame | null): void {
        const duration = 0.5 + level * 0.15;
        const baseSize = 22 + level * 13;   // level 1 → 35 px, level 5 → 87 px

        for (let i = 0; i < 2; i++) {
            const ring = new Node(`VxRing${i}`);
            ring.setParent(this.node);

            const size = baseSize * (1 + i * 0.6);
            ring.addComponent(UITransform).setContentSize(size, size);
            const op = ring.addComponent(UIOpacity);
            op.opacity = 0;

            if (frame) {
                const sp = ring.addComponent(Sprite);
                sp.sizeMode    = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = frame;
                sp.color       = i === 0
                    ? new Color(210,  80, 255, 200)
                    : new Color(130,  30, 200, 150);
                sp.getMaterialInstance(0)?.overridePipelineStates({
                    blendState: { targets: [{ blend: true,
                        blendSrc: gfx.BlendFactor.SRC_ALPHA,
                        blendDst: gfx.BlendFactor.ONE }] }
                });
            }

            const maxOp  = i === 0 ? 170 : 110;
            const spinDur = 0.45 + i * 0.2;
            const dir     = i % 2 === 0 ? 360 : -360;

            tween(op).to(0.1, { opacity: maxOp }).start();

            tween(ring)
                .repeatForever(tween<Node>().by(spinDur, { angle: dir }))
                .start();

            tween(ring)
                .to(0.1,                { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'quadOut' })
                .to(duration - 0.1,     { scale: new Vec3(0.05, 0.05, 1) }, { easing: 'quadIn'  })
                .start();

            const hold = Math.max(0, duration - 0.2);
            tween(op)
                .delay(hold)
                .to(0.2, { opacity: 0 })
                .call(i === 0 ? () => { if (this.node?.isValid) this.node.destroy(); } : () => {})
                .start();
        }
    }
}
