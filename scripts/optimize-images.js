/**
 * One-shot PNG optimizer (npm run optimize:images).
 *
 * - Palette-quantizes every PNG in-place (PNG8 + Floyd-Steinberg dithering via
 *   sharp/libimagequant). Filenames and UUIDs are untouched, so scenes/meta
 *   need no changes and Cocos reimports transparently.
 * - Resizes ONLY the particle textures (code always sizes them via
 *   setContentSize, so the source resolution is free to shrink): max 512px.
 * - A file is replaced only if the optimized version is >10% smaller.
 * - Higher palette quality for soft-gradient particles to avoid banding under
 *   additive blending.
 *
 * Re-runnable: already-optimized files simply won't shrink further and are skipped.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['assets', 'build-templates'];

// dir substring → options (first match wins)
const RULES = [
    { match: `particles${path.sep}`,     resizeMax: 512,  quality: 95 },  // soft glows: shrink + gentle palette
    { match: `illustrations${path.sep}`, resizeMax: 768,  quality: 90 },  // shown on ~600px panels: heavily oversized
    { match: `menu${path.sep}`,          resizeMax: 1440, quality: 88 },  // full-screen menu bg: modest downscale
    { match: `background${path.sep}`,    resizeMax: 1440, quality: 88 },  // full-screen game bg: modest downscale
    { match: `warriors${path.sep}`,      resizeMax: 1024, quality: 90 },  // runtime-sliced sheets (rects = tex/grid): frames 512→256-341, displayed ≤~288px
    { match: '', resizeMax: 0, quality: 85 },                             // everything else: quantize only
];

function* walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (e.isFile() && p.toLowerCase().endsWith('.png')) yield p;
    }
}

(async () => {
    let totBefore = 0, totAfter = 0, changed = 0, skipped = 0;
    const rows = [];
    for (const scanDir of SCAN_DIRS) {
        const abs = path.join(ROOT, scanDir);
        if (!fs.existsSync(abs)) continue;
        for (const file of walk(abs)) {
            const before = fs.statSync(file).size;
            const rule = RULES.find(r => file.includes(r.match));
            try {
                let img = sharp(file);
                const meta = await img.metadata();
                if (rule.resizeMax && Math.max(meta.width, meta.height) > rule.resizeMax) {
                    img = img.resize({ width: rule.resizeMax, height: rule.resizeMax, fit: 'inside' });
                }
                const buf = await img.png({ palette: true, quality: rule.quality, effort: 10, compressionLevel: 9 }).toBuffer();
                totBefore += before;
                if (buf.length < before * 0.9) {
                    fs.writeFileSync(file, buf);
                    totAfter += buf.length;
                    changed++;
                    if (before > 100 * 1024) {
                        rows.push(`  ${(before / 1048576).toFixed(2).padStart(6)} -> ${(buf.length / 1048576).toFixed(2).padStart(5)} MB  ${path.relative(ROOT, file)}`);
                    }
                } else {
                    totAfter += before;
                    skipped++;
                }
            } catch (e) {
                totBefore += before; totAfter += before; skipped++;
                console.warn(`SKIP (error) ${path.relative(ROOT, file)}: ${e.message}`);
            }
        }
    }
    if (rows.length) console.log('Files >100KB optimized:\n' + rows.join('\n'));
    console.log(`\nPNG total: ${(totBefore / 1048576).toFixed(1)} MB -> ${(totAfter / 1048576).toFixed(1)} MB  (${changed} optimized, ${skipped} skipped)`);
})();
