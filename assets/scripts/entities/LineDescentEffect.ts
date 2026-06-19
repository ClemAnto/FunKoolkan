import { Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, tween, Color, gfx } from 'cc';

const AFTERIMAGE_OPACITY = 150;
const SPARK_COUNT        = 26;
const SPARK_COLOR        = new Color(255, 220, 130, 255); // warm gold — "space unlocked" reward
const SPARK_RISE_MIN     = 45;   // px the sparks drift upward into the freed strip
const SPARK_RISE_RAND    = 75;
const SPARK_SIZE_MIN     = 10;
const SPARK_SIZE_RAND    = 16;

/**
 * Decorative burst played while the game-over line steps DOWN after a new species
 * unlock: a fading afterimage at the old quota, an additive flash riding on the
 * moving line, and a curtain of golden sparks released upward across the freed strip.
 * Purely visual — the line movement itself is owned by GameManager.
 */
export class LineDescentEffect {

    /** All positions are in the line's parent local space. */
    static play(line: Node, sparkFrame: SpriteFrame | null, fromLocalY: number, toLocalY: number, durationS: number): void {
        const parent = line.parent;
        if (!parent?.isValid) return;

        this._spawnAfterimage(line, parent, fromLocalY, durationS);
        this._spawnLineFlash(line, durationS);
        if (sparkFrame) this._spawnSparkCurtain(line, parent, sparkFrame, fromLocalY, toLocalY, durationS);
    }

    /** Ghost of the line left at the old quota, fading out as the real line slides away. */
    private static _spawnAfterimage(line: Node, parent: Node, fromLocalY: number, durationS: number): void {
        const ghost = this._cloneLineSprite(line, 'GoLineAfterimage');
        ghost.setParent(parent);
        ghost.setPosition(line.position.x, fromLocalY);
        const op = ghost.addComponent(UIOpacity);
        op.opacity = AFTERIMAGE_OPACITY;
        tween(op)
            .to(durationS * 0.9, { opacity: 0 }, { easing: 'quadOut' })
            .call(() => { if (ghost.isValid) ghost.destroy(); })
            .start();
    }

    /** Additive white flash parented TO the line node, so it rides the descent. */
    private static _spawnLineFlash(line: Node, durationS: number): void {
        const flash = this._cloneLineSprite(line, 'GoLineFlash');
        flash.setParent(line);
        flash.setPosition(0, 0);
        flash.setScale(1, 1, 1); // inherits the line's scale through parenting
        const sp = flash.getComponent(Sprite)!;
        sp.color = Color.WHITE.clone();
        sp.getMaterialInstance(0)?.overridePipelineStates({
            blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] }
        });
        const op = flash.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op)
            .to(durationS * 0.18, { opacity: 220 })
            .to(durationS * 0.82, { opacity: 0 }, { easing: 'quadOut' })
            .call(() => { if (flash.isValid) flash.destroy(); })
            .start();
    }

    /** Golden sparks released along the line as it descends, drifting up into the freed strip. */
    private static _spawnSparkCurtain(line: Node, parent: Node, frame: SpriteFrame,
        fromLocalY: number, toLocalY: number, durationS: number): void {
        const uit   = line.getComponent(UITransform);
        const halfW = ((uit?.contentSize.width ?? 500) * Math.abs(line.scale.x)) / 2;

        for (let i = 0; i < SPARK_COUNT; i++) {
            // Stagger across the descent so the sparks trail the moving line
            const t  = i / SPARK_COUNT;
            const sx = line.position.x - halfW + Math.random() * halfW * 2;
            const sy = fromLocalY + (toLocalY - fromLocalY) * t;

            const node = new Node('GoLineSpark');
            node.layer = line.layer;
            node.setParent(parent);
            node.setPosition(sx, sy);
            node.angle = Math.random() * 360;

            const size = SPARK_SIZE_MIN + Math.random() * SPARK_SIZE_RAND;
            node.addComponent(UITransform).setContentSize(size, size);
            const sp = node.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = frame;
            sp.color       = SPARK_COLOR;
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] }
            });
            const op = node.addComponent(UIOpacity);
            op.opacity = 0;

            const rise  = SPARK_RISE_MIN + Math.random() * SPARK_RISE_RAND;
            const delay = t * durationS * 0.8 + Math.random() * 0.06;
            const tFly  = 0.45 + Math.random() * 0.25;
            tween(node)
                .delay(delay)
                .to(tFly, { position: new Vec3(sx + (Math.random() - 0.5) * 24, sy + rise, 0) }, { easing: 'quadOut' })
                .call(() => { if (node.isValid) node.destroy(); })
                .start();
            tween(op)
                .delay(delay)
                .to(0.10, { opacity: 230 })
                .to(tFly - 0.10, { opacity: 0 })
                .start();
        }
    }

    /** Bare copy of the line's sprite (UITransform + Sprite, CUSTOM size before frame). */
    private static _cloneLineSprite(line: Node, name: string): Node {
        const node = new Node(name);
        node.layer = line.layer;
        const srcUit = line.getComponent(UITransform);
        const srcSp  = line.getComponent(Sprite);
        const uit = node.addComponent(UITransform);
        if (srcUit) {
            uit.setContentSize(srcUit.contentSize);
            uit.setAnchorPoint(srcUit.anchorPoint);
        }
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        if (srcSp) {
            sp.spriteFrame = srcSp.spriteFrame;
            sp.color       = srcSp.color.clone();
        }
        node.setScale(line.scale);
        return node;
    }
}
