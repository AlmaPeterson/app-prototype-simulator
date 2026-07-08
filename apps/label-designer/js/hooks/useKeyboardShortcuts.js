/**
 * Keyboard Shortcuts Hook
 *
 * Handles Delete/Backspace (remove), arrow keys (nudge), Escape (clear selection).
 * Ctrl/Cmd shortcuts (undo, redo, copy, paste, duplicate) are handled by Toolbar.
 *
 * @module useKeyboardShortcuts
 */

import {
    getState,
    removeMasterElement,
    clearSelection,
    updateMasterElement,
} from '../store/designStore.js';
import { isDesignerVisible } from '../lib/portal.js';

/**
 * Set up keyboard shortcut listeners on the window.
 * Returns a cleanup function that removes all listeners.
 *
 * @returns {function} Cleanup function
 */
export function useKeyboardShortcuts() {
    /**
     * Check whether the keyboard event originated from a text input element.
     * @param {KeyboardEvent} e
     * @returns {boolean}
     */
    function isTextInput(e) {
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (e.target?.contentEditable === 'true') return true;
        return false;
    }

    /**
     * Get the unique set of selected element IDs that are in the master label
     * (not label-override-only elements).
     * @returns {string[]}
     */
    function getSelectedMasterElementIds() {
        const state = getState();
        return state.selectedElementIds.filter((id) =>
            state.masterLabel.elements.some((el) => el.id === id)
        );
    }

    function handleKeyDown(e) {
        // Window-level listener shared with other apps in the simulator —
        // only act while the designer is the app on screen.
        if (!isDesignerVisible()) return;
        if (isTextInput(e)) return;

        const state = getState();

        // --- Delete / Backspace: remove selected elements ---
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const ids = getSelectedMasterElementIds();
            if (ids.length > 0) {
                e.preventDefault();
                for (const id of ids) {
                    removeMasterElement(id);
                }
            }
            return;
        }

        // --- Arrow keys: nudge selected elements ---
        if (e.key.startsWith('Arrow') && state.selectedElementIds.length > 0) {
            e.preventDefault();
            const step = e.shiftKey ? 5 : 1;
            let dx = 0;
            let dy = 0;

            switch (e.key) {
                case 'ArrowLeft':
                    dx = -step;
                    break;
                case 'ArrowRight':
                    dx = step;
                    break;
                case 'ArrowUp':
                    dy = -step;
                    break;
                case 'ArrowDown':
                    dy = step;
                    break;
            }

            if (dx !== 0 || dy !== 0) {
                for (const id of state.selectedElementIds) {
                    const element = state.masterLabel.elements.find((el) => el.id === id);
                    if (!element) continue;
                    updateMasterElement(id, {
                        transform: {
                            ...element.transform,
                            x: element.transform.x + dx,
                            y: element.transform.y + dy,
                        },
                    });
                }
            }
            return;
        }

        // --- Escape: clear selection ---
        if (e.key === 'Escape') {
            clearSelection();
            return;
        }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
}
