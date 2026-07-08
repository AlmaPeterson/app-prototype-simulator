/**
 * Portal helpers for running inside the App Simulator shell.
 *
 * The designer is mounted into the phone's #main as #ld-root. Overlays,
 * dialogs, and dropdown menus must render inside #ld-root (not
 * document.body) so that (a) the scoped #ld-root CSS and custom properties
 * apply to them, and (b) they cover the phone screen rather than the whole
 * simulator page. #ld-root is position:relative, so portaled elements use
 * position:absolute against it.
 *
 * @module portal
 */

/**
 * The element overlays and menus should be appended to.
 * Falls back to document.body when running outside the shell.
 * @returns {HTMLElement}
 */
export function getPortalRoot() {
    return document.getElementById('ld-root') || document.body;
}

/**
 * Whether the designer is currently mounted AND visible on screen.
 * Window/document-level keyboard handlers must bail out when this is false,
 * otherwise the designer would swallow keystrokes (Delete, Ctrl+S, ...)
 * while another app or the phone home screen is showing.
 * @returns {boolean}
 */
export function isDesignerVisible() {
    const root = document.getElementById('ld-root');
    return !!(root && root.offsetParent !== null);
}
