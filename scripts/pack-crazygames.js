#!/usr/bin/env node
// Build + zip a CrazyGames submission package.
//
// CrazyGames hosts the game on their own domain, so the deliverable is a ZIP of
// the web-mobile build (NOT a public URL). This script:
//   1. flips PORTAL to 'crazygames' in PortalConfig.ts (temporarily),
//   2. runs the same headless web-mobile build as scripts/build.js,
//   3. ALWAYS restores PortalConfig.ts (even if the build fails),
//   4. zips build/web-mobile -> dist/funwarriors-crazygames.zip via PowerShell.
//
// The standalone GitHub Pages flow is untouched: PORTAL stays 'none' in git.

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { patchHtml } = require('./patch-html');

const CC_EXE  = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe';
const PROJECT = path.resolve(__dirname, '..');
const CONFIG  = path.join(PROJECT, 'assets', 'scripts', 'config', 'PortalConfig.ts');
const BUILD   = path.join(PROJECT, 'build', 'web-mobile');
const DIST    = path.join(PROJECT, 'dist');
const ZIP     = path.join(DIST, 'funwarriors-crazygames.zip');

const FLAG_RE = /export const PORTAL: PortalKind = '[^']*';/;

function setPortal(value) {
    const src = fs.readFileSync(CONFIG, 'utf8');
    if (!FLAG_RE.test(src)) throw new Error('PORTAL flag line not found in PortalConfig.ts');
    fs.writeFileSync(CONFIG, src.replace(FLAG_RE, `export const PORTAL: PortalKind = '${value}';`));
}

const original = fs.readFileSync(CONFIG, 'utf8');

try {
    console.log("Setting PORTAL = 'crazygames'...");
    setPortal('crazygames');

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
    // Restore the committed flag no matter what, so git never carries 'crazygames'.
    fs.writeFileSync(CONFIG, original);
    console.log('PortalConfig.ts restored.');
}

if (!fs.existsSync(BUILD)) {
    console.error(`Build output not found at ${BUILD}`);
    process.exit(1);
}

// Patch index.html: replace __VERSION__ in the loading screen + cache-bust script URLs.
// build.js alone does NOT do this (only serve/deploy did) — so the CrazyGames build used to
// show the literal "v__VERSION__" during preload.
const INDEX = path.join(BUILD, 'index.html');
if (fs.existsSync(INDEX)) {
    const pkg     = JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));
    const version = pkg.version ?? '?';
    const html    = fs.readFileSync(INDEX, 'utf8');
    const patched = patchHtml(html, version);
    if (patched !== html) {
        fs.writeFileSync(INDEX, patched, 'utf8');
        console.log(`Version injected + cache-busted: v${version}`);
    }
}

fs.mkdirSync(DIST, { recursive: true });
if (fs.existsSync(ZIP)) fs.rmSync(ZIP);

console.log('Zipping build output...');
// Zip the CONTENTS of web-mobile (index.html at the zip root — CrazyGames expects this).
// Use pwsh (PowerShell 7), NOT legacy `powershell` (5.1): 5.1's Compress-Archive writes
// backslash entry paths that violate the ZIP spec and break extraction on Linux servers.
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const zipExe = fs.existsSync(PWSH) ? PWSH : 'powershell';
if (zipExe === 'powershell') {
    console.warn('WARNING: pwsh (PowerShell 7) not found — falling back to powershell 5.1, whose');
    console.warn('         Compress-Archive writes backslash paths that portals may reject. Install PowerShell 7.');
}
const zipResult = spawnSync(zipExe, [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${BUILD}\\*' -DestinationPath '${ZIP}' -Force`,
], { stdio: 'inherit' });

if ((zipResult.status ?? -1) !== 0) {
    console.error('Zip FAILED');
    process.exit(1);
}

console.log(`\nCrazyGames package ready: ${ZIP}`);
console.log('Upload this ZIP in the CrazyGames developer QA tool.');
