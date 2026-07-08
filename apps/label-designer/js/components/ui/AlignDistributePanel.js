/**
 * AlignDistributePanel Component
 *
 * Alignment and distribution controls shown when 2+ elements are selected.
 * Distribute buttons shown when 3+ elements are selected.
 *
 * @module AlignDistributePanel
 */

import {
    getState,
    subscribe,
    alignElements,
    distributeElements,
} from '../../store/designStore.js';

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    alignLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="2" y2="14"/><rect x="2" y="3" width="10" height="3" fill="currentColor" opacity="0.3"/><rect x="2" y="8" width="7" height="3" fill="currentColor" opacity="0.3"/></svg>',
    alignCenterH: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="2" x2="8" y2="14"/><rect x="3" y="3" width="10" height="3" fill="currentColor" opacity="0.3"/><rect x="5" y="8" width="6" height="3" fill="currentColor" opacity="0.3"/></svg>',
    alignRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="14" y1="2" x2="14" y2="14"/><rect x="4" y="3" width="10" height="3" fill="currentColor" opacity="0.3"/><rect x="7" y="8" width="7" height="3" fill="currentColor" opacity="0.3"/></svg>',
    alignTop: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="14" y2="2"/><rect x="3" y="2" width="3" height="10" fill="currentColor" opacity="0.3"/><rect x="8" y="2" width="3" height="7" fill="currentColor" opacity="0.3"/></svg>',
    alignCenterV: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="8" x2="14" y2="8"/><rect x="3" y="3" width="3" height="10" fill="currentColor" opacity="0.3"/><rect x="8" y="5" width="3" height="6" fill="currentColor" opacity="0.3"/></svg>',
    alignBottom: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="14" x2="14" y2="14"/><rect x="3" y="4" width="3" height="10" fill="currentColor" opacity="0.3"/><rect x="8" y="5" width="3" height="7" fill="currentColor" opacity="0.3"/></svg>',
    distH: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="2" y2="14"/><line x1="14" y1="2" x2="14" y2="14"/><rect x="5" y="5" width="6" height="6" fill="currentColor" opacity="0.3"/></svg>',
    distV: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="14" y2="2"/><line x1="2" y1="14" x2="14" y2="14"/><rect x="5" y="5" width="6" height="6" fill="currentColor" opacity="0.3"/></svg>',
};

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {function|null} */
let unsubscribe = null;

// ============================================================================
// Render
// ============================================================================

function render() {
    if (!panelEl) return;

    panelEl.innerHTML = '';

    const state = getState();
    const count = state.selectedElementIds.length;

    if (count < 2) {
        panelEl.style.display = 'none';
        return;
    }

    panelEl.style.display = '';

    const alignOptions = [
        { value: 'left', icon: ICONS.alignLeft, title: 'Align Left' },
        { value: 'center', icon: ICONS.alignCenterH, title: 'Align Center Horizontal' },
        { value: 'right', icon: ICONS.alignRight, title: 'Align Right' },
        { value: 'top', icon: ICONS.alignTop, title: 'Align Top' },
        { value: 'middle', icon: ICONS.alignCenterV, title: 'Align Middle' },
        { value: 'bottom', icon: ICONS.alignBottom, title: 'Align Bottom' },
    ];

    const alignGroup = document.createElement('div');
    alignGroup.className = 'adp-group';

    for (const opt of alignOptions) {
        const btn = document.createElement('button');
        btn.className = 'adp-btn';
        btn.innerHTML = opt.icon;
        btn.title = opt.title;
        btn.addEventListener('click', () => {
            alignElements(state.selectedElementIds, opt.value);
        });
        alignGroup.appendChild(btn);
    }

    const alignRow = document.createElement('div');
    alignRow.className = 'adp-row';

    const alignLabel = document.createElement('span');
    alignLabel.className = 'adp-label';
    alignLabel.textContent = 'Align';

    alignRow.appendChild(alignLabel);
    alignRow.appendChild(alignGroup);
    panelEl.appendChild(alignRow);

    // Distribute (only when 3+ selected)
    if (count >= 3) {
        const distOptions = [
            { value: 'horizontal', icon: ICONS.distH, title: 'Distribute Horizontally' },
            { value: 'vertical', icon: ICONS.distV, title: 'Distribute Vertically' },
        ];

        const distGroup = document.createElement('div');
        distGroup.className = 'adp-group';

        for (const opt of distOptions) {
            const btn = document.createElement('button');
            btn.className = 'adp-btn';
            btn.innerHTML = opt.icon;
            btn.title = opt.title;
            btn.addEventListener('click', () => {
                distributeElements(state.selectedElementIds, opt.value);
            });
            distGroup.appendChild(btn);
        }

        const distRow = document.createElement('div');
        distRow.className = 'adp-row';

        const distLabel = document.createElement('span');
        distLabel.className = 'adp-label';
        distLabel.textContent = 'Distribute';

        distRow.appendChild(distLabel);
        distRow.appendChild(distGroup);
        panelEl.appendChild(distRow);
    }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the align/distribute panel.
 *
 * @param {HTMLElement} container - Parent element
 * @returns {{ element: HTMLElement, destroy: function() }}
 */
export function createAlignDistributePanel(container) {
    panelEl = document.createElement('div');
    panelEl.className = 'align-distribute-panel';
    panelEl.style.display = 'none';

    container.appendChild(panelEl);

    unsubscribe = subscribe(() => render());
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

const CSS_ID = 'align-distribute-panel-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .align-distribute-panel {
            padding: 6px 8px;
            border-bottom: 1px solid var(--color-border-light, #e8e8e8);
        }

        .adp-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .adp-row:last-child {
            margin-bottom: 0;
        }

        .adp-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--color-text-tertiary, #999);
            min-width: 60px;
            flex-shrink: 0;
        }

        .adp-group {
            display: flex;
            gap: 2px;
        }

        .adp-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
            cursor: pointer;
            transition: all 0.1s ease;
            color: var(--color-text-secondary, #666);
        }

        .adp-btn:hover {
            background: var(--color-bg-secondary, #f0f0f0);
            border-color: var(--color-accent, #2563eb);
            color: var(--color-accent, #2563eb);
        }

        .adp-btn:active {
            transform: scale(0.95);
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
