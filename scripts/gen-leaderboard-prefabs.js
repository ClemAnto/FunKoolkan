#!/usr/bin/env node
'use strict';

/**
 * Generates the two leaderboard UI prefabs (NameEntry, LeaderboardPanel) as CC3.8
 * .prefab JSON, fully laid out and with the script components pre-wired to their
 * @property slots. Re-run after changing layout/bindings:  node scripts/gen-leaderboard-prefabs.js
 *
 * Visual layout is editable in the Cocos editor afterwards; this just produces a
 * ready-to-open starting point so nothing has to be hand-assembled.
 */

const fs = require('fs');
const path = require('path');

// In assets/resources so it can be loaded at runtime via resources.load('LeaderboardPanel').
const PREFAB_DIR = path.resolve(__dirname, '..', 'assets', 'resources');

// ── Asset UUIDs (from .meta files in this project) ─────────────────────────────
const FONT      = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';            // MedievalSharp TTF
const SF_WOOD   = '57db0246-f3c2-41d8-b6e0-b8cb92486df7@f9941';      // hud/wood.png  (panel)
const SF_BUTTON = '86b1400e-1472-4464-86e9-be88f5124ab5@f9941';      // hud/button.png

// Script UUIDs (auto-assigned by the editor; read from *.ts.meta).
const UUID_NAME_ENTRY = 'e7d0f3d4-a139-4b95-8600-11ca6a54a0fb';
const UUID_LB_PANEL   = '440dfe64-4fb6-40a5-8230-7a9c40e59130';

const UI_LAYER = 33554432;

// ── Cocos UUID compression (full hex uuid → short __type__ used in scenes) ─────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    let out = hex.slice(0, 5);
    const rest = hex.slice(5); // 27 hex chars → 9 groups of 3 → 18 base64 chars
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
    return ('LBfw' + String(_fid++).padStart(4, '0')).padEnd(22, 'q');
}

function node(name, opts = {}) {
    return {
        __kind: 'node', name,
        pos: opts.pos || [0, 0, 0],
        scale: opts.scale || [1, 1, 1],
        layer: opts.layer ?? UI_LAYER,
        active: opts.active ?? true,
        objFlags: opts.objFlags ?? 0,
        components: [],
        children: [],
        parent: null,
        prefabInfo: null,
    };
}

function addChild(parent, child) {
    child.parent = parent;
    parent.children.push(child);
    return child;
}

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
        _color: col,
        _string: str,
        _horizontalAlign: opts.hAlign ?? 1,
        _verticalAlign: opts.vAlign ?? 1,
        _actualFontSize: fontSize, _fontSize: fontSize,
        _fontFamily: 'Arial',
        _lineHeight: opts.lineHeight ?? Math.round(fontSize * 1.1),
        _overflow: opts.overflow ?? 0,
        _enableWrapText: false,
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
        _duration: 0.1, _zoomScale: 1.1,
        _target: n,
    });
}

function uiOpacity(n, opacity = 255) {
    return addComp(n, 'cc.UIOpacity', { _opacity: opacity });
}

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
            register(c);
            register(c.compPrefabInfo);
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
    const file = path.join(PREFAB_DIR, name + '.prefab');
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    console.log('wrote', path.relative(path.resolve(__dirname, '..'), file));
}

// ── Board sub-panel (the top-N list) ─────────────────────────────────────────────
function buildBoard(root) {
    const board = addChild(root, node('Board'));
    uiTransform(board, 600, 940);
    sprite(board, SF_WOOD, color(255, 255, 255));

    const titleN = addChild(board, node('Title', { pos: [0, 400, 0] }));
    uiTransform(titleN, 540, 70);
    label(titleN, 'LEADERBOARD', 48, color(255, 220, 80), { bold: true, outline: true });

    const statusN = addChild(board, node('Status', { pos: [0, 0, 0] }));
    uiTransform(statusN, 500, 50);
    const statusLbl = label(statusN, 'Loading…', 28, color(235, 235, 235), { bold: false });

    const rowNodes = [];
    const top = 320;
    const step = 60;
    for (let i = 0; i < 10; i++) {
        const row = addChild(board, node('Row' + i, { pos: [0, top - i * step, 0] }));
        uiTransform(row, 520, 52);

        const rankN = addChild(row, node('Rank', { pos: [-220, 0, 0] }));
        uiTransform(rankN, 80, 48);
        label(rankN, String(i + 1), 30, color(255, 235, 150), { bold: true, hAlign: 1 });

        const nameN = addChild(row, node('Name', { pos: [-90, 0, 0] }));
        uiTransform(nameN, 180, 48);
        label(nameN, 'AAA', 34, color(255, 255, 255), { bold: true, hAlign: 0 });

        const scoreN = addChild(row, node('Score', { pos: [170, 0, 0] }));
        uiTransform(scoreN, 220, 48);
        label(scoreN, '0', 32, color(255, 255, 255), { bold: true, hAlign: 2 });

        rowNodes.push(row);
    }

    const close = buttonWithLabel(board, 'Close', 250, 96, [0, -410, 0], 'CLOSE', 40, { textColor: color(60, 40, 20) });
    return { board, statusLbl, rowNodes, closeBtn: close.btn };
}

// ── NameEntry sub-panel (nested name selector) ───────────────────────────────────
function buildNameEntrySub(root) {
    const ne = addChild(root, node('NameEntry'));
    uiTransform(ne, 600, 820);
    sprite(ne, SF_WOOD, color(255, 255, 255));

    const titleN = addChild(ne, node('Title', { pos: [0, 330, 0] }));
    uiTransform(titleN, 540, 70);
    label(titleN, 'NEW RECORD!', 46, color(255, 220, 80), { bold: true, outline: true });

    const scoreN = addChild(ne, node('ScoreLabel', { pos: [0, 250, 0] }));
    uiTransform(scoreN, 400, 50);
    const scoreLbl = label(scoreN, '0', 36, color(255, 235, 150), { bold: true });

    const letterLabels = [];
    const upButtons = [];
    const downButtons = [];
    const slotX = [-160, 0, 160];
    for (let i = 0; i < 3; i++) {
        const slot = addChild(ne, node('Slot' + i, { pos: [slotX[i], 20, 0] }));
        uiTransform(slot, 120, 300);

        const up = buttonWithLabel(slot, 'Up', 120, 80, [0, 130, 0], '▲', 44, { systemFont: true, textColor: color(60, 40, 20) });
        upButtons.push(up.btn);

        const letterN = addChild(slot, node('Letter', { pos: [0, 0, 0] }));
        uiTransform(letterN, 120, 130);
        letterLabels.push(label(letterN, String.fromCharCode(65 + i), 100, color(255, 248, 230), { bold: true, outline: true, outlineWidth: 4 }));

        const dn = buttonWithLabel(slot, 'Down', 120, 80, [0, -130, 0], '▼', 44, { systemFont: true, textColor: color(60, 40, 20) });
        downButtons.push(dn.btn);
    }

    const confirm = buttonWithLabel(ne, 'Confirm', 250, 100, [0, -320, 0], 'OK', 50, { textColor: color(60, 40, 20) });

    const comp = addComp(ne, compressUuid(UUID_NAME_ENTRY), {
        letterLabels, upButtons, downButtons,
        confirmButton: confirm.btn,
        scoreLabel: scoreLbl,
        dialogNode: null, // fades its own node
    });
    return { node: ne, comp };
}

// ── LeaderboardPanel prefab (contains Board + nested NameEntry) ───────────────────
function buildLeaderboardPanel() {
    const root = node('LeaderboardPanel');
    uiTransform(root, 720, 1280);
    widgetFullscreen(root);
    uiOpacity(root, 255);
    addComp(root, 'cc.BlockInputEvents', {}); // root stays active → modal block only when shown

    const b = buildBoard(root);
    const ne = buildNameEntrySub(root);

    addComp(root, compressUuid(UUID_LB_PANEL), {
        boardNode: b.board,
        nameEntry: ne.comp,
        rowNodes: b.rowNodes,
        statusLabel: b.statusLbl,
        closeButton: b.closeBtn,
        highlightColor: color(255, 215, 60),
        normalColor: color(255, 255, 255),
    });

    writePrefab('LeaderboardPanel', root);
}

buildLeaderboardPanel();
console.log('done');
