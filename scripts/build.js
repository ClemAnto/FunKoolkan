#!/usr/bin/env node
// Headless Cocos Creator build for web-mobile.
// CRITICAL: must unset ELECTRON_RUN_AS_NODE before spawning, otherwise CC runs as Node.js.
// Exit codes 0 and 36 are both success (36 = success with warnings, normal for CC).

const { spawnSync } = require('child_process');
const path = require('path');

const CC_EXE  = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe';
const PROJECT = path.resolve(__dirname, '..');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.log('Building web-mobile (headless)...');

const result = spawnSync(CC_EXE, [
    '--project', PROJECT,
    '--build', 'outputName=web-mobile;platform=web-mobile;debug=false;md5Cache=true;nativeCodeBundleMode=wasm;useSplashScreen=false',
], { env, stdio: 'inherit' });

const code = result.status ?? -1;
if (code === 0 || code === 36) {
    console.log(`Build OK (exit ${code})`);
    process.exit(0);
} else {
    console.error(`Build FAILED (exit ${code})`);
    process.exit(1);
}
