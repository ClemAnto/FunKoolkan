#!/usr/bin/env node
'use strict';

/**
 * Injects the in-gameplay onboarding hints into Game.scene (CrazyGames: teach via visuals,
 * skippable, no separate tutorial scene). Idempotent-ish: aborts if 'Onboarding' already exists.
 *
 *   node scripts/add-onboarding-hints.js
 *
 * Adds, as PLAIN scene nodes (no prefab instance — _prefab:null), under UILayer:
 *   Onboarding (OnboardingHints component)
 *     ├─ AimHint  (UIOpacity)         "Drag down & release"
 *     │    ├─ Hand   (Sprite placeholder — swap with a hand/arrow PNG in the editor)
 *     │    └─ AimLabel (Label)
 *     └─ MergeHint (UIOpacity)        "Match 2 of a kind to merge!"
 *          └─ MergeLabel (Label)
 * Then wires: OnboardingHints.aimHint/aimHand/mergeHint, and GameManager.onboarding.
 * AimHint/MergeHint are authored ACTIVE — OnboardingHints.start() hides them at runtime
 * (same active-in-editor pattern as the modal panels; see COCOS.md).
 *
 * A timestamped .bak of the scene is written first. Validate with `npm run pack:crazygames`.
 * NOTE: if Cocos has Game.scene open, reload it after running (Cocos will prompt on disk change).
 */

const fs = require('fs');
const path = require('path');

const SCENE = path.resolve(__dirname, '..', 'assets', 'scenes', 'Game.scene');

// Asset / script UUIDs (from .meta files).
const FONT     = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';        // MedievalSharp TTF
const SF_WHITE = '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941';  // builtin white (Hand placeholder)
const UUID_ONBOARDING = 'e5bd1b55-f3bd-439c-8627-72726ceaca5f'; // OnboardingHints.ts
const UUID_GAMEMANAGER = '87d2520b-1b40-48b8-a1eb-d104c989fafc'; // GameManager.ts
const UI_LAYER = 33554432;

// ── Cocos UUID compression (full hex → short script __type__) ──────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    let out = hex.slice(0, 5);
    const rest = hex.slice(5);
    for (let i = 0; i < rest.length; i += 3) {
        const h1 = parseInt(rest[i], 16), h2 = parseInt(rest[i + 1], 16), h3 = parseInt(rest[i + 2], 16);
        out += B64[(h1 << 2) | (h2 >> 2)];
        out += B64[((h2 & 3) << 4) | h3];
    }
    return out;
}
const ONBOARDING_TYPE = compressUuid(UUID_ONBOARDING);
const GAMEMANAGER_TYPE = compressUuid(UUID_GAMEMANAGER);

const arr = JSON.parse(fs.readFileSync(SCENE, 'utf8'));
if (arr.some(o => o && o.__type__ === 'cc.Node' && o._name === 'Onboarding')) {
    console.error("'Onboarding' node already present — revert the scene first to re-run. Aborting.");
    process.exit(1);
}
const findNode = (name) => arr.findIndex(o => o && o.__type__ === 'cc.Node' && o._name === name);
const uiLayerId = findNode('UILayer');
if (uiLayerId < 0) { console.error('UILayer node not found'); process.exit(1); }
const gmCompId = arr.findIndex(o => o && o.__type__ === GAMEMANAGER_TYPE);
if (gmCompId < 0) { console.error('GameManager component not found in scene'); process.exit(1); }

// ── Builders (emit scene-format objects, push to arr, return their index) ──────
let _idc = 0;
const sid = (tag) => (tag + '0'.repeat(22)).slice(0, 20) + (_idc++).toString(36);
const col = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
const ref = (i) => ({ __id__: i });

function pushNode(name, parentIdx, pos = [0, 0, 0], scale = [1, 1, 1], active = true) {
    const idx = arr.length;
    arr.push({
        __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
        _parent: ref(parentIdx), _children: [], _active: active, _components: [],
        _prefab: null,
        _lpos: { __type__: 'cc.Vec3', x: pos[0], y: pos[1], z: pos[2] || 0 },
        _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: 'cc.Vec3', x: scale[0], y: scale[1], z: scale[2] || 1 },
        _mobility: 0, _layer: UI_LAYER,
        _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
        _id: sid('ObN'),
    });
    return idx;
}
function pushComp(type, ownerIdx, props) {
    const idx = arr.length;
    arr.push({
        __type__: type, _name: '', _objFlags: 0, __editorExtras__: {},
        node: ref(ownerIdx), _enabled: true, __prefab: null,
        ...props, _id: sid('ObC'),
    });
    arr[ownerIdx]._components.push(ref(idx));
    return idx;
}
const addChildRef = (parentIdx, childIdx) => arr[parentIdx]._children.push(ref(childIdx));

function uiTransform(nodeIdx, w, h, anchor = [0.5, 0.5]) {
    return pushComp('cc.UITransform', nodeIdx, {
        _contentSize: { __type__: 'cc.Size', width: w, height: h },
        _anchorPoint: { __type__: 'cc.Vec2', x: anchor[0], y: anchor[1] },
    });
}
function uiOpacity(nodeIdx, opacity = 255) {
    return pushComp('cc.UIOpacity', nodeIdx, { _opacity: opacity });
}
function sprite(nodeIdx, sf, c = col(255, 255, 255), type = 0, sizeMode = 2) {
    return pushComp('cc.Sprite', nodeIdx, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c,
        _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
        _type: type, _fillType: 0, _sizeMode: sizeMode,
        _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
        _isTrimmedMode: true, _useGrayscale: false, _atlas: null,
    });
}
function label(nodeIdx, str, fontSize, c = col(255, 255, 255), o = {}) {
    return pushComp('cc.Label', nodeIdx, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c, _string: str,
        _horizontalAlign: o.hAlign ?? 1, _verticalAlign: o.vAlign ?? 1,
        _actualFontSize: fontSize, _fontSize: fontSize, _fontFamily: 'Arial',
        _lineHeight: o.lineHeight ?? Math.round(fontSize * 1.35),
        _overflow: o.overflow ?? 0, _enableWrapText: o.wrap ?? false,
        _font: { __uuid__: FONT, __expectedType__: 'cc.TTFFont' }, _isSystemFontUsed: false,
        _spacingX: 0, _isItalic: false, _isBold: !!o.bold, _isUnderline: false,
        _underlineHeight: 2, _cacheMode: 0, _enableOutline: !!o.outline,
        _outlineColor: col(0, 0, 0, 220), _outlineWidth: o.outlineWidth ?? 3,
        _enableShadow: false, _shadowColor: col(0, 0, 0, 255),
        _shadowOffset: { __type__: 'cc.Vec2', x: 0, y: -2 }, _shadowBlur: 4,
    });
}

// ── Onboarding container under UILayer ─────────────────────────────────────────
const onbIdx = pushNode('Onboarding', uiLayerId);
addChildRef(uiLayerId, onbIdx);
uiTransform(onbIdx, 720, 1280);
// OnboardingHints component (refs filled in after children are built).

// AimHint — control gesture hint near the launcher (bottom-centre).
const aimIdx = pushNode('AimHint', onbIdx, [0, -250, 0]);
addChildRef(onbIdx, aimIdx);
uiTransform(aimIdx, 420, 220);
uiOpacity(aimIdx, 255);

const handIdx = pushNode('Hand', aimIdx, [0, 45, 0]);
addChildRef(aimIdx, handIdx);
uiTransform(handIdx, 64, 64);
sprite(handIdx, SF_WHITE, col(255, 212, 50, 255), 0 /* SIMPLE */, 2 /* CUSTOM size */);

const aimLblIdx = pushNode('AimLabel', aimIdx, [0, -55, 0]);
addChildRef(aimIdx, aimLblIdx);
uiTransform(aimLblIdx, 420, 70);
label(aimLblIdx, 'Drag down & release', 36, col(255, 255, 255), { bold: true, outline: true });

// MergeHint — goal hint (upper-middle), auto-dismissed.
const mergeIdx = pushNode('MergeHint', onbIdx, [0, 260, 0]);
addChildRef(onbIdx, mergeIdx);
uiTransform(mergeIdx, 560, 120);
uiOpacity(mergeIdx, 255);

const mergeLblIdx = pushNode('MergeLabel', mergeIdx, [0, 0, 0]);
addChildRef(mergeIdx, mergeLblIdx);
uiTransform(mergeLblIdx, 560, 120);
label(mergeLblIdx, 'Match 2 of a kind to merge!', 38, col(255, 220, 50), { bold: true, outline: true, wrap: true });

// ── OnboardingHints component on the container, wired ──────────────────────────
const onbCompId = pushComp(ONBOARDING_TYPE, onbIdx, {
    aimHint: ref(aimIdx),
    aimHand: ref(handIdx),
    mergeHint: ref(mergeIdx),
    handBob: 70,
    mergeHoldSec: 3,
});

// ── Wire GameManager.onboarding → the OnboardingHints component ─────────────────
arr[gmCompId].onboarding = ref(onbCompId);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(path.resolve(__dirname, '..', `Game.scene.${stamp}.bak`), fs.readFileSync(SCENE));
fs.writeFileSync(SCENE, JSON.stringify(arr, null, 2));
console.log('Onboarding hints injected into Game.scene (backup written).');
console.log(`  Onboarding #${onbIdx} under UILayer #${uiLayerId}, component #${onbCompId}; GameManager #${gmCompId}.onboarding wired.`);
