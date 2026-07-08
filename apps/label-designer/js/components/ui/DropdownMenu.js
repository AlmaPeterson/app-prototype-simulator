/**
 * DropdownMenu Component
 *
 * Generic dropdown menu with keyboard navigation, click-outside-to-close,
 * and fixed positioning calculated from the trigger button rect.
 *
 * @module DropdownMenu
 */

import { getPortalRoot } from '../../lib/portal.js';

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} Currently open menu element */
let activeMenu = null;

/** @type {HTMLElement|null} Currently focused menu item */
let focusedItem = null;

/** @type {Array<HTMLElement>} All menu item elements in the open menu */
let menuItems = [];

// ============================================================================
// Menu Item Types
// ============================================================================

/**
 * @typedef {Object} MenuItem
 * @property {string} [id] - Unique identifier
 * @property {string} label - Display text
 * @property {string} [icon] - Icon HTML string or text
 * @property {string} [shortcut] - Keyboard shortcut text (e.g., 'Ctrl+S')
 * @property {boolean} [disabled=false] - Whether the item is disabled
 * @property {boolean} [checked=false] - Whether the item shows a checkmark
 * @property {boolean} [danger=false] - Whether to style as destructive
 * @property {boolean} [divider=false] - Whether this is a divider (no action)
 * @property {function} [action] - Callback when clicked
 * @property {MenuItem[]} [submenu] - Submenu items (future use)
 */

// ============================================================================
// SVG Icons
// ============================================================================

const CHECK_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8 7 12 13 4"/></svg>`;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Close the currently open menu and clean up listeners.
 */
function closeActiveMenu() {
    if (!activeMenu) return;
    activeMenu.remove();
    activeMenu = null;
    focusedItem = null;
    menuItems = [];
    document.removeEventListener('keydown', handleGlobalKeydown, true);
    document.removeEventListener('mousedown', handleGlobalMousedown, true);
}

/**
 * Handle global keydown for keyboard navigation.
 * @param {KeyboardEvent} e
 */
function handleGlobalKeydown(e) {
    if (!activeMenu) return;

    switch (e.key) {
        case 'Escape':
            e.preventDefault();
            closeActiveMenu();
            break;
        case 'ArrowDown':
            e.preventDefault();
            focusNextItem();
            break;
        case 'ArrowUp':
            e.preventDefault();
            focusPrevItem();
            break;
        case 'Home':
            e.preventDefault();
            focusItemAtIndex(0);
            break;
        case 'End':
            e.preventDefault();
            focusItemAtIndex(menuItems.length - 1);
            break;
        case 'Enter':
        case ' ':
            e.preventDefault();
            if (focusedItem) {
                activateItem(focusedItem);
            }
            break;
        case 'Tab':
            closeActiveMenu();
            break;
    }
}

/**
 * Handle global mousedown to close menu on outside clicks.
 * @param {MouseEvent} e
 */
function handleGlobalMousedown(e) {
    if (!activeMenu) return;
    if (!e.target || !(e.target instanceof HTMLElement)) return;
    if (!activeMenu.contains(e.target)) {
        closeActiveMenu();
    }
}

/**
 * Focus the next non-disabled menu item.
 */
function focusNextItem() {
    if (menuItems.length === 0) return;
    const currentIndex = focusedItem ? menuItems.indexOf(focusedItem) : -1;
    let nextIndex = currentIndex + 1;
    while (nextIndex < menuItems.length) {
        if (!menuItems[nextIndex].dataset.disabled) {
            focusItemAtIndex(nextIndex);
            return;
        }
        nextIndex++;
    }
    // Wrap to first
    focusItemAtIndex(0);
}

/**
 * Focus the previous non-disabled menu item.
 */
function focusPrevItem() {
    if (menuItems.length === 0) return;
    const currentIndex = focusedItem ? menuItems.indexOf(focusedItem) : menuItems.length;
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0) {
        if (!menuItems[prevIndex].dataset.disabled) {
            focusItemAtIndex(prevIndex);
            return;
        }
        prevIndex--;
    }
    // Wrap to last
    focusItemAtIndex(menuItems.length - 1);
}

/**
 * Focus a specific menu item by index.
 * @param {number} index
 */
function focusItemAtIndex(index) {
    if (index < 0 || index >= menuItems.length) return;
    if (focusedItem) {
        focusedItem.classList.remove('dropdown-menu-item--focused');
    }
    focusedItem = menuItems[index];
    focusedItem.classList.add('dropdown-menu-item--focused');
    focusedItem.scrollIntoView({ block: 'nearest' });
}

/**
 * Activate (click) a menu item.
 * @param {HTMLElement} item
 */
function activateItem(item) {
    if (item.dataset.disabled) return;
    const actionId = item.dataset.actionId;
    if (actionId && typeof item._action === 'function') {
        closeActiveMenu();
        item._action();
    } else if (item.dataset.divider) {
        // Divider — do nothing
    }
}

// ============================================================================
// Positioning
// ============================================================================

/**
 * Calculate the best position for the menu relative to the trigger button.
 * @param {DOMRect} triggerRect
 * @param {number} menuWidth
 * @param {number} menuHeight
 * @returns {{top: number, left: number, maxHeight: number}}
 */
function calculatePosition(triggerRect, menuWidth, menuHeight, rootRect) {
    // Coordinates are relative to the portal root (#ld-root), which is the
    // menu's positioned ancestor — the menu must stay within the phone
    // screen, not the browser viewport.
    let top = triggerRect.bottom - rootRect.top + 4;
    let left = triggerRect.left - rootRect.left;

    // Horizontal overflow — flip left
    if (left + menuWidth > rootRect.width) {
        left = triggerRect.right - rootRect.left - menuWidth;
    }

    // Left overflow — clamp
    if (left < 0) {
        left = 4;
    }

    // Vertical overflow — flip above
    const maxHeight = rootRect.height - 8;
    if (top + menuHeight > rootRect.height) {
        top = triggerRect.top - rootRect.top - menuHeight - 4;
    }

    // Top overflow — clamp
    if (top < 0) {
        top = 4;
    }

    return { top, left, maxHeight };
}

// ============================================================================
// DOM Creation
// ============================================================================

/**
 * Build the menu DOM from an array of menu items.
 * @param {MenuItem[]} items
 * @returns {{container: HTMLElement, items: HTMLElement[]}}
 */
function buildMenuDOM(items) {
    const container = document.createElement('div');
    container.className = 'dropdown-menu';
    container.setAttribute('role', 'menu');

    const resultItems = [];

    for (const item of items) {
        if (item.divider) {
            const divider = document.createElement('div');
            divider.className = 'dropdown-menu-divider';
            divider.setAttribute('role', 'separator');
            container.appendChild(divider);
            continue;
        }

        const el = document.createElement('div');
        el.className = 'dropdown-menu-item';
        el.setAttribute('role', 'menuitem');
        el.dataset.actionId = item.id || '';

        if (item.disabled) {
            el.dataset.disabled = 'true';
            el.classList.add('dropdown-menu-item--disabled');
        }

        if (item.danger) {
            el.classList.add('dropdown-menu-item--danger');
        }

        // Icon
        if (item.icon) {
            const iconEl = document.createElement('span');
            iconEl.className = 'dropdown-menu-item-icon';
            iconEl.innerHTML = item.icon;
            el.appendChild(iconEl);
        }

        // Label
        const labelEl = document.createElement('span');
        labelEl.className = 'dropdown-menu-item-label';
        labelEl.textContent = item.label;
        el.appendChild(labelEl);

        // Shortcut
        if (item.shortcut) {
            const shortcutEl = document.createElement('span');
            shortcutEl.className = 'dropdown-menu-item-shortcut';
            shortcutEl.textContent = item.shortcut;
            el.appendChild(shortcutEl);
        }

        // Checked indicator
        if (item.checked) {
            const checkEl = document.createElement('span');
            checkEl.className = 'dropdown-menu-item-check';
            checkEl.innerHTML = CHECK_ICON;
            el.appendChild(checkEl);
        }

        // Store action reference
        el._action = item.action || null;

        // Click handler
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            activateItem(el);
        });

        // Hover to focus
        el.addEventListener('mouseenter', () => {
            if (!el.dataset.disabled) {
                const index = resultItems.indexOf(el);
                if (index !== -1) {
                    focusItemAtIndex(index);
                }
            }
        });

        el.addEventListener('mouseleave', () => {
            el.classList.remove('dropdown-menu-item--focused');
            if (focusedItem === el) {
                focusedItem = null;
            }
        });

        container.appendChild(el);
        resultItems.push(el);
    }

    return { container, items: resultItems };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Show a dropdown menu anchored to a trigger element.
 *
 * @param {HTMLElement} trigger - The button or element that opens the menu
 * @param {MenuItem[]} items - Array of menu item definitions
 * @param {Object} [options]
 * @param {string} [options.align='left'] - 'left' or 'right' alignment
 * @param {number} [options.minWidth=180] - Minimum menu width
 * @param {number} [options.maxHeight=400] - Maximum menu height before scroll
 * @returns {HTMLElement} The menu container element
 */
export function showDropdown(trigger, items, options = {}) {
    const { align = 'left', minWidth = 180, maxHeight = 400 } = options;

    // Close any existing menu first
    closeActiveMenu();

    // Build DOM
    const { container: menuEl, items: itemEls } = buildMenuDOM(items);
    menuItems = itemEls;

    // Temporarily add to the portal root to measure
    const portalRoot = getPortalRoot();
    menuEl.style.visibility = 'hidden';
    menuEl.style.position = 'absolute';
    menuEl.style.width = `${minWidth}px`;
    portalRoot.appendChild(menuEl);

    // Measure
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();
    const rootRect = portalRoot.getBoundingClientRect();

    // Position (relative to the portal root)
    const pos = calculatePosition(triggerRect, menuRect.width, menuRect.height, rootRect);

    // Apply styles
    menuEl.style.cssText = `
        position: absolute;
        top: ${pos.top}px;
        left: ${align === 'right' ? Math.max(4, triggerRect.right - rootRect.left - menuRect.width) : pos.left}px;
        min-width: ${minWidth}px;
        max-height: ${Math.min(maxHeight, pos.maxHeight)}px;
        overflow-y: auto;
        z-index: 9999;
        visibility: visible;
    `;

    activeMenu = menuEl;

    // Focus first non-disabled item
    if (menuItems.length > 0) {
        const firstEnabled = menuItems.find((el) => !el.dataset.disabled);
        if (firstEnabled) {
            focusItemAtIndex(menuItems.indexOf(firstEnabled));
        }
    }

    // Register global listeners
    document.addEventListener('keydown', handleGlobalKeydown, true);
    document.addEventListener('mousedown', handleGlobalMousedown, true);

    return menuEl;
}

/**
 * Close the currently open dropdown menu.
 */
export function closeDropdown() {
    closeActiveMenu();
}

/**
 * Check if a dropdown menu is currently open.
 * @returns {boolean}
 */
export function isDropdownOpen() {
    return activeMenu !== null;
}

// ============================================================================
// CSS Injection
// ============================================================================

const CSS_ID = 'dropdown-menu-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .dropdown-menu {
            background: var(--color-bg-primary, #fff);
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-md, 6px);
            box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
            padding: 4px 0;
            font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: 13px;
            line-height: 1.4;
            overflow-y: auto;
            user-select: none;
        }

        .dropdown-menu-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            cursor: pointer;
            color: var(--color-text-primary, #1a1a1a);
            transition: background-color 0.1s ease;
            white-space: nowrap;
            min-height: 28px;
        }

        .dropdown-menu-item:hover,
        .dropdown-menu-item--focused {
            background-color: var(--color-accent, #2563eb);
            color: #fff;
        }

        .dropdown-menu-item--disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .dropdown-menu-item--disabled:hover,
        .dropdown-menu-item--disabled.dropdown-menu-item--focused {
            background-color: transparent;
            color: var(--color-text-primary, #1a1a1a);
        }

        .dropdown-menu-item--danger {
            color: var(--color-error, #ef4444);
        }

        .dropdown-menu-item--danger:hover,
        .dropdown-menu-item--danger.dropdown-menu-item--focused {
            background-color: var(--color-error, #ef4444);
            color: #fff;
        }

        .dropdown-menu-item-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            font-size: 14px;
        }

        .dropdown-menu-item-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .dropdown-menu-item-shortcut {
            margin-left: 16px;
            color: var(--color-text-tertiary, #999);
            font-size: 12px;
            flex-shrink: 0;
        }

        .dropdown-menu-item:hover .dropdown-menu-item-shortcut,
        .dropdown-menu-item--focused .dropdown-menu-item-shortcut {
            color: rgba(255, 255, 255, 0.7);
        }

        .dropdown-menu-item-check {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }

        .dropdown-menu-divider {
            height: 1px;
            background: var(--color-border-light, #e8e8e8);
            margin: 4px 0;
        }
    `;
    document.head.appendChild(style);
}

// Auto-inject styles on module load
injectStyles();
