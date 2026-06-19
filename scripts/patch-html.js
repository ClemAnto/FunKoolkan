'use strict';

// Shared HTML post-processing applied after each Cocos Creator build.
// 1. Replaces __VERSION__ with the real semver.
// 2. Appends ?v=VERSION to <script src> paths and to System.import('./index.js')
//    so browsers never serve stale JS after a version bump.

function patchHtml(html, version) {
    const v = version ?? '0';

    // 1. Version placeholder
    html = html.replace(/__VERSION__/g, v);

    // 2. Cache-bust <script src="path.js|.json"> — strip any previous ?v=... first.
    //    Skip absolute URLs (http/https, e.g. the Firebase CDN) — they're version-pinned
    //    already and must not be rewritten.
    html = html.replace(
        /(<script\b[^>]*\bsrc=")(?!https?:)([^"?]+\.(?:js|json))(?:\?[^"]*)?(")/g,
        (_, open, file, close) => `${open}${file}?v=${v}${close}`
    );

    // 3. Cache-bust System.import('./index.js') — strip any previous ?v=... first
    html = html.replace(
        /System\.import\('(\.\/[^'?]+\.js)(?:\?[^']*)?' *\)/g,
        (_, file) => `System.import('${file}?v=${v}')`
    );

    return html;
}

module.exports = { patchHtml };
