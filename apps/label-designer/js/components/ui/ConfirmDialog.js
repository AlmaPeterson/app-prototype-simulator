/**
 * ConfirmDialog Component
 *
 * Modal confirmation dialog with title, message, and confirm/cancel buttons.
 * Returns a Promise<boolean> resolving to true if confirmed.
 *
 * @module ConfirmDialog
 */

import { getPortalRoot } from '../../lib/portal.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Show a confirmation dialog.
 *
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {Object} [opts]
 * @param {string} [opts.confirmLabel='Confirm']
 * @param {string} [opts.cancelLabel='Cancel']
 * @param {boolean} [opts.danger=false] - Style confirm button as danger
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(title, message, opts = {}) {
    const { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = opts;

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'cd-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'cd-dialog';

        const titleEl = document.createElement('h3');
        titleEl.className = 'cd-title';
        titleEl.textContent = title;

        const msgEl = document.createElement('p');
        msgEl.className = 'cd-message';
        msgEl.textContent = message;

        const actions = document.createElement('div');
        actions.className = 'cd-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ld-btn ld-btn-secondary';
        cancelBtn.textContent = cancelLabel;

        const confirmBtn = document.createElement('button');
        confirmBtn.className = danger ? 'ld-btn ld-btn-danger' : 'ld-btn ld-btn-primary';
        confirmBtn.textContent = confirmLabel;

        function close(result) {
            overlay.remove();
            resolve(result);
        }

        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });

        function handleKeydown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                document.removeEventListener('keydown', handleKeydown);
                close(false);
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                document.removeEventListener('keydown', handleKeydown);
                close(true);
            }
        }
        document.addEventListener('keydown', handleKeydown);

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(titleEl);
        dialog.appendChild(msgEl);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        getPortalRoot().appendChild(overlay);

        confirmBtn.focus();
    });
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'confirm-dialog-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .cd-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }

        .cd-dialog {
            background: #fff;
            border-radius: 8px;
            padding: 24px;
            min-width: 320px;
            max-width: 420px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: cd-in 0.15s ease;
        }

        @keyframes cd-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .cd-title {
            margin: 0 0 8px;
            font-size: 16px;
            font-weight: 600;
            color: var(--color-text-primary, #1a1a1a);
        }

        .cd-message {
            margin: 0 0 20px;
            font-size: 14px;
            color: var(--color-text-secondary, #666);
            line-height: 1.5;
        }

        .cd-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .cd-actions .ld-btn {
            padding: 6px 16px;
            font-size: 13px;
            font-weight: 500;
            border-radius: var(--radius-sm, 4px);
            border: 1px solid var(--color-border, #d0d0d0);
            cursor: pointer;
            transition: all 0.1s ease;
        }

        .ld-btn-primary {
            background: var(--color-accent, #2563eb);
            color: #fff;
            border-color: var(--color-accent, #2563eb);
        }

        .ld-btn-primary:hover {
            background: var(--color-accent-hover, #1d4ed8);
        }

        .ld-btn-secondary {
            background: var(--color-bg-primary, #fff);
            color: var(--color-text-primary, #1a1a1a);
        }

        .ld-btn-secondary:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .ld-btn-danger {
            background: var(--color-error, #ef4444);
            color: #fff;
            border-color: var(--color-error, #ef4444);
        }

        .ld-btn-danger:hover {
            background: #dc2626;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
