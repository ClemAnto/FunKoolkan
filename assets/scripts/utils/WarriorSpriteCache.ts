import { Texture2D, SpriteFrame, Rect, resources } from 'cc';
import { WARRIOR_UUID_MAP } from './WarriorUUIDs';

/**
 * Loads warrior atlas sprites from assets/resources/warriors/ at startup.
 *
 * CC 3.8 stores assets by UUID internally — filename is not available at runtime.
 * WarriorUUIDs.ts maps each asset UUID to its atlas name (e.g. 'frog_2x2').
 * Regenerate it with "npm run gen:placeholders" after importing new sprites.
 *
 * Atlas name format: {speciesType}_{cols}x{rows}  (e.g. frog_2x2, wolf_2x3)
 * Grid layout: left-to-right, top-to-bottom → lv1, lv2, …
 */
export class WarriorSpriteCache {
    private static readonly _frames = new Map<string, SpriteFrame>();

    static preload(onDone: () => void): void {
        resources.loadDir('warriors', Texture2D, (err: Error | null, textures: Texture2D[]) => {
            if (!err && textures?.length) {
                for (const tex of textures) {
                    const baseUuid  = ((tex as any)._uuid ?? '').split('@')[0];
                    const atlasName = WARRIOR_UUID_MAP[baseUuid] ?? '';
                    const m = atlasName.match(/^(.+)_(\d+)x(\d+)$/);
                    if (!m) continue;

                    const [, speciesType, colsStr, rowsStr] = m;
                    const cols  = parseInt(colsStr, 10);
                    const rows  = parseInt(rowsStr, 10);
                    const cellW = tex.width  / cols;
                    const cellH = tex.height / rows;
                    let level = 1;
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const sf = new SpriteFrame();
                            sf.texture = tex;
                            sf.rect = new Rect(c * cellW, r * cellH, cellW, cellH);
                            sf.onLoaded();
                            WarriorSpriteCache._frames.set(`${speciesType}_lv${level}`, sf);
                            level++;
                        }
                    }
                }
            }
            onDone();
        });
    }

    static get(speciesType: string, level: number): SpriteFrame | null {
        return WarriorSpriteCache._frames.get(`${speciesType}_lv${level}`) ?? null;
    }
}
