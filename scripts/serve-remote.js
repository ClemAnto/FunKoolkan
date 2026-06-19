#!/usr/bin/env node
// Starts a local static server for quick testing.
// Usage: npm run serve  (or: node scripts/serve-remote.js [build-dir])

const { spawn }      = require('child_process');
const fs             = require('fs');
const path           = require('path');
const { patchHtml }  = require('./patch-html');

const PORT = 8080;
const ROOT = path.resolve(__dirname, '..');
const buildArg = process.argv[2];

function findBuildDir() {
    if (buildArg) return path.join(ROOT, buildArg);
    const candidates = fs.readdirSync(ROOT)
        .filter(n => /^build\d*$/.test(n))
        .map(n => path.join(ROOT, n, 'web-mobile'))
        .filter(p => fs.existsSync(path.join(p, 'index.html')));
    if (!candidates.length) { console.error('No build*/web-mobile/index.html found.'); process.exit(1); }
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0];
}

const buildDir = findBuildDir();
console.log(`Serving: ${buildDir}`);

(function injectVersion() {
    const pkg       = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const version   = pkg.version ?? '?';
    const indexPath = path.join(buildDir, 'index.html');
    const html      = fs.readFileSync(indexPath, 'utf8');
    const patched   = patchHtml(html, version);
    if (patched !== html) fs.writeFileSync(indexPath, patched, 'utf8');
})();

console.log(`\n  http://localhost:${PORT}\n`);

const server = spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'inherit', shell: true, cwd: buildDir });

process.on('SIGINT',  () => server.kill());
process.on('SIGTERM', () => server.kill());
