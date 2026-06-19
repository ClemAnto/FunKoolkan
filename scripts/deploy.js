#!/usr/bin/env node
// Deploys build/web-mobile to GitHub Pages (gh-pages branch).
// Uses a temp git repo to bypass .gitignore (which excludes native/ and build/).

const { execSync }  = require('child_process');
const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { patchHtml } = require('./patch-html');

const ROOT      = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build', 'web-mobile');
const INDEX     = path.join(BUILD_DIR, 'index.html');

if (!fs.existsSync(INDEX)) {
    console.error('No build/web-mobile/index.html found — build first with Cocos Creator.');
    process.exit(1);
}

// Inject version + cache-bust script URLs
const pkg     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version ?? '?';
const html    = fs.readFileSync(INDEX, 'utf8');
const patched = patchHtml(html, version);
if (patched !== html) {
    fs.writeFileSync(INDEX, patched, 'utf8');
    console.log(`Version injected + cache-busted: v${version}`);
}

// .nojekyll prevents GitHub Pages from running Jekyll on Cocos assets
fs.writeFileSync(path.join(BUILD_DIR, '.nojekyll'), '');

// Resolve remote URL (inherits auth from git credential store)
const remoteUrl = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();

// Work in a temp dir outside the repo so no .gitignore applies
const TMP = path.join(os.tmpdir(), 'funkoolkan-gh-deploy');
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP);

console.log(`Deploying v${version} → GitHub Pages...`);

try {
    // Copy entire build to temp dir
    fs.cpSync(BUILD_DIR, TMP, { recursive: true });

    // Init fresh git repo and push to gh-pages branch
    const git = (cmd) => execSync(`git ${cmd}`, { cwd: TMP, stdio: 'pipe', encoding: 'utf8' });
    git('init');
    git('config user.email "deploy@funkoolkan.local"');
    git('config user.name "FunKoolkan Deploy"');
    git('add -A');
    git(`commit -m "deploy: v${version}"`);
    execSync(`git push -f "${remoteUrl}" HEAD:gh-pages`, { cwd: TMP, stdio: 'inherit' });

    console.log(`Done! → https://clemanto.github.io/FunKoolkan/`);
} finally {
    fs.rmSync(TMP, { recursive: true, force: true });
}
