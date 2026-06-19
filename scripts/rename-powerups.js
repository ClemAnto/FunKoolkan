#!/usr/bin/env node
'use strict';

/**
 * One-shot rename: Genocide -> Brotherhood, BloodHood/Bloodhood -> WildRiver.
 * Whole-word, case-aware token map (longest-first) over .ts sources and docs.
 * Run file renames (.ts + .ts.meta) separately after this (see console hint).
 *   node scripts/rename-powerups.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Explicit token map. Order doesn't matter — we sort by key length desc before building the regex.
const MAP = {
    // --- Bloodhood / BH family -> WildRiver / WR ---
    'BloodhoodSparkleEffect': 'WildRiverSparkleEffect',
    'IBloodhoodSparkle': 'IWildRiverSparkle',
    'BloodhoodEffect': 'WildRiverEffect',
    '_launcherBloodhoodEffect': '_launcherWildRiverEffect',
    '_onBloodhoodContact': '_onWildRiverContact',
    'onBloodhoodContact': 'onWildRiverContact',
    'isBloodhoodAvailable': 'isWildRiverAvailable',
    'isBloodhoodEnabled': 'isWildRiverEnabled',
    'toggleBloodhood': 'toggleWildRiver',
    'bloodhoodEnabled': 'wildRiverEnabled',
    'bloodhoodSparkle': 'wildRiverSparkle',
    'BloodHood': 'WildRiver',
    'Bloodhood': 'WildRiver',
    'bloodhood': 'wildRiver',
    'isBHLauncher': 'isWRLauncher',
    '_bhLaunchWarrior': '_wrLaunchWarrior',
    '_bhLaunchEffect': '_wrLaunchEffect',
    '_bhCooldownLaunches': '_wrCooldownLaunches',
    '_bhsContactCbs': '_wrsContactCbs',
    '_bhsProxTimers': '_wrsProxTimers',
    '_bhsProxTimer': '_wrsProxTimer',
    '_bhsImplodeK': '_wrsImplodeK',
    '_bhsImploding': '_wrsImploding',
    '_bhsActive': '_wrsActive',
    '_bhsOrder': '_wrsOrder',
    '_applyBHS': '_applyWRS',
    '_cleanupBHS': '_cleanupWRS',
    '_onBHSSpread': '_onWRSSpread',
    '_startBHSCascade': '_startWRSCascade',
    '_tickBHSProximity': '_tickWRSProximity',
    'BHS_CONTACT_DELAY': 'WRS_CONTACT_DELAY',
    'BHS_PROX_INTERVAL': 'WRS_PROX_INTERVAL',
    'BHS_PROX_MARGIN': 'WRS_PROX_MARGIN',
    'BHSparkle': 'WRSparkle',
    'BH_BTN_H': 'WR_BTN_H',
    'BH_BTN_W': 'WR_BTN_W',
    'BH_CX': 'WR_CX',
    'BHS': 'WRS',
    'BH': 'WR',
    'Bh': 'Wr',
    // --- Genocide / GN family -> Brotherhood / Br ---
    'GenocideVortexEffect': 'BrotherhoodVortexEffect',
    'GenocideSparkleEffect': 'BrotherhoodSparkleEffect',
    'GenocideEffect': 'BrotherhoodEffect',
    '_triggerGenocideCascade': '_triggerBrotherhoodCascade',
    '_implodeGenocideWarrior': '_implodeBrotherhoodWarrior',
    '_tickGenocideProximity': '_tickBrotherhoodProximity',
    '_onGenocideContact': '_onBrotherhoodContact',
    'onGenocideContact': 'onBrotherhoodContact',
    '_genocideProxTimer': '_brotherhoodProxTimer',
    '_genocideCarrier': '_brotherhoodCarrier',
    '_genocideEffect': '_brotherhoodEffect',
    '_genocideTriggered': '_brotherhoodTriggered',
    '_expireGenocide': '_expireBrotherhood',
    'activateGenocide': 'activateBrotherhood',
    'genocideInfected': 'brotherhoodInfected',
    'Genocide': 'Brotherhood',
    'genocide': 'brotherhood',
    '_gnCooldownLaunches': '_brCooldownLaunches',
    '_gnCooldownMerges': '_brCooldownMerges',
    '_gnContactCbs': '_brContactCbs',
    '_gnTimerStarted': '_brTimerStarted',
    'GnVortex': 'BrVortex',
    'GN_BTN_H': 'BR_BTN_H',
    'GN_BTN_W': 'BR_BTN_W',
    'GN_BTN_Y': 'BR_BTN_Y',
    'GN_CX': 'BR_CX',
    'Gn': 'Br',
    // --- second pass: all-caps words, lowercase camelCase members, bare locals, snapshot keys ---
    'GENOCIDE': 'BROTHERHOOD',
    'BLOODHOOD': 'WILDRIVER',
    'bhLbl': 'wrLbl',
    'bhOn': 'wrOn',
    'bhPressed': 'wrPressed',
    'bhSfxs': 'wrSfxs',
    'bhsCb': 'wrsCb',
    'bhsW': 'wrsW',
    'gnCb': 'brCb',
    'gnLbl': 'brLbl',
    'gnPressed': 'brPressed',
    'gnMerges': 'brMerges',
    'bhs': 'wrs',
    'gns': 'brs',
    'bh': 'wr',
    'gn': 'br',
    'GN': 'BR',
    // --- third pass: all-caps constants with trailing underscore + GNSparkle/GNS ---
    'GENOCIDE_PROX_MARGIN': 'BROTHERHOOD_PROX_MARGIN',
    'GENOCIDE_CASCADE_DELAY': 'BROTHERHOOD_CASCADE_DELAY',
    'GENOCIDE_IMPLODE_HOLD': 'BROTHERHOOD_IMPLODE_HOLD',
    'GENOCIDE_EXPIRE_SEC': 'BROTHERHOOD_EXPIRE_SEC',
    'GENOCIDE_PROX_INTERVAL': 'BROTHERHOOD_PROX_INTERVAL',
    'GNSparkle': 'BRSparkle',
    'GNS': 'BRS',
};

const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp('(?<![A-Za-z0-9_])(' + keys.map(esc).join('|') + ')(?![A-Za-z0-9_])', 'g');

function collectTs(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) collectTs(p, out);
        else if (e.name.endsWith('.ts')) out.push(p);
    }
}
const files = [];
collectTs(path.join(ROOT, 'assets', 'scripts'), files);
for (const md of ['GDD.md', 'MEMO.md', 'TECH.md', 'ROADMAP.md', 'CLAUDE.md', 'COCOS.md']) {
    const p = path.join(ROOT, md);
    if (fs.existsSync(p)) files.push(p);
}

let totalFiles = 0, totalHits = 0;
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let hits = 0;
    const out = src.replace(RE, (m) => { hits++; return MAP[m]; });
    if (hits > 0) {
        fs.writeFileSync(f, out);
        totalFiles++; totalHits += hits;
        console.log(`  ${path.relative(ROOT, f)}: ${hits}`);
    }
}
console.log(`Done: ${totalHits} replacements across ${totalFiles} files.`);
console.log('Next: rename the 5 effect files (.ts + .ts.meta) — see the git mv block.');
