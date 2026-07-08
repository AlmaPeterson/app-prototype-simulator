/**
 * Lazy-loads the `qrcode` npm package (the original Next.js app's actual QR
 * dependency — see package.json) via jsDelivr's `+esm` endpoint, which
 * auto-bundles its CommonJS internals into a real ES module. The package's
 * own browser bundle (`lib/browser.js`) still contains raw `require(...)`
 * calls, so it can't be loaded as a plain <script> tag — `+esm` is what
 * makes it work here.
 *
 * Shared by CanvasRenderer.js (live preview) and export.js (PDF) so both
 * produce identical, real, scannable QR codes via the same library.
 *
 * @module qrcode-loader
 */

const ESM_URL = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';

/** @type {Promise<{toDataURL: function}>|null} */
let modulePromise = null;

/**
 * Resolve the `qrcode` module's `toDataURL(text, options)` function.
 * Safe to call repeatedly — the import only happens once.
 * @returns {Promise<function>}
 */
export async function getQRCodeToDataURL() {
    if (!modulePromise) {
        modulePromise = import(/* @vite-ignore */ ESM_URL);
    }
    const mod = await modulePromise;
    if (!mod || typeof mod.toDataURL !== 'function') {
        modulePromise = null; // allow retry on a later call
        throw new Error('QRCode library failed to load');
    }
    return mod.toDataURL;
}
