#!/usr/bin/env node
'use strict';

/**
 * Injects the in-game Privacy Policy UI into MainMenu.scene (CrazyGames user-consent
 * requirement). Idempotent-ish: aborts if a 'PrivacyPanelRoot' node already exists.
 *
 *   node scripts/add-privacy-panel.js
 *
 * Adds, as PLAIN scene nodes (no prefab instance — scene nodes use _prefab:null):
 *   - PrivacyPanelRoot (under Canvas): fullscreen Widget + UIOpacity(0) + BlockInputEvents
 *       + Dim (black) + Card (wood) + Title + Body label + Close button
 *   - PrivacyLink (child of the Version node, reusing its bottom-of-screen position):
 *       small button "Privacy Policy"
 *   - PrivacyPanel component on Canvas, wired: dialogNode=root, openButton=link,
 *       closeButton=close, textLabel=body.
 * The Card sits at the fullscreen root's local (0,0) = screen centre (deterministic,
 * no dependence on the scene's authored landscape coords).
 *
 * A timestamped .bak of the scene is written first. Validate with `npm run pack:crazygames`.
 */

const fs = require('fs');
const path = require('path');

const SCENE = path.resolve(__dirname, '..', 'assets', 'scenes', 'MainMenu.scene');

// Asset / script UUIDs (from .meta files).
const FONT      = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';        // MedievalSharp TTF
const SF_WOOD   = '57db0246-f3c2-41d8-b6e0-b8cb92486df7@f9941';  // hud/wood.png
const SF_BUTTON = '86b1400e-1472-4464-86e9-be88f5124ab5@f9941';  // hud/button.png
const SF_WHITE  = '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941';  // builtin white (dim)
const UUID_PRIVACY = 'a43e06dc-a8ed-481e-ab8a-d0eb84ee951a';     // PrivacyPanel.ts
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
const PRIVACY_TYPE = compressUuid(UUID_PRIVACY);

const arr = JSON.parse(fs.readFileSync(SCENE, 'utf8'));
if (arr.some(o => o && o.__type__ === 'cc.Node' && o._name === 'PrivacyPanelRoot')) {
    console.error('PrivacyPanelRoot already present — revert the scene first to re-run. Aborting.');
    process.exit(1);
}
const findNode = (name) => arr.findIndex(o => o && o.__type__ === 'cc.Node' && o._name === name);
const canvasId  = findNode('Canvas');
const versionId = findNode('Version');
if (canvasId < 0)  { console.error('Canvas node not found'); process.exit(1); }
const linkParentId = versionId >= 0 ? versionId : canvasId;

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
        _id: sid('PrivN'),
    });
    return idx;
}
function pushComp(type, ownerIdx, props) {
    const idx = arr.length;
    arr.push({
        __type__: type, _name: '', _objFlags: 0, __editorExtras__: {},
        node: ref(ownerIdx), _enabled: true, __prefab: null,
        ...props, _id: sid('PrivC'),
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
// Proven fullscreen Widget values copied from gen-ui-panels.js modal shell.
function widgetFullscreen(nodeIdx) {
    return pushComp('cc.Widget', nodeIdx, {
        _alignFlags: 45, _target: null,
        _left: 0, _right: 0, _top: 0, _bottom: 0, _horizontalCenter: 0, _verticalCenter: 0,
        _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
        _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
        _originalWidth: 0, _originalHeight: 0, _alignMode: 2, _lockFlags: 0,
    });
}
function sprite(nodeIdx, sf, c = col(255, 255, 255), type = 1) {
    return pushComp('cc.Sprite', nodeIdx, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c,
        _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
        _type: type, _fillType: 0, _sizeMode: 0,
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
function button(nodeIdx, sf = SF_BUTTON) {
    return pushComp('cc.Button', nodeIdx, {
        clickEvents: [], _interactable: true, _transition: 3,
        _normalColor: col(255, 255, 255), _hoverColor: col(240, 240, 240),
        _pressedColor: col(211, 211, 211), _disabledColor: col(124, 124, 124),
        _normalSprite: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
        _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
        _duration: 0.1, _zoomScale: 1.1, _target: ref(nodeIdx),
    });
}

// ── Panel tree under Canvas ────────────────────────────────────────────────────
const rootIdx = pushNode('PrivacyPanelRoot', canvasId);
addChildRef(canvasId, rootIdx);
uiTransform(rootIdx, 720, 1280);
widgetFullscreen(rootIdx);
pushComp('cc.UIOpacity', rootIdx, { _opacity: 0 }); // active in editor, invisible; open() fades in
pushComp('cc.BlockInputEvents', rootIdx, {});

const dimIdx = pushNode('Dim', rootIdx);
addChildRef(rootIdx, dimIdx);
uiTransform(dimIdx, 720, 1280);
sprite(dimIdx, SF_WHITE, col(0, 0, 0, 200), 0 /* SIMPLE, stretched by Widget */);
widgetFullscreen(dimIdx);

const cardIdx = pushNode('Card', rootIdx);
addChildRef(rootIdx, cardIdx);
uiTransform(cardIdx, 620, 720);
sprite(cardIdx, SF_WOOD, col(255, 255, 255), 1 /* SLICED */);

const titleIdx = pushNode('Title', cardIdx, [0, 300, 0]);
addChildRef(cardIdx, titleIdx);
uiTransform(titleIdx, 560, 60);
label(titleIdx, 'PRIVACY POLICY', 44, col(255, 220, 50), { bold: true, outline: true });

// Scrollable body: ScrollView → view (Mask) → content (Label, RESIZE_HEIGHT, full font).
// Structure/props copied from D:\Projects\DemoUI (test-list.scene). Vertical scroll only.
const SV_W = 440, SV_H = 470;
const scrollIdx = pushNode('PrivacyScroll', cardIdx, [0, 10, 0]);
addChildRef(cardIdx, scrollIdx);
uiTransform(scrollIdx, SV_W, SV_H);

const viewIdx = pushNode('view', scrollIdx);
addChildRef(scrollIdx, viewIdx);
uiTransform(viewIdx, SV_W, SV_H);
pushComp('cc.Mask', viewIdx, {
    _visFlags: 0, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
    _color: col(255, 255, 255), _type: 0 /* RECT */, _inverted: false, _segments: 64, _alphaThreshold: 0.1,
});

const contentIdx = pushNode('content', viewIdx, [0, SV_H / 2, 0]); // anchor top → top edge at view top
addChildRef(viewIdx, contentIdx);
uiTransform(contentIdx, SV_W, SV_H, [0.5, 1]);
const bodyLabelIdx = label(contentIdx,
    'Privacy details are loaded at runtime.', 28, col(255, 248, 230),
    // RESIZE_HEIGHT: full font size, the content node grows with the text → ScrollView scrolls.
    { bold: false, hAlign: 1, vAlign: 0 /* top */, wrap: true, overflow: 3 /* RESIZE_HEIGHT */,
      lineHeight: 38, outline: true, outlineWidth: 3 });

const scrollCompIdx = pushComp('cc.ScrollView', scrollIdx, {
    bounceDuration: 0.23, brake: 0.75, elastic: true, inertia: true,
    horizontal: false, vertical: true, cancelInnerEvents: true, scrollEvents: [],
    _content: ref(contentIdx), _horizontalScrollBar: null, _verticalScrollBar: null,
});

const closeIdx = pushNode('Close', cardIdx, [0, -300, 0]);
addChildRef(cardIdx, closeIdx);
uiTransform(closeIdx, 320, 96);
sprite(closeIdx, SF_BUTTON, col(255, 255, 255), 1);
button(closeIdx, SF_BUTTON);
const closeLblIdx = pushNode('Label', closeIdx);
addChildRef(closeIdx, closeLblIdx);
uiTransform(closeLblIdx, 320, 96);
label(closeLblIdx, 'Close', 38, col(60, 40, 20), { bold: true });

// ── "Privacy Policy" link (child of Version node → reuses its bottom position) ──
const linkIdx = pushNode('PrivacyLink', linkParentId, [0, 44, 0]);
addChildRef(linkParentId, linkIdx);
uiTransform(linkIdx, 260, 36);
label(linkIdx, 'Privacy Policy', 22, col(220, 205, 170), { bold: false, outline: true, outlineWidth: 2 });
button(linkIdx, SF_BUTTON);
// Make the link button transparent (text-only look) — no sprite, transition COLOR off.
arr[arr.length - 1]._transition = 0;
arr[arr.length - 1]._normalSprite = null;

// ── PrivacyPanel component on Canvas, wired ────────────────────────────────────
pushComp(PRIVACY_TYPE, canvasId, {
    dialogNode: ref(rootIdx),
    openButton: ref(linkIdx),
    closeButton: ref(closeIdx),
    textLabel: ref(bodyLabelIdx),
    scrollView: ref(scrollCompIdx),
});

fs.writeFileSync(path.resolve(__dirname, '..', 'MainMenu.scene.bak'), fs.readFileSync(SCENE));
fs.writeFileSync(SCENE, JSON.stringify(arr, null, 2));
console.log(`Privacy UI injected into MainMenu.scene (backup at MainMenu.scene.bak).`);
console.log(`  panel root #${rootIdx}, link #${linkIdx} (parent ${linkParentId === versionId ? 'Version' : 'Canvas'}), component on Canvas.`);
