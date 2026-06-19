#!/usr/bin/env node
'use strict';

// Seed the Firestore leaderboard (single-document model).
//
// The whole board lives in ONE doc (COLLECTION/DOCUMENT_ID) as an `entries` array.
// This script overwrites that doc with default entries via the Firestore REST API.
// Reads apiKey / projectId / collection / document id straight from
// assets/scripts/config/LeaderboardConfig.ts so it never drifts out of sync.
//
// Usage:
//   node scripts/seed-leaderboard.js          # seed defaults (refuses if board not empty)
//   node scripts/seed-leaderboard.js --force   # overwrite even if entries already exist
//   node scripts/seed-leaderboard.js --list     # just print the current board, write nothing

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ---- Default entries to seed -------------------------------------------------
// Name must match the leaderboard shape: exactly NAME_LEN uppercase letters ([A-Z]).
// Scores: 100000 down to 10000, step 10000. Round: starts at 10, drops every 2 places
// (10,10,9,9,8,8,7,7,6,6). Version: app version.
const APP_VERSION = (() => {
    try { return require(path.resolve(__dirname, '..', 'package.json')).version || '0.0.0'; }
    catch { return '0.0.0'; }
})();
const SEED_BASE_MS = 1_700_000_000_000;
const DEFAULT_ENTRIES = Array.from({ length: 10 }, (_, i) => ({
    name: 'FAN',
    score: 100000 - i * 10000,
    round: 10 - Math.floor(i / 2),
    version: APP_VERSION,
    createdAt: SEED_BASE_MS + i * 86_400_000,
}));

// ---- Pull config from LeaderboardConfig.ts ----------------------------------
const CONFIG_PATH = path.resolve(__dirname, '..', 'assets', 'scripts', 'config', 'LeaderboardConfig.ts');

function readConfig() {
    const src = fs.readFileSync(CONFIG_PATH, 'utf8');
    const pick = (re, label) => {
        const m = src.match(re);
        if (!m) throw new Error(`Could not find ${label} in ${CONFIG_PATH}`);
        return m[1];
    };
    return {
        apiKey:     pick(/apiKey:\s*'([^']+)'/, 'apiKey'),
        projectId:  pick(/projectId:\s*'([^']+)'/, 'projectId'),
        collection: pick(/COLLECTION\s*=\s*'([^']+)'/, 'COLLECTION'),
        documentId: pick(/DOCUMENT_ID\s*=\s*'([^']+)'/, 'DOCUMENT_ID'),
    };
}

// ---- Minimal HTTPS JSON helper ----------------------------------------------
function request(method, urlPath, bodyObj) {
    return new Promise((resolve, reject) => {
        const body = bodyObj ? JSON.stringify(bodyObj) : null;
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: urlPath,
            method,
            headers: body
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
                : {},
        }, res => {
            let data = '';
            res.on('data', c => (data += c));
            res.on('end', () => {
                let json = {};
                try { json = data ? JSON.parse(data) : {}; } catch { /* leave {} */ }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// ---- Firestore value (un)marshalling for our entry shape --------------------
function toEntryValue(e) {
    return { mapValue: { fields: {
        name:      { stringValue: e.name },
        score:     { integerValue: String(e.score) },
        round:     { integerValue: String(e.round) },
        version:   { stringValue: e.version },
        createdAt: { integerValue: String(e.createdAt) },
    } } };
}

function fromEntryValue(v) {
    const f = (v && v.mapValue && v.mapValue.fields) || {};
    return {
        name:    f.name?.stringValue ?? '???',
        score:   Number(f.score?.integerValue ?? 0),
        round:   Number(f.round?.integerValue ?? 1),
        version: f.version?.stringValue ?? '',
    };
}

function docPath(cfg) {
    return `projects/${cfg.projectId}/databases/(default)/documents/${cfg.collection}/${cfg.documentId}`;
}

async function readBoard(cfg) {
    const { status, json } = await request('GET', `/v1/${docPath(cfg)}?key=${cfg.apiKey}`);
    if (status === 404) return [];               // doc doesn't exist yet
    if (status !== 200) throw new Error(`read failed (HTTP ${status}): ${JSON.stringify(json)}`);
    const values = json.fields?.entries?.arrayValue?.values ?? [];
    return values.map(fromEntryValue).sort((a, b) => b.score - a.score);
}

async function writeBoard(cfg, entries) {
    const body = { fields: { entries: { arrayValue: { values: entries.map(toEntryValue) } } } };
    // PATCH without an updateMask replaces the whole document with these fields.
    const { status, json } = await request('PATCH', `/v1/${docPath(cfg)}?key=${cfg.apiKey}`, body);
    if (status !== 200) throw new Error(`write failed (HTTP ${status}): ${JSON.stringify(json)}`);
    return json.fields?.entries?.arrayValue?.values?.length ?? 0;
}

(async function main() {
    const args  = process.argv.slice(2);
    const force = args.includes('--force');
    const list  = args.includes('--list');

    const cfg = readConfig();
    console.log(`Project: ${cfg.projectId}  Doc: ${cfg.collection}/${cfg.documentId}`);

    const current = await readBoard(cfg);
    console.log(`Current entries: ${current.length}`);
    current.forEach((e, i) => console.log(`  ${String(i + 1).padStart(2)}. ${e.name}  ${e.score}  (round ${e.round}, v${e.version})`));

    if (list) return;

    if (current.length > 0 && !force) {
        console.log('\nBoard is not empty — nothing written. Re-run with --force to overwrite.');
        return;
    }

    console.log(`\nWriting ${DEFAULT_ENTRIES.length} default entries to ${cfg.collection}/${cfg.documentId}...`);
    const n = await writeBoard(cfg, DEFAULT_ENTRIES);
    console.log(`Wrote ${n} entries.`);
})().catch(err => {
    console.error('seed-leaderboard failed:', err.message);
    process.exit(1);
});
