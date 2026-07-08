/**
 * Label Designer — Module Entry Point
 *
 * Exposes mountLabelDesigner()/handleBack() for the App Simulator shell
 * (see ../app.js, the classic-script adapter that registers
 * window.Apps['label-designer']). Renders the three-panel layout:
 *   Toolbar (top)
 *   ElementTools (left) | Canvas (center) | PropertyPanel (right)
 * On narrow phone widths the two sidebars become slide-in drawers toggled
 * by floating buttons over the canvas.
 *
 * @module app
 */

import { getState, setViewMode } from './store/designStore.js';
import { initializeAssets } from './lib/assets.js';
import { createCanvasRenderer } from './components/canvas/CanvasRenderer.js';
import { createToolbar, destroyToolbar } from './components/ui/Toolbar.js';
import { createElementTools } from './components/ui/ElementTools.js';
import { createPropertyPanel, destroyPropertyPanel } from './components/ui/PropertyPanel.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { isDropdownOpen, closeDropdown } from './components/ui/DropdownMenu.js';

// ============================================================================
// Styles
// ============================================================================

// Below this root width the sidebars can't share the screen with the canvas.
const NARROW_BREAKPOINT = 700;

function injectAppStyles() {
    if (document.getElementById('app-layout-styles')) return;

    const style = document.createElement('style');
    style.id = 'app-layout-styles';
    style.textContent = `
        #ld-root {
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
        }

        #ld-root .app-layout {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
        }

        #ld-root .main-content {
            display: flex;
            flex: 1;
            min-height: 0;
            overflow: hidden;
            position: relative;
        }

        #ld-root #toolbar {
            flex-shrink: 0;
        }

        /*
         * No width here: each slot's only child is a Resizable wrapper
         * (see ElementTools.js/PropertyPanel.js) that owns its own px width
         * via inline style — the slot just sizes to fit it as a flex item.
         * Narrow (drawer) mode below re-asserts an explicit width, since
         * drawers aren't user-resizable.
         */
        #ld-root #element-tools {
            flex-shrink: 0;
            overflow-y: auto;
            overflow-x: hidden;
            background: #f0f0f0;
            border-right: 1px solid #d0d0d0;
            height: 100%;
        }

        #ld-root #canvas-container {
            flex: 1 1 0%;
            min-width: 0;
            min-height: 0;
            position: relative;
            overflow: hidden;
        }

        #ld-root #property-panel {
            flex-shrink: 0;
            border-left: 1px solid #d0d0d0;
            overflow-y: auto;
            overflow-x: hidden;
            background: #f0f0f0;
        }

        /* ── Narrow (phone) mode: sidebars become slide-in drawers ── */
        #ld-root .ld-panel-toggle {
            display: none;
            position: absolute;
            bottom: 12px;
            z-index: 600;
            align-items: center;
            gap: 4px;
            padding: 8px 12px;
            border: 1px solid #d0d0d0;
            border-radius: 999px;
            background: #fff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            font-size: 12px;
            font-weight: 600;
            color: #1a1a1a;
            cursor: pointer;
        }

        #ld-root .ld-toggle-left { left: 12px; }
        #ld-root .ld-toggle-right { right: 12px; }

        #ld-root.ld-narrow .ld-panel-toggle {
            display: inline-flex;
        }

        #ld-root.ld-narrow #element-tools,
        #ld-root.ld-narrow #property-panel {
            position: absolute;
            top: 0;
            bottom: 0;
            height: auto;
            width: min(280px, 85%);
            max-width: none;
            z-index: 500;
            transition: transform 0.2s ease;
            box-shadow: 0 0 24px rgba(0, 0, 0, 0.25);
        }

        #ld-root.ld-narrow #element-tools {
            left: 0;
            transform: translateX(-105%);
        }

        #ld-root.ld-narrow #property-panel {
            right: 0;
            transform: translateX(105%);
        }

        #ld-root.ld-narrow #element-tools.ld-drawer-open,
        #ld-root.ld-narrow #property-panel.ld-drawer-open {
            transform: translateX(0);
        }

        /*
         * The sidebars' Resizable wrapper (see Resizable.js) keeps its own
         * inline pixel width from desktop use, and drawers aren't meant to
         * be user-resizable at all — but nothing stopped the drag handle
         * from still working here. Dragging it grows the wrapper past the
         * drawer's clipped width, which shoves the handle itself out of the
         * visible/hit-testable area, so a second drag to shrink it back
         * can't grab anything: the panel gets stuck oversized. Force the
         * wrapper to just fill the drawer and hide the handle instead.
         */
        #ld-root.ld-narrow #element-tools .resizable-wrapper,
        #ld-root.ld-narrow #property-panel .resizable-wrapper {
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
        }

        #ld-root.ld-narrow #element-tools .resizable-handle,
        #ld-root.ld-narrow #property-panel .resizable-handle {
            display: none;
        }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// Application
// ============================================================================

class LabelDesigner {
    /**
     * @param {HTMLElement} container - The #ld-root element to render into.
     */
    constructor(container) {
        this.container = container;
        this.cleanupShortcuts = null;
        this.resizeObserver = null;
        // Bound once so it can be added/removed as the same reference.
        this.handleOutsideClick = this.handleOutsideClick.bind(this);
    }

    async init() {
        injectAppStyles();

        // Initialize assets database (IndexedDB migration from localStorage)
        await initializeAssets();

        const layout = document.createElement('div');
        layout.className = 'app-layout';

        const toolbarSlot = document.createElement('div');
        toolbarSlot.id = 'toolbar';

        const mainContent = document.createElement('div');
        mainContent.className = 'main-content';

        const elementToolsSlot = document.createElement('div');
        elementToolsSlot.id = 'element-tools';

        const canvasSlot = document.createElement('div');
        canvasSlot.id = 'canvas-container';

        const propertyPanelSlot = document.createElement('div');
        propertyPanelSlot.id = 'property-panel';

        mainContent.appendChild(elementToolsSlot);
        mainContent.appendChild(canvasSlot);
        mainContent.appendChild(propertyPanelSlot);

        layout.appendChild(toolbarSlot);
        layout.appendChild(mainContent);

        this.container.innerHTML = '';
        this.container.appendChild(layout);

        // --- Narrow-mode drawer toggles (floating over the canvas) ---
        this.leftDrawer = elementToolsSlot;
        this.rightDrawer = propertyPanelSlot;
        mainContent.appendChild(this.createDrawerToggle('left', '🧰 Tools'));
        mainContent.appendChild(this.createDrawerToggle('right', '⚙️ Props'));

        this.resizeObserver = new ResizeObserver(() => {
            const narrow = this.container.clientWidth < NARROW_BREAKPOINT;
            this.container.classList.toggle('ld-narrow', narrow);
            if (!narrow) this.closeDrawers();
        });
        this.resizeObserver.observe(this.container);

        // Tapping anywhere outside an open drawer (canvas, toolbar, the
        // other drawer's toggle pill) closes it. mousedown (not click) so
        // it takes effect before whatever the tap itself does — matching
        // DropdownMenu.js's own click-outside-closes pattern.
        this.container.addEventListener('mousedown', this.handleOutsideClick);

        // --- Create components ---
        createToolbar(toolbarSlot);
        this.elementTools = createElementTools(elementToolsSlot);
        this.canvasCleanup = createCanvasRenderer(canvasSlot);
        createPropertyPanel(propertyPanelSlot);
        this.cleanupShortcuts = useKeyboardShortcuts();
    }

    createDrawerToggle(side, label) {
        const btn = document.createElement('button');
        btn.className = `ld-panel-toggle ld-toggle-${side}`;
        btn.textContent = label;
        btn.addEventListener('click', () => {
            const drawer = side === 'left' ? this.leftDrawer : this.rightDrawer;
            const other = side === 'left' ? this.rightDrawer : this.leftDrawer;
            other.classList.remove('ld-drawer-open');
            drawer.classList.toggle('ld-drawer-open');
        });
        return btn;
    }

    /** Close any open narrow-mode drawer. @returns {boolean} true if one was open */
    closeDrawers() {
        let closed = false;
        for (const drawer of [this.leftDrawer, this.rightDrawer]) {
            if (drawer && drawer.classList.contains('ld-drawer-open')) {
                drawer.classList.remove('ld-drawer-open');
                closed = true;
            }
        }
        return closed;
    }

    /**
     * mousedown handler on the app root: closes an open drawer unless the
     * tap landed inside that drawer or on one of the toggle pills (which
     * manage their own open/close state).
     */
    handleOutsideClick(e) {
        const openDrawer = [this.leftDrawer, this.rightDrawer].find(
            (d) => d && d.classList.contains('ld-drawer-open')
        );
        if (!openDrawer) return;
        if (openDrawer.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.ld-panel-toggle')) return;
        this.closeDrawers();
    }

    destroy() {
        this.container.removeEventListener('mousedown', this.handleOutsideClick);
        if (this.cleanupShortcuts) this.cleanupShortcuts();
        if (typeof this.canvasCleanup === 'function') this.canvasCleanup();
        destroyPropertyPanel();
        destroyToolbar();
        if (this.elementTools && this.elementTools.destroy) this.elementTools.destroy();
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.container.innerHTML = '';
    }
}

// ============================================================================
// Shell API
// ============================================================================

/** @type {LabelDesigner|null} */
let currentInstance = null;

/**
 * Mount (or re-mount) the designer into the given root element. Module-level
 * stores survive re-mounts, so a second mount resumes the same design.
 *
 * @param {HTMLElement} container - The #ld-root element.
 * @returns {Promise<LabelDesigner>}
 */
export async function mountLabelDesigner(container) {
    if (currentInstance) {
        currentInstance.destroy();
        currentInstance = null;
    }
    currentInstance = new LabelDesigner(container);
    await currentInstance.init();
    return currentInstance;
}

/**
 * The shell's phone Back button. Unwinds transient UI one layer at a time:
 * open menu → open modal → open drawer → preview mode. Returns false when
 * there is nothing left to unwind (the shell then closes the app).
 *
 * @returns {boolean} true if the back press was handled
 */
export function handleBack() {
    if (isDropdownOpen()) {
        closeDropdown();
        return true;
    }

    // These modal overlays close themselves on a click that lands on the
    // backdrop (and resolve their promises) — simulate exactly that.
    const root = document.getElementById('ld-root');
    const overlay = root && root.querySelector('.cd-overlay, .ts-overlay');
    if (overlay) {
        overlay.click();
        return true;
    }

    if (currentInstance && currentInstance.closeDrawers()) return true;

    if (getState().viewMode === 'PREVIEW') {
        setViewMode('TEMPLATE');
        return true;
    }

    return false;
}
