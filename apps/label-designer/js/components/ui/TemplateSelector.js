/**
 * TemplateSelector Component
 *
 * Template selection modal showing current template info
 * and a grid of all 8 predefined templates.
 *
 * @module TemplateSelector
 */

import { getState, setTemplate } from '../../store/designStore.js';
import { PREDEFINED_TEMPLATES } from '../../lib/templates.js';
import { getPortalRoot } from '../../lib/portal.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Show the template selector modal.
 *
 * @returns {Promise<void>} Resolves when the modal is closed.
 */
export function showTemplateSelector() {
    return new Promise((resolve) => {
        const state = getState();

        const overlay = document.createElement('div');
        overlay.className = 'ts-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'ts-dialog';

        // Title
        const title = document.createElement('h3');
        title.className = 'ts-title';
        title.textContent = 'Select Template';

        // Current template info
        const currentInfo = document.createElement('div');
        currentInfo.className = 'ts-current';
        currentInfo.innerHTML =
            '<span class="ts-current-label">Current:</span> ' +
            '<span class="ts-current-name">' + state.template.name + '</span> ' +
            '<span class="ts-current-desc">' + (state.template.description || '') + '</span>';

        // Template grid
        const grid = document.createElement('div');
        grid.className = 'ts-grid';

        for (const tpl of PREDEFINED_TEMPLATES) {
            const card = document.createElement('div');
            card.className = 'ts-card' + (tpl.id === state.template.id ? ' ts-card--active' : '');

            const name = document.createElement('div');
            name.className = 'ts-card-name';
            name.textContent = tpl.name;

            const desc = document.createElement('div');
            desc.className = 'ts-card-desc';
            desc.textContent = tpl.description || '';

            const dims = document.createElement('div');
            dims.className = 'ts-card-dims';
            dims.textContent = tpl.columns + '×' + tpl.rows + ' | ' +
                tpl.labelWidth + '×' + tpl.labelHeight + 'mm';

            card.appendChild(name);
            card.appendChild(desc);
            card.appendChild(dims);

            card.addEventListener('click', () => {
                setTemplate(tpl);
                overlay.remove();
                resolve();
            });

            grid.appendChild(card);
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ld-btn ld-btn-secondary ts-close';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => {
            overlay.remove();
            resolve();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve();
            }
        });

        function handleKeydown(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleKeydown);
                overlay.remove();
                resolve();
            }
        }
        document.addEventListener('keydown', handleKeydown);

        dialog.appendChild(title);
        dialog.appendChild(currentInfo);
        dialog.appendChild(grid);
        dialog.appendChild(closeBtn);
        overlay.appendChild(dialog);
        getPortalRoot().appendChild(overlay);
    });
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'template-selector-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .ts-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }

        .ts-dialog {
            background: #fff;
            border-radius: 8px;
            padding: 24px;
            min-width: min(500px, calc(100% - 16px));
            max-width: min(640px, calc(100% - 16px));
            max-height: 80%;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: ts-in 0.15s ease;
        }

        @keyframes ts-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .ts-title {
            margin: 0 0 12px;
            font-size: 16px;
            font-weight: 600;
            color: var(--color-text-primary, #1a1a1a);
        }

        .ts-current {
            font-size: 13px;
            margin-bottom: 16px;
            padding: 8px 12px;
            background: var(--color-bg-secondary, #f0f0f0);
            border-radius: var(--radius-sm, 4px);
        }

        .ts-current-label {
            color: var(--color-text-tertiary, #999);
        }

        .ts-current-name {
            font-weight: 600;
            color: var(--color-text-primary, #1a1a1a);
        }

        .ts-current-desc {
            color: var(--color-text-secondary, #666);
        }

        .ts-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 16px;
        }

        .ts-card {
            padding: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-md, 6px);
            cursor: pointer;
            transition: all 0.1s ease;
        }

        .ts-card:hover {
            border-color: var(--color-accent, #2563eb);
            background: rgba(37, 99, 235, 0.04);
        }

        .ts-card--active {
            border-color: var(--color-accent, #2563eb);
            background: rgba(37, 99, 235, 0.08);
        }

        .ts-card-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--color-text-primary, #1a1a1a);
            margin-bottom: 2px;
        }

        .ts-card-desc {
            font-size: 11px;
            color: var(--color-text-secondary, #666);
            margin-bottom: 4px;
        }

        .ts-card-dims {
            font-size: 10px;
            color: var(--color-text-tertiary, #999);
            font-family: var(--font-mono, monospace);
        }

        .ts-close {
            display: block;
            width: 100%;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
