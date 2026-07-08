/**
 * Resizable Component
 *
 * Drag-to-resize wrapper for sidebars. Supports left or right side
 * with configurable default/min/max width and a visual resize handle.
 *
 * @module Resizable
 */

// ============================================================================
// Constants
// ============================================================================

const CURSOR_OVERRIDE_CLASS = 'resizing-cursor';
const CURSOR_STYLE_ID = 'resizable-cursor-style';

// ============================================================================
// CSS Injection
// ============================================================================

function injectStyles() {
    if (document.getElementById(CURSOR_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = CURSOR_STYLE_ID;
    style.textContent = `
        .resizing-cursor,
        .resizing-cursor *,
        .resizing-cursor *::before,
        .resizing-cursor *::after {
            cursor: col-resize !important;
            user-select: none !important;
            pointer-events: none !important;
        }

        .resizable-handle {
            position: absolute;
            top: 0;
            width: 5px;
            height: 100%;
            cursor: col-resize;
            z-index: 10;
            transition: background-color 0.15s ease;
        }

        .resizable-handle::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 3px;
            height: 32px;
            border-radius: 2px;
            background: var(--color-border, #d0d0d0);
            opacity: 0;
            transition: opacity 0.15s ease;
        }

        .resizable-handle:hover::after,
        .resizable-handle--active::after {
            opacity: 1;
            background: var(--color-accent, #2563eb);
        }

        /*
         * "side" names which edge of the SCREEN the panel is docked to, not
         * which edge the handle sits on — the handle always sits on the
         * panel's content-facing (inner) edge, opposite the docked side:
         * a left-docked panel's handle is on its right edge, and vice versa.
         * Positioned flush at 0 (not a negative offset) so it stays fully
         * inside the wrapper's own box — a handle spilling even a few px
         * into the neighboring flex sibling (the canvas) loses the pointer
         * hit-test to whatever's painted there.
         */
        .resizable-handle--left {
            right: 0;
        }

        .resizable-handle--right {
            left: 0;
        }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Wrap an element in a resizable container.
 *
 * @param {HTMLElement} content - The element to make resizable
 * @param {Object} [options]
 * @param {'left'|'right'} [options.side='right'] - Which side the sidebar is on
 * @param {number} [options.defaultWidth=280] - Initial width in px
 * @param {number} [options.minWidth=150] - Minimum width in px
 * @param {number} [options.maxWidth=600] - Maximum width in px
 * @param {function(number): void} [options.onResize] - Callback when width changes
 * @param {function(number): void} [options.onResizeEnd] - Callback when drag ends
 * @returns {{ container: HTMLElement, getWidth: function, setWidth: function, destroy: function }}
 */
export function createResizable(content, options = {}) {
    const {
        side = 'right',
        defaultWidth = 280,
        minWidth = 150,
        maxWidth = 600,
        onResize = null,
        onResizeEnd = null,
    } = options;

    injectStyles();

    let currentWidth = defaultWidth;
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    // Outer wrapper — deliberately does NOT clip overflow: the resize handle
    // is a sibling of contentContainer positioned just outside the wrapper's
    // own edge (see CSS above), and a wrapper-level overflow:hidden would
    // clip that protruding sliver, making the handle un-clickable. Content
    // clipping happens on contentContainer below instead.
    const wrapper = document.createElement('div');
    wrapper.className = 'resizable-wrapper';
    wrapper.style.cssText = `
        position: relative;
        width: ${defaultWidth}px;
        min-width: ${minWidth}px;
        max-width: ${maxWidth}px;
        height: 100%;
        flex-shrink: 0;
    `;

    // Content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'resizable-content';
    contentContainer.style.cssText = `
        width: 100%;
        height: 100%;
        overflow: hidden;
    `;

    if (content instanceof HTMLElement) {
        contentContainer.appendChild(content);
    }

    // Resize handle
    const handle = document.createElement('div');
    handle.className = `resizable-handle resizable-handle--${side}`;

    // Drag handlers
    function onMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        startX = e.clientX;
        startWidth = wrapper.getBoundingClientRect().width;

        handle.classList.add('resizable-handle--active');
        document.body.classList.add(CURSOR_OVERRIDE_CLASS);

        document.addEventListener('mousemove', onMouseMove, { passive: false });
        document.addEventListener('mouseup', onMouseUp, { once: true });
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        // A left-docked panel's handle is on its right edge — dragging it
        // right grows the panel. A right-docked panel's handle is on its
        // left edge — dragging it left grows the panel.
        const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));

        if (newWidth !== currentWidth) {
            currentWidth = newWidth;
            wrapper.style.width = `${newWidth}px`;
            if (onResize) onResize(newWidth);
        }
    }

    function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;

        handle.classList.remove('resizable-handle--active');
        document.body.classList.remove(CURSOR_OVERRIDE_CLASS);

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (onResizeEnd) onResizeEnd(currentWidth);
    }

    handle.addEventListener('mousedown', onMouseDown);

    // Assemble
    wrapper.appendChild(contentContainer);
    wrapper.appendChild(handle);

    // Public API
    return {
        container: wrapper,

        /** Get current width */
        getWidth() {
            return currentWidth;
        },

        /** Set width programmatically */
        setWidth(width) {
            const clamped = Math.max(minWidth, Math.min(maxWidth, width));
            currentWidth = clamped;
            wrapper.style.width = `${clamped}px`;
            if (onResize) onResize(clamped);
        },

        /** Clean up event listeners */
        destroy() {
            handle.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove(CURSOR_OVERRIDE_CLASS);
        },
    };
}
