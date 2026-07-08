/**
 * LayersPanel Component
 *
 * Layer management panel showing elements sorted by zIndex (topmost first).
 * Supports visibility toggle, lock toggle, z-order buttons, and multi-select.
 *
 * @module LayersPanel
 */

import {
    getState,
    subscribe,
    updateMasterElement,
    setSelectedElements,
    toggleElementSelection,
    clearSelection,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
} from '../../store/designStore.js';

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    eye: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6z"/><circle cx="8" cy="8" r="2"/></svg>',
    eyeOff: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6z"/><line x1="3" y1="3" x2="13" y2="13"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="7" width="8" height="7" rx="1"/><path d="M6 7V5a2 2 0 114 0v2"/></svg>',
    unlock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="7" width="8" height="7" rx="1"/><path d="M6 7V5a2 2 0 114 0v2"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 10 8 6 12 10"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 6 8 10 12 6"/></svg>',
    top: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 10 8 6 12 10"/><line x1="8" y1="3" x2="8" y2="13"/></svg>',
    bottom: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 6 8 10 12 6"/><line x1="8" y1="3" x2="8" y2="13"/></svg>',
    chevron: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 6 8 10 12 6"/></svg>',
};

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {function|null} */
let unsubscribe = null;

/** @type {boolean} */
let collapsed = false;

// ============================================================================
// Helpers
// ============================================================================

function getElementIcon(type) {
    switch (type) {
        case 'text': return 'T';
        case 'shape': return '■';
        case 'image': return '◉';
        case 'placeholder': return '☐';
        default: return '○';
    }
}

function getElementLabel(el) {
    if (el.type === 'text') return (el.content || 'Text').substring(0, 24);
    if (el.type === 'placeholder') return el.displayText || el.placeholderType || el.type;
    if (el.type === 'shape') return el.shapeType || 'Shape';
    return el.type;
}

// ============================================================================
// Render
// ============================================================================

function renderLayers() {
    if (!panelEl) return;

    const body = panelEl.querySelector('.lp-body');
    if (!body) return;

    body.innerHTML = '';

    const state = getState();
    const elements = [...state.masterLabel.elements].sort((a, b) => b.zIndex - a.zIndex);
    const selectedIds = state.selectedElementIds;

    if (elements.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'lp-hint';
        hint.textContent = 'No elements. Use the tools to add elements.';
        body.appendChild(hint);
        return;
    }

    for (const el of elements) {
        const isSelected = selectedIds.includes(el.id);

        const row = document.createElement('div');
        row.className = 'lp-row' + (isSelected ? ' lp-row--selected' : '');

        // Visibility button
        const visBtn = document.createElement('button');
        visBtn.className = 'lp-btn';
        visBtn.innerHTML = el.visible ? ICONS.eye : ICONS.eyeOff;
        visBtn.title = el.visible ? 'Hide element' : 'Show element';
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateMasterElement(el.id, { visible: !el.visible });
        });

        // Lock button
        const lockBtn = document.createElement('button');
        lockBtn.className = 'lp-btn';
        lockBtn.innerHTML = el.locked ? ICONS.lock : ICONS.unlock;
        lockBtn.title = el.locked ? 'Unlock element' : 'Lock element';
        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateMasterElement(el.id, { locked: !el.locked });
        });

        // Type icon
        const typeIcon = document.createElement('span');
        typeIcon.className = 'lp-type-icon';
        typeIcon.textContent = getElementIcon(el.type);

        // Label
        const label = document.createElement('span');
        label.className = 'lp-label';
        label.textContent = getElementLabel(el);
        label.title = getElementLabel(el);

        // Z-order buttons
        const orderGroup = document.createElement('div');
        orderGroup.className = 'lp-order';

        const toTopBtn = document.createElement('button');
        toTopBtn.className = 'lp-btn lp-btn--order';
        toTopBtn.innerHTML = ICONS.top;
        toTopBtn.title = 'Bring to front';
        toTopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bringToFront(el.id);
        });

        const upBtn = document.createElement('button');
        upBtn.className = 'lp-btn lp-btn--order';
        upBtn.innerHTML = ICONS.up;
        upBtn.title = 'Bring forward';
        upBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bringForward(el.id);
        });

        const downBtn = document.createElement('button');
        downBtn.className = 'lp-btn lp-btn--order';
        downBtn.innerHTML = ICONS.down;
        downBtn.title = 'Send backward';
        downBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sendBackward(el.id);
        });

        const toBottomBtn = document.createElement('button');
        toBottomBtn.className = 'lp-btn lp-btn--order';
        toBottomBtn.innerHTML = ICONS.bottom;
        toBottomBtn.title = 'Send to back';
        toBottomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sendToBack(el.id);
        });

        orderGroup.appendChild(toTopBtn);
        orderGroup.appendChild(upBtn);
        orderGroup.appendChild(downBtn);
        orderGroup.appendChild(toBottomBtn);

        // Row click: multi-select support
        row.addEventListener('click', (e) => {
            if (e.target.closest('.lp-btn')) return;
            if (e.shiftKey) {
                toggleElementSelection(el.id);
            } else {
                setSelectedElements([el.id]);
            }
        });

        row.appendChild(visBtn);
        row.appendChild(lockBtn);
        row.appendChild(typeIcon);
        row.appendChild(label);
        row.appendChild(orderGroup);
        body.appendChild(row);
    }
}

function render() {
    if (!panelEl) return;
    panelEl.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'lp-header';

    const chevron = document.createElement('span');
    chevron.className = 'lp-chevron';
    chevron.innerHTML = ICONS.chevron;
    chevron.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';

    const title = document.createElement('span');
    title.className = 'lp-title';
    title.textContent = 'Layers';

    const count = document.createElement('span');
    count.className = 'lp-count';
    count.textContent = String(getState().masterLabel.elements.length);

    header.appendChild(chevron);
    header.appendChild(title);
    header.appendChild(count);

    header.addEventListener('click', () => {
        collapsed = !collapsed;
        chevron.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        body.style.display = collapsed ? 'none' : '';
    });

    const body = document.createElement('div');
    body.className = 'lp-body';

    panelEl.appendChild(header);
    panelEl.appendChild(body);

    renderLayers();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the layers panel.
 *
 * @param {HTMLElement} container - Parent element
 * @returns {{ element: HTMLElement, destroy: function() }}
 */
export function createLayersPanel(container) {
    panelEl = document.createElement('div');
    panelEl.className = 'layers-panel';

    container.appendChild(panelEl);

    unsubscribe = subscribe(() => renderLayers());
    render();

    return {
        element: panelEl,
        destroy() {
            if (unsubscribe) unsubscribe();
            if (panelEl) panelEl.remove();
            panelEl = null;
        },
    };
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'layers-panel-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .layers-panel {
            user-select: none;
        }

        .lp-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            cursor: pointer;
            border-radius: var(--radius-sm, 4px);
            transition: background-color 0.1s ease;
        }

        .lp-header:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .lp-chevron {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 12px;
            height: 12px;
            color: var(--color-text-tertiary, #999);
            transition: transform 0.15s ease;
            flex-shrink: 0;
        }

        .lp-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--color-text-secondary, #666);
        }

        .lp-count {
            margin-left: auto;
            font-size: 10px;
            color: var(--color-text-tertiary, #999);
            background: var(--color-bg-secondary, #f0f0f0);
            padding: 1px 6px;
            border-radius: 10px;
        }

        .lp-body {
            padding: 4px 0;
        }

        .lp-hint {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            text-align: center;
            padding: 16px 8px;
            font-style: italic;
        }

        .lp-row {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: var(--radius-sm, 4px);
            cursor: pointer;
            transition: background-color 0.1s ease;
        }

        .lp-row:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .lp-row--selected {
            background: var(--color-selection-bg, rgba(37, 99, 235, 0.1));
            outline: 1px solid var(--color-selection, #2563eb);
        }

        .lp-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border: none;
            border-radius: var(--radius-sm, 4px);
            background: transparent;
            cursor: pointer;
            color: var(--color-text-tertiary, #999);
            transition: all 0.1s ease;
            flex-shrink: 0;
        }

        .lp-btn:hover {
            background: var(--color-bg-tertiary, #e8e8e8);
            color: var(--color-text-primary, #1a1a1a);
        }

        .lp-type-icon {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            width: 16px;
            text-align: center;
            flex-shrink: 0;
        }

        .lp-label {
            flex: 1;
            font-size: 12px;
            color: var(--color-text-primary, #1a1a1a);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .lp-order {
            display: flex;
            gap: 1px;
            opacity: 0;
            transition: opacity 0.1s ease;
        }

        .lp-row:hover .lp-order {
            opacity: 1;
        }

        .lp-btn--order {
            width: 20px;
            height: 20px;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
