#!/usr/bin/env node
'use strict';

/**
 * Generates the three modal UI prefabs (PausePanel, GameOverPanel, VictoryPanel)
 * as CC3.8 .prefab JSON, fully laid out and with the script components pre-wired
 * to their @property slots. Re-run after changing layout/bindings:
 *   node scripts/gen-ui-panels.js
 *
 * Each prefab follows the verified modal best-practice (CC 3.8 docs):
 *   - root: Widget fullscreen + UIOpacity (fade) + BlockInputEvents (modal block)
 *   - Dim:  fullscreen white sprite tinted black (backdrop, no Graphics)
 *   - Card: wood panel holding the texts and buttons
 * Visual layout stays editable in the Cocos editor afterwards.
 */

const fs = require('fs');
const path = require('path');

const PREFAB_DIR = path.resolve(__dirname, '..', 'assets', 'prefabs');

// ── Asset UUIDs (from .meta files in this project) ─────────────────────────────
const FONT      = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';            // MedievalSharp TTF
const SF_WOOD   = '57db0246-f3c2-41d8-b6e0-b8cb92486df7@f9941';      // hud/wood.png   (card)
const SF_BUTTON = '86b1400e-1472-4464-86e9-be88f5124ab5@f9941';      // hud/button.png
const SF_WHITE  = '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941';      // builtin white  (dim backdrop)

// Script UUIDs (assigned in the *.ts.meta files we authored).
const UUID_END_PANEL   = '7f3a9c21-4d6e-4b18-9a2f-1c3e5d7b9f04';
const UUID_PAUSE_PANEL = '2e8b4d17-6a39-4c52-8f1d-7b0a6e2c9d35';

const UI_LAYER = 33554432;

// ── Cocos UUID compression (full hex uuid → short __type__ used in scenes) ─────
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

// ── Builder primitives ─────────────────────────────────────────────────────────
let _fid = 0;
function fileId() {
    return ('UIpn' + String(_fid++).padStart(4, '0')).padEnd(22, 'q');
}

function node(name, opts = {}) {
    return {
        __kind: 'node', name,
        pos: opts.pos || [0, 0, 0],
        scale: opts.scale || [1, 1, 1],
        layer: opts.layer ?? UI_LAYER,
        active: opts.active ?? true,
        objFlags: opts.objFlags ?? 0,
        components: [], children: [], parent: null, prefabInfo: null,
    };
}
function addChild(parent, child) { child.parent = parent; parent.children.push(child); return child; }
function addComp(owner, type, props) {
    const c = { __kind: 'comp', type, props, owner, compPrefabInfo: null };
    owner.components.push(c);
    return c;
}
const color = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });

function uiTransform(n, w, h, anchor = [0.5, 0.5]) {
    return addComp(n, 'cc.UITransform', {
        _contentSize: { __type__: 'cc.Size', width: w, height: h },
        _anchorPoint: { __type__: 'cc.Vec2', x: anchor[0], y: anchor[1] },
    });
}
function widgetFullscreen(n) {
    return addComp(n, 'cc.Widget', {
        _alignFlags: 45, _target: null,
        _left: 0, _right: 0, _top: 0, _bottom: 0, _horizontalCenter: 0, _verticalCenter: 0,
        _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
        _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
        _originalWidth: 0, _originalHeight: 0, _alignMode: 2, _lockFlags: 0,
    });
}
function sprite(n, sf, col = color(255, 255, 255), type = 1 /* SLICED */) {
    return addComp(n, 'cc.Sprite', {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
        _color: col,
        _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
        _type: type, _fillType: 0, _sizeMode: 0,
        _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
        _isTrimmedMode: true, _useGrayscale: false, _atlas: null,
    });
}
function label(n, str, fontSize, col = color(255, 255, 255), opts = {}) {
    const sys = !!opts.systemFont;
    return addComp(n, 'cc.Label', {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
        _color: col, _string: str,
        _horizontalAlign: opts.hAlign ?? 1, _verticalAlign: opts.vAlign ?? 1,
        _actualFontSize: fontSize, _fontSize: fontSize, _fontFamily: 'Arial',
        _lineHeight: opts.lineHeight ?? Math.round(fontSize * 1.1),
        _overflow: opts.overflow ?? 0, _enableWrapText: false,
        _font: sys ? null : { __uuid__: FONT, __expectedType__: 'cc.TTFFont' },
        _isSystemFontUsed: sys,
        _spacingX: 0, _isItalic: false, _isBold: !!opts.bold,
        _isUnderline: false, _underlineHeight: 2, _cacheMode: 0,
        _enableOutline: !!opts.outline,
        _outlineColor: color(0, 0, 0, 220), _outlineWidth: opts.outlineWidth ?? 3,
        _enableShadow: false,
        _shadowColor: color(0, 0, 0, 255), _shadowOffset: { __type__: 'cc.Vec2', x: 0, y: -2 }, _shadowBlur: 4,
    });
}
function button(n, sf = SF_BUTTON) {
    return addComp(n, 'cc.Button', {
        clickEvents: [], _interactable: true, _transition: 3,
        _normalColor: color(255, 255, 255), _hoverColor: color(240, 240, 240),
        _pressedColor: color(211, 211, 211), _disabledColor: color(124, 124, 124),
        _normalSprite: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
        _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
        _duration: 0.1, _zoomScale: 1.1, _target: n,
    });
}
function uiOpacity(n, opacity = 255) { return addComp(n, 'cc.UIOpacity', { _opacity: opacity }); }

/** A button node with a centered text label child. Returns { node, btn, lbl }. */
function buttonWithLabel(parent, name, w, h, pos, text, fontSize, opts = {}) {
    const bn = addChild(parent, node(name, { pos }));
    uiTransform(bn, w, h);
    sprite(bn, opts.sf ?? SF_BUTTON, opts.tint ?? color(255, 255, 255));
    const btn = button(bn, opts.sf ?? SF_BUTTON);
    const ln = addChild(bn, node('Label'));
    uiTransform(ln, w, h);
    const lbl = label(ln, text, fontSize, opts.textColor ?? color(60, 40, 20), {
        bold: opts.bold ?? true, systemFont: opts.systemFont, outline: opts.outline,
    });
    return { node: bn, btn, lbl };
}

/** Centered text node on a card. Returns the cc.Label component. */
function textLine(parent, name, str, y, fontSize, col, opts = {}) {
    const n = addChild(parent, node(name, { pos: [0, y, 0] }));
    uiTransform(n, opts.w ?? 540, opts.h ?? Math.round(fontSize * 1.4));
    return label(n, str, fontSize, col, opts);
}

// ── Serialization ───────────────────────────────────────────────────────────────
function serialize(prefabName, root) {
    const objects = [];
    const map = new Map();
    const register = (o) => { if (!map.has(o)) { map.set(o, objects.length); objects.push(o); } };

    const asset = { __kind: 'asset', name: prefabName, root };
    register(asset);

    (function walk(n) {
        register(n);
        for (const c of n.components) {
            c.compPrefabInfo = { __kind: 'compPrefabInfo' };
            register(c); register(c.compPrefabInfo);
        }
        n.prefabInfo = { __kind: 'nodePrefabInfo', node: n, isRoot: n === root };
        register(n.prefabInfo);
        for (const ch of n.children) walk(ch);
    })(root);

    const idOf = (o) => map.get(o);
    const ref = (o) => ({ __id__: idOf(o) });
    const isDesc = (v) => v && typeof v === 'object' && (v.__kind === 'node' || v.__kind === 'comp');
    function resolve(v) {
        if (v === null || v === undefined) return v;
        if (Array.isArray(v)) return v.map(resolve);
        if (isDesc(v)) return ref(v);
        if (typeof v === 'object') {
            const out = {};
            for (const k of Object.keys(v)) out[k] = resolve(v[k]);
            return out;
        }
        return v;
    }

    return objects.map((o) => {
        switch (o.__kind) {
            case 'asset':
                return {
                    __type__: 'cc.Prefab', _name: o.name, _objFlags: 0, __editorExtras__: {},
                    _native: '', data: ref(o.root), optimizationPolicy: 0, persistent: false,
                };
            case 'node':
                return {
                    __type__: 'cc.Node', _name: o.name, _objFlags: o.objFlags, __editorExtras__: {},
                    _parent: o.parent ? ref(o.parent) : null,
                    _children: o.children.map(ref),
                    _active: o.active,
                    _components: o.components.map(ref),
                    _prefab: ref(o.prefabInfo),
                    _lpos: { __type__: 'cc.Vec3', x: o.pos[0], y: o.pos[1], z: o.pos[2] ?? 0 },
                    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
                    _lscale: { __type__: 'cc.Vec3', x: o.scale[0], y: o.scale[1], z: o.scale[2] ?? 1 },
                    _mobility: 0, _layer: o.layer,
                    _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
                    _id: '',
                };
            case 'comp':
                return {
                    __type__: o.type, _name: '', _objFlags: 0, __editorExtras__: {},
                    node: ref(o.owner), _enabled: true, __prefab: ref(o.compPrefabInfo),
                    ...resolve(o.props),
                    _id: '',
                };
            case 'compPrefabInfo':
                return { __type__: 'cc.CompPrefabInfo', fileId: fileId() };
            case 'nodePrefabInfo': {
                const info = {
                    __type__: 'cc.PrefabInfo', root: ref(root), asset: ref(asset),
                    fileId: fileId(), instance: null, targetOverrides: null,
                };
                if (o.isRoot) info.nestedPrefabInstanceRoots = null;
                return info;
            }
        }
    });
}
function writePrefab(name, root) {
    const json = serialize(name, root);
    if (!fs.existsSync(PREFAB_DIR)) fs.mkdirSync(PREFAB_DIR, { recursive: true });
    const file = path.join(PREFAB_DIR, name + '.prefab');
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    console.log('wrote', path.relative(path.resolve(__dirname, '..'), file));
}

// ── Modal shell: fullscreen root (Widget + UIOpacity + BlockInputEvents) + dim + card ──
function modalShell(name, cardW, cardH) {
    const root = node(name);
    uiTransform(root, 720, 1280);
    widgetFullscreen(root);
    // Default opacity 0 → instance stays ACTIVE in the editor (so onLoad runs at runtime)
    // but is invisible in the Scene view. show()/open() fade it 0→255.
    uiOpacity(root, 0);
    addComp(root, 'cc.BlockInputEvents', {}); // modal: blocks click-through to the game

    const dim = addChild(root, node('Dim'));
    uiTransform(dim, 720, 1280);
    sprite(dim, SF_WHITE, color(0, 0, 0, 190), 0 /* SIMPLE, stretched by Widget */);
    widgetFullscreen(dim);

    const card = addChild(root, node('Card'));
    uiTransform(card, cardW, cardH);
    sprite(card, SF_WOOD, color(255, 255, 255), 1 /* SLICED */);

    return { root, card };
}

// ── EndPanel prefab (GameOver / Victory share this layout + component) ────────────
// Single forward action only — no choices. Continue → leaderboard (if on) → menu.
function buildEndPanel(name, opts) {
    const { root, card } = modalShell(name, 600, 680);

    textLine(card, 'Title', opts.title, 250, 60, opts.titleColor, { bold: true, outline: true });

    // NEW BEST SCORE! — toggled + pulsed by EndPanel.show() on a record.
    const newBestNode = addChild(card, node('NewBest', { pos: [0, 165, 0], active: false }));
    uiTransform(newBestNode, 540, 40);
    label(newBestNode, 'NEW BEST SCORE!', 26, color(255, 215, 60), { bold: true, outline: true });

    const scoreLbl = textLine(card, 'Score', 'Score 0', 95, 36, color(255, 220, 50), { bold: true });
    const roundLbl = textLine(card, 'Round', 'ROUND 1', 45, 28, color(120, 210, 255), { bold: true });
    const bestLbl  = textLine(card, 'Best',  'Best 0',   0, 24, color(160, 210, 255));

    const cont = buttonWithLabel(card, 'Continue', 360, 100, [0, -150, 0], 'Continue', 40);

    addComp(root, compressUuid(UUID_END_PANEL), {
        scoreLabel: scoreLbl, roundLabel: roundLbl, bestLabel: bestLbl, newBestNode,
        continueButton: cont.btn,
    });

    writePrefab(name, root);
}

// ── PausePanel prefab ─────────────────────────────────────────────────────────────
function buildPausePanel() {
    const { root, card } = modalShell('PausePanel', 560, 620);

    textLine(card, 'Title', 'PAUSE', 220, 60, color(255, 255, 255), { bold: true, outline: true });

    const resume  = buttonWithLabel(card, 'Resume',  360, 96, [0,   90, 0], 'Resume',  38);
    const restart = buttonWithLabel(card, 'Restart', 360, 96, [0,  -20, 0], 'Restart', 38);
    const menu    = buttonWithLabel(card, 'Menu',    360, 96, [0, -130, 0], 'Menu',    38);

    addComp(root, compressUuid(UUID_PAUSE_PANEL), {
        resumeButton: resume.btn, restartButton: restart.btn, menuButton: menu.btn,
    });

    writePrefab('PausePanel', root);
}

buildPausePanel();
buildEndPanel('GameOverPanel', { title: 'GAME OVER', titleColor: color(220, 40, 40) });
buildEndPanel('VictoryPanel',  { title: 'YOU WIN!',  titleColor: color(255, 220, 50) });
console.log('done');
