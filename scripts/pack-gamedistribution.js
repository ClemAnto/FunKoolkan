#!/usr/bin/env node
// Build + zip a GameDistribution submission package.
//
// GameDistribution distributes the game across its network; the deliverable is a ZIP
// of the web-mobile build uploaded in the GD developer panel. This script:
//   1. flips PORTAL to 'gamedistribution' in PortalConfig.ts (temporarily),
//   2. runs the same headless web-mobile build as scripts/build.js,
//   3. ALWAYS restores PortalConfig.ts (even if the build fails),
//   4. zips build/web-mobile -> dist/funwarriors-gamedistribution.zip via PowerShell.
//
// The standalone GitHub Pages flow is untouched: PORTAL stays 'none' in git.
//
// NB: set GAMEDISTRIBUTION_GAME_ID in PortalConfig.ts to the real GD game id
// (assigned in the developer panel) before the ZIP is fit for production ads.

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { patchHtml } = require('./patch-html');

// GameDistribution §3.4: portrait games must lock orientation or instruct the user to
// rotate. A real screen.orientation.lock() is unreliable inside GD's iframe (needs
// fullscreen, often blocked), so we inject a CSS-gated "rotate your device" overlay —
// the standard web approach. It shows ONLY on touch devices in landscape:
//   (hover: none) and (pointer: coarse)  → phones/tablets, never desktop (hover:hover/pointer:fine)
//   (orientation: landscape)             → iframe wider than tall = device held sideways
// Self-contained (no external assets), so it never trips GD's no-external-hosting rule.
const ROTATE_STYLE = `
<style id="fw-rotate-style">
#fw-rotate{display:none;}
@media (orientation:landscape) and (hover:none) and (pointer:coarse){
  #fw-rotate{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:24px;background:#0e1116;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px;}
  #fw-rotate .fw-phone{width:64px;height:104px;border:5px solid #fff;border-radius:12px;
    animation:fw-rot 1.6s ease-in-out infinite;}
  #fw-rotate p{margin:0;font-size:20px;font-weight:600;letter-spacing:.3px;max-width:320px;line-height:1.4;}
  @keyframes fw-rot{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
}
</style>`;
const ROTATE_NODE = `
<div id="fw-rotate"><div class="fw-phone"></div><p>Please rotate your device to portrait</p></div>`;

/** Inject the rotate-to-portrait overlay into the GD build's index.html (idempotent). */
function injectRotateOverlay(html) {
    if (html.includes('id="fw-rotate"')) return html;
    if (html.includes('</head>')) html = html.replace('</head>', `${ROTATE_STYLE}\n</head>`);
    if (html.includes('</body>')) html = html.replace('</body>', `${ROTATE_NODE}\n</body>`);
    return html;
}

const CC_EXE  = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe';
const PROJECT = path.resolve(__dirname, '..');
const CONFIG  = path.join(PROJECT, 'assets', 'scripts', 'config', 'PortalConfig.ts');
const BUILD   = path.join(PROJECT, 'build', 'web-mobile');
const DIST    = path.join(PROJECT, 'dist');
const ZIP     = path.join(DIST, 'funwarriors-gamedistribution.zip');

const FLAG_RE = /export const PORTAL: PortalKind = '[^']*';/;

function setPortal(value) {
    const src = fs.readFileSync(CONFIG, 'utf8');
    if (!FLAG_RE.test(src)) throw new Error('PORTAL flag line not found in PortalConfig.ts');
    fs.writeFileSync(CONFIG, src.replace(FLAG_RE, `export const PORTAL: PortalKind = '${value}';`));
}

const original = fs.readFileSync(CONFIG, 'utf8');

if (original.includes("GD_GAME_ID_PLACEHOLDER")) {
    console.warn('WARNING: GAMEDISTRIBUTION_GAME_ID is still the placeholder — ads will be no-op until you set the real GD game id.');
}

try {
    console.log("Setting PORTAL = 'gamedistribution'...");
    setPortal('gamedistribution');

    console.log('Building web-mobile (headless)...');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(CC_EXE, [
        '--project', PROJECT,
        '--build', 'outputName=web-mobile;platform=web-mobile;debug=false;md5Cache=true;nativeCodeBundleMode=wasm;useSplashScreen=false',
    ], { env, stdio: 'inherit' });

    const code = result.status ?? -1;
    if (code !== 0 && code !== 36) throw new Error(`Build FAILED (exit ${code})`);
    console.log(`Build OK (exit ${code})`);
} finally {
    // Restore the committed flag no matter what, so git never carries 'gamedistribution'.
    fs.writeFileSync(CONFIG, original);
    console.log('PortalConfig.ts restored.');
}

if (!fs.existsSync(BUILD)) {
    console.error(`Build output not found at ${BUILD}`);
    process.exit(1);
}

// Patch index.html: replace __VERSION__ in the loading screen + cache-bust script URLs.
const INDEX = path.join(BUILD, 'index.html');
if (fs.existsSync(INDEX)) {
    const pkg     = JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));
    const version = pkg.version ?? '?';
    const html    = fs.readFileSync(INDEX, 'utf8');
    const patched = injectRotateOverlay(patchHtml(html, version));
    if (patched !== html) {
        fs.writeFileSync(INDEX, patched, 'utf8');
        console.log(`Version injected + cache-busted: v${version}; rotate overlay injected (mobile landscape)`);
    }
}

fs.mkdirSync(DIST, { recursive: true });
if (fs.existsSync(ZIP)) fs.rmSync(ZIP);

console.log('Zipping build output...');
// Zip the CONTENTS of web-mobile (index.html at the zip root — GD expects this).
// IMPORTANT: use pwsh (PowerShell 7), NOT the legacy `powershell` (5.1). Windows
// PowerShell 5.1's Compress-Archive writes entry paths with backslash separators,
// which violate the ZIP spec — GD's Linux server can't extract them and returns
// "Internal Server Error" on upload. PowerShell 7 fixed this (forward slashes).
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const zipExe = fs.existsSync(PWSH) ? PWSH : 'powershell';
if (zipExe === 'powershell') {
    console.warn('WARNING: pwsh (PowerShell 7) not found — falling back to powershell 5.1, whose');
    console.warn('         Compress-Archive writes backslash paths that GD may reject. Install PowerShell 7.');
}
const zipResult = spawnSync(zipExe, [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${BUILD}\\*' -DestinationPath '${ZIP}' -Force`,
], { stdio: 'inherit' });

if ((zipResult.status ?? -1) !== 0) {
    console.error('Zip FAILED');
    process.exit(1);
}

console.log(`\nGameDistribution package ready: ${ZIP}`);
console.log('Upload this ZIP in the GameDistribution developer panel (https://developer.gamedistribution.com).');
