/**
 * DataBindingPanel Component
 *
 * Data binding UI for text elements.
 * Maps element properties to data columns with a dropdown selector.
 *
 * @module DataBindingPanel
 */

import {
    getState,
    updateMasterElement,
} from '../../store/designStore.js';
import { subscribe as subscribeData } from '../../store/dataStore.js';

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    link: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 10l4-4"/><path d="M9 3h4v4"/><path d="M7 13H3V9"/></svg>',
    unlink: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 9l2-2"/><path d="M11 5h3v3"/><path d="M5 13H2V9"/></svg>',
};

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {Object|null} */
let currentElement = null;

/** @type {function|null} */
let unsubData = null;

// ============================================================================
// Helpers
// ============================================================================

function updateBinding(elementId, property, columnId) {
    const state = getState();
    const element = state.masterLabel.elements.find((el) => el.id === elementId);
    if (!element) return;

    const bindings = element.bindings || [];
    let newBindings;

    if (columnId) {
        const existing = bindings.filter((b) => b.property !== property);
        newBindings = [...existing, { property, columnId }];
    } else {
        newBindings = bindings.filter((b) => b.property !== property);
    }

    updateMasterElement(elementId, { bindings: newBindings });
}

// ============================================================================
// Render
// ============================================================================

function render() {
    if (!panelEl) return;

    panelEl.innerHTML = '';

    if (!currentElement || currentElement.type !== 'text') {
        const hint = document.createElement('p');
        hint.className = 'dbp-hint';
        hint.textContent = 'Select a text element to configure data bindings.';
        panelEl.appendChild(hint);
        return;
    }

    const state = getState();
    const columns = state.columns;

    if (!columns || columns.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'dbp-hint';
        hint.textContent = 'Import data to enable bindings.';
        panelEl.appendChild(hint);
        return;
    }

    const bindings = currentElement.bindings || [];

    // Content binding
    const contentRow = document.createElement('div');
    contentRow.className = 'dbp-row';

    const contentLabel = document.createElement('label');
    contentLabel.className = 'dbp-label';
    contentLabel.textContent = 'Content';

    const contentBinding = bindings.find((b) => b.property === 'content');

    const contentSelect = document.createElement('select');
    contentSelect.className = 'dbp-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '-- None (static) --';
    contentSelect.appendChild(noneOpt);

    for (const col of columns) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name;
        opt.selected = contentBinding?.columnId === col.id;
        contentSelect.appendChild(opt);
    }

    contentSelect.addEventListener('change', () => {
        updateBinding(currentElement.id, 'content', contentSelect.value || null);
    });

    contentRow.appendChild(contentLabel);
    contentRow.appendChild(contentSelect);

    // Clear button
    if (contentBinding) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'dbp-clear-btn';
        clearBtn.innerHTML = ICONS.unlink;
        clearBtn.title = 'Remove binding';
        clearBtn.addEventListener('click', () => {
            updateBinding(currentElement.id, 'content', null);
            contentSelect.value = '';
        });
        contentRow.appendChild(clearBtn);
    }

    panelEl.appendChild(contentRow);

    // Color binding
    const colorRow = document.createElement('div');
    colorRow.className = 'dbp-row';

    const colorLabel = document.createElement('label');
    colorLabel.className = 'dbp-label';
    colorLabel.textContent = 'Color';

    const colorBinding = bindings.find((b) => b.property === 'color');

    const colorSelect = document.createElement('select');
    colorSelect.className = 'dbp-select';

    const colorNoneOpt = document.createElement('option');
    colorNoneOpt.value = '';
    colorNoneOpt.textContent = '-- None (static) --';
    colorSelect.appendChild(colorNoneOpt);

    for (const col of columns) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name;
        opt.selected = colorBinding?.columnId === col.id;
        colorSelect.appendChild(opt);
    }

    colorSelect.addEventListener('change', () => {
        updateBinding(currentElement.id, 'color', colorSelect.value || null);
    });

    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorSelect);

    if (colorBinding) {
        const colorClearBtn = document.createElement('button');
        colorClearBtn.className = 'dbp-clear-btn';
        colorClearBtn.innerHTML = ICONS.unlink;
        colorClearBtn.title = 'Remove binding';
        colorClearBtn.addEventListener('click', () => {
            updateBinding(currentElement.id, 'color', null);
            colorSelect.value = '';
        });
        colorRow.appendChild(colorClearBtn);
    }

    panelEl.appendChild(colorRow);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the data binding panel.
 *
 * @param {HTMLElement} container - Parent element
 * @param {Object|null} element - The currently selected element, or null
 * @returns {{ element: HTMLElement, setElement: function(Object|null):void, destroy: function() }}
 */
export function createDataBindingPanel(container, element = null) {
    panelEl = document.createElement('div');
    panelEl.className = 'data-binding-panel';

    currentElement = element;

    container.appendChild(panelEl);

    unsubData = subscribeData(() => render());
    render();

    return {
        element: panelEl,
        setElement(el) {
            currentElement = el;
            render();
        },
        destroy() {
            if (unsubData) unsubData();
            if (panelEl) panelEl.remove();
            panelEl = null;
        },
    };
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'data-binding-panel-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .data-binding-panel {
            user-select: none;
        }

        .dbp-hint {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            text-align: center;
            padding: 16px 8px;
            font-style: italic;
        }

        .dbp-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
        }

        .dbp-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--color-text-secondary, #666);
            min-width: 50px;
            flex-shrink: 0;
        }

        .dbp-select {
            flex: 1;
            padding: 4px 6px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
        }

        .dbp-select:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .dbp-clear-btn {
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

        .dbp-clear-btn:hover {
            background: rgba(239, 68, 68, 0.1);
            color: var(--color-error, #ef4444);
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
