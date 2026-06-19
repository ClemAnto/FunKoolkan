'use strict';
/**
 * Generates warrior atlas sprites — one PNG per species, all levels in a 2×N grid.
 * Pure Node.js — no external dependencies.
 * Output: assets/resources/warriors/{type}_{cols}x{rows}.png
 *
 * Grid layout (left-to-right, top-to-bottom):
 *   [lv1][lv2]
 *   [lv3][lv4]
 *   [lv5][lv6]  ← extra cells transparent if maxLevel is odd
 *
 * Usage: node scripts/gen-warrior-placeholders.js
 * To replace with final art: drop a real PNG with the same filename in
 * assets/resources/warriors/ then Refresh the Cocos Creator Assets panel.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const CELL = 256;   // pixel size of each level cell

// Per-cell drawing constants (y-down, origin = top-left of cell)
const CX      = CELL / 2;
const BODY_CY = 140; const BODY_R  = 80;
const HEAD_CY =  96; const HEAD_R  = 55;
const BASE_CY = 213; const BASE_RX = 67; const BASE_RY = 16;
const OUTLINE =   5;

const SPECIES = [
    { type: 'frog',    maxLevel: 4, rgb: [ 60, 190,  60] },
    { type: 'cat',     maxLevel: 4, rgb: [220, 130,  50] },
    { type: 'chicken', maxLevel: 4, rgb: [240, 210,  80] },
    { type: 'wolf',    maxLevel: 5, rgb: [110, 110, 130] },
    { type: 'eagle',   maxLevel: 5, rgb: [140,  90,  40] },
    { type: 'lion',    maxLevel: 6, rgb: [220, 170,  40] },
    { type: 'dragon',  maxLevel: 7, rgb: [130,  50, 180] },
];

function gridDims(maxLevel) {
    const cols = 2;
    const rows = Math.ceil(maxLevel / cols);
    return { cols, rows };
}

function samplePixel(px, py, baseRgb, level) {
    const lvBright  = (level - 1) * 18;
    const [r, g, b] = baseRgb.map(c => Math.min(255, c + lvBright));
    const lighter   = [r, g, b].map(c => Math.min(255, c + 55));
    const BLACK     = [0, 0, 0, 255];
    const TRANSP    = [0, 0, 0, 0];

    const hd = Math.hypot(px - CX, py - HEAD_CY);
    if (hd <= HEAD_R)           return [...lighter, 255];
    if (hd <= HEAD_R + OUTLINE) return BLACK;

    const bd = Math.hypot(px - CX, py - BODY_CY);
    if (bd <= BODY_R)           return [r, g, b, 255];
    if (bd <= BODY_R + OUTLINE) return BLACK;

    const ex  = (px - CX)      / BASE_RX;
    const ey  = (py - BASE_CY) / BASE_RY;
    const ed2 = ex * ex + ey * ey;
    if (ed2 <= 1.00) return [90, 55, 25, 255];
    if (ed2 <= 1.18) return BLACK;

    return TRANSP;
}

// ── PNG encoding (no external deps) ─────────────────────────────────────────

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const byte of buf) {
        c ^= byte;
        for (let i = 0; i < 8; i++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
    const t   = Buffer.from(type, 'ascii');
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
    const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
}

function encodePNG(raw, width, height) {
    const ihdr = Buffer.allocUnsafe(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', zlib.deflateSync(raw)),
        makeChunk('IEND', Buffer.alloc(0)),
    ]);
}

function renderAtlas(rgb, maxLevel, cols, rows) {
    const W      = CELL * cols;
    const H      = CELL * rows;
    const rowLen = 1 + W * 4;
    const raw    = Buffer.alloc(H * rowLen);
    for (let y = 0; y < H; y++) {
        const base    = y * rowLen;
        raw[base]     = 0;   // filter: None
        const cellRow = Math.floor(y / CELL);
        const py      = y % CELL;
        for (let x = 0; x < W; x++) {
            const cellCol = Math.floor(x / CELL);
            const px      = x % CELL;
            const level   = cellRow * cols + cellCol + 1;
            let pr = 0, pg = 0, pb = 0, pa = 0;
            if (level <= maxLevel) {
                [pr, pg, pb, pa] = samplePixel(px, py, rgb, level);
            }
            const i = base + 1 + x * 4;
            raw[i] = pr; raw[i + 1] = pg; raw[i + 2] = pb; raw[i + 3] = pa;
        }
    }
    return { raw, width: W, height: H };
}

// ── Generate ─────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'assets', 'resources', 'warriors');
fs.mkdirSync(outDir, { recursive: true });

// Remove old individual sprite files (e.g. frog_lv1.png)
const old = fs.readdirSync(outDir).filter(f => /_lv\d+\.png$/.test(f));
for (const f of old) {
    fs.unlinkSync(path.join(outDir, f));
    process.stdout.write(`  removed old: ${f}\n`);
}

let count = 0;
for (const { type, maxLevel, rgb } of SPECIES) {
    const { cols, rows }          = gridDims(maxLevel);
    const { raw, width, height }  = renderAtlas(rgb, maxLevel, cols, rows);
    const filename                = `${type}_${cols}x${rows}.png`;
    fs.writeFileSync(path.join(outDir, filename), encodePNG(raw, width, height));
    process.stdout.write(`  ${filename}  (${width}×${height}px, ${maxLevel} levels)\n`);
    count++;
}

console.log(`\n✓ ${count} atlas sprites → assets/resources/warriors/`);
console.log('  Apri Cocos Creator e fai Refresh del pannello Assets per importarli.');
console.log('  Per sostituire: sovrascivi il PNG con lo stesso nome e rifai Refresh.');

// ── Generate WarriorUUIDs.ts from .meta files ─────────────────────────────────
// Must run AFTER Cocos Creator has imported the PNGs (i.e. .meta files exist).
const uuidMap = {};
for (const { type, maxLevel } of SPECIES) {
    const { cols, rows } = gridDims(maxLevel);
    const atlasName = `${type}_${cols}x${rows}`;
    const metaFile  = path.join(outDir, `${atlasName}.png.meta`);
    if (fs.existsSync(metaFile)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            if (meta.uuid) {
                uuidMap[meta.uuid] = atlasName;
                process.stdout.write(`  uuid mapped: ${atlasName} → ${meta.uuid}\n`);
            }
        } catch (e) {
            console.warn(`  WARNING: could not parse ${metaFile}`);
        }
    } else {
        console.warn(`  WARNING: ${atlasName}.png.meta not found — import the PNG in Cocos Creator first`);
    }
}

const uuidsOut = path.join(__dirname, '..', 'assets', 'scripts', 'utils', 'WarriorUUIDs.ts');
const entries  = Object.entries(uuidMap)
    .map(([uuid, name]) => `    '${uuid}': '${name}',`)
    .join('\n');
fs.writeFileSync(uuidsOut,
`// Auto-generated by scripts/gen-warrior-placeholders.js — do not edit manually.
// Re-run "npm run gen:placeholders" after importing new sprites in Cocos Creator.
export const WARRIOR_UUID_MAP: Record<string, string> = {
${entries}
};
`);
console.log(`\n✓ WarriorUUIDs.ts updated (${Object.keys(uuidMap).length} entries)`);
