import { Node, Vec2, Vec3, Color, ParticleSystem2D, SpriteFrame, resources } from 'cc';

// Authored textures, loaded LAZILY on the first explosion (runtime) — never as a module-eval side effect,
// so they can't run in the editor and disturb script registration / @executeInEditMode (e.g. FitScale).
//  - rock fragments: rock_01 / rock_02, picked at RANDOM per burst.
//  - dust cloud: dust_02 (the dust burst is skipped until that texture is present).
const ROCK_FRAMES = ['particles/rock_01/spriteFrame', 'particles/rock_02/spriteFrame'];
const DUST_FRAME = 'particles/dust_02/spriteFrame';
const _rocks: SpriteFrame[] = [];
let _dust: SpriteFrame | null = null;
let _loading = false;
function ensureFrames(): void {
    if (_loading) return;
    _loading = true;
    for (let i = 0; i < ROCK_FRAMES.length; i++) {
        resources.load(ROCK_FRAMES[i], SpriteFrame, (e, f) => { if (!e && f) _rocks.push(f); });
    }
    resources.load(DUST_FRAME, SpriteFrame, (e, f) => { if (!e && f) _dust = f; });
}

/** Uniform random in [min, max) — each burst varies a little so explosions don't look stamped. */
function rand(min: number, max: number): number { return min + Math.random() * (max - min); }

/**
 * StoneExplosion — the burst played when a Stone is destroyed (bomb blast, the SCOSSA): rock fragments
 * thrown up (rock_01/rock_02, random) plus a little dust cloud (dust_02), as one-shot `ParticleSystem2D`s
 * that remove themselves when done.
 *
 * NOTE: per the project's editor-first rule a particle effect should be an AUTHORED prefab; this is a CODE
 * PLACEHOLDER using authored textures, meant to be replaced. When prefabs exist, `play()` just instantiates them.
 */
export class StoneExplosion {
    /** Load the particle textures up front (call once at game start) so the FIRST explosion is already textured. */
    static preload(): void { ensureFrames(); }

    /** Spawn the burst (fragments + dust) at a stone's on-screen spot (under its layer, matching its depth scale). */
    static play(parent: Node | null, worldPos: Readonly<Vec3>, worldScale: Readonly<Vec3>): void {
        if (!parent?.isValid) return;
        ensureFrames();

        // 1. rock fragments — fast, upward cone, gravity arc, sharp
        const rock = StoneExplosion._make(parent, worldPos, worldScale, 'StoneFragments');
        if (_rocks.length) rock.spriteFrame = _rocks[Math.floor(Math.random() * _rocks.length)];
        rock.totalParticles = Math.round(rand(18, 26));   // a few more/fewer fragments each time
        rock.duration = 0.08; rock.emissionRate = 320;
        rock.life = 0.5; rock.lifeVar = 0.2;
        rock.angle = 90; rock.angleVar = 80;
        rock.speed = 180; rock.speedVar = 90;
        rock.gravity = new Vec2(0, -600);
        rock.startSize = 14; rock.startSizeVar = 6; rock.endSize = 3;
        rock.startColor = new Color(255, 255, 255, 255);
        rock.endColor = new Color(255, 255, 255, 0);
        rock.autoRemoveOnFinish = true;
        rock.resetSystem();

        // 2. dust cloud — slow, all directions, grows and fades (only when the dust texture is present)
        if (_dust) {
            const dust = StoneExplosion._make(parent, worldPos, worldScale, 'DustPuff');
            dust.spriteFrame = _dust;
            dust.totalParticles = Math.round(rand(6, 12));   // a denser/thinner puff each time
            dust.duration = 0.1; dust.emissionRate = 120;
            dust.life = rand(0.7, 1.2); dust.lifeVar = 0.3;   // lingers a bit longer/shorter each time
            dust.angle = 90; dust.angleVar = 180;     // puff in every direction
            dust.speed = 26; dust.speedVar = 16;       // slow drift
            dust.gravity = new Vec2(0, -30);           // settles gently
            const dustStart = rand(24, 34);            // a bigger/smaller cloud each time
            dust.startSize = dustStart; dust.startSizeVar = 10; dust.endSize = dustStart * rand(2.0, 2.6);   // expands as it fades
            dust.startColor = new Color(255, 255, 255, 150);
            dust.endColor = new Color(255, 255, 255, 0);
            dust.autoRemoveOnFinish = true;
            dust.resetSystem();
        }
    }

    /** Create a one-shot ParticleSystem2D node at the given world transform (caller fills the emitter config). */
    private static _make(parent: Node, worldPos: Readonly<Vec3>, worldScale: Readonly<Vec3>, name: string): ParticleSystem2D {
        const n = new Node(name);
        n.layer = parent.layer;
        n.setParent(parent);
        n.setWorldPosition(worldPos as Vec3);
        n.setWorldScale(worldScale.x, worldScale.y, 1);
        const ps = n.addComponent(ParticleSystem2D);
        ps.custom = true;   // use the inline emitter settings, not a .plist
        return ps;
    }
}
