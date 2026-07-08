/**
 * ExportProgressDialog Component
 *
 * Modal progress dialog for PDF export with a percentage progress bar.
 *
 * @module ExportProgressDialog
 */

import { getPortalRoot } from '../../lib/portal.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Show the export progress dialog.
 *
 * @returns {{ update: function(number):void, close: function():void }}
 */
export function showExportProgress() {
    const overlay = document.createElement('div');
    overlay.className = 'epd-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'epd-dialog';

    const title = document.createElement('h3');
    title.className = 'epd-title';
    title.textContent = 'Exporting PDF...';

    const progressOuter = document.createElement('div');
    progressOuter.className = 'epd-progress-outer';

    const progressInner = document.createElement('div');
    progressInner.className = 'epd-progress-inner';

    const statusText = document.createElement('p');
    statusText.className = 'epd-status';
    statusText.textContent = 'Preparing...';

    progressOuter.appendChild(progressInner);
    dialog.appendChild(title);
    dialog.appendChild(progressOuter);
    dialog.appendChild(statusText);
    overlay.appendChild(dialog);
    getPortalRoot().appendChild(overlay);

    let closed = false;

    return {
        /**
         * Update the progress bar.
         * @param {number} percent - 0-100
         */
        update(percent) {
            if (closed) return;
            const clamped = Math.max(0, Math.min(100, Math.round(percent)));
            progressInner.style.width = `${clamped}%`;
            statusText.textContent = `${clamped}% complete`;
        },

        /**
         * Close the dialog.
         */
        close() {
            if (closed) return;
            closed = true;
            overlay.remove();
        },
    };
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'export-progress-dialog-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .epd-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }

        .epd-dialog {
            background: #fff;
            border-radius: 8px;
            padding: 24px;
            min-width: 320px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: epd-in 0.15s ease;
        }

        @keyframes epd-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .epd-title {
            margin: 0 0 16px;
            font-size: 16px;
            font-weight: 600;
            color: var(--color-text-primary, #1a1a1a);
        }

        .epd-progress-outer {
            width: 100%;
            height: 8px;
            background: var(--color-bg-secondary, #e5e7eb);
            border-radius: 4px;
            overflow: hidden;
        }

        .epd-progress-inner {
            height: 100%;
            width: 0%;
            background: var(--color-accent, #2563eb);
            border-radius: 4px;
            transition: width 0.2s ease;
        }

        .epd-status {
            margin: 8px 0 0;
            font-size: 13px;
            color: var(--color-text-secondary, #666);
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
