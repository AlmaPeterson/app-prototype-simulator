/**
 * ColorInput Component
 *
 * Color picker with hex input supporting transparent state,
 * real-time validation, and toggle between color and transparent.
 *
 * @module ColorInput
 */

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    transparent: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="14" x2="14" y2="2"/></svg>',
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize a hex color string. Supports #RGB and #RRGGBB.
 * Returns null if invalid.
 * @param {string} hex
 * @returns {string|null}
 */
function normalizeHex(hex) {
    if (!hex) return null;
    let val = hex.trim();
    if (val[0] !== '#') val = '#' + val;
    if (/^#[0-9a-fA-F]{3}$/.test(val)) {
        const r = val[1];
        const g = val[2];
        const b = val[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        return val.toLowerCase();
    }
    return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a color input component.
 *
 * @param {HTMLElement} container - Parent element to render into
 * @param {Object} opts
 * @param {string} [opts.value='#000000'] - Initial hex color or 'transparent'
 * @param {function(string):void} opts.onChange - Callback with new value
 * @returns {{ element: HTMLElement, setValue: function(string):void, getValue: function():string }}
 */
export function createColorInput(container, { value = '#000000', onChange } = {}) {
    let currentValue = value || '#000000';
    let isTransparent = currentValue === 'transparent';

    const wrapper = document.createElement('div');
    wrapper.className = 'ci-wrapper';

    // Color picker (hidden when transparent)
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'ci-picker';
    colorPicker.value = isTransparent ? '#000000' : currentValue;

    // Hex text input
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'ci-hex';
    hexInput.value = isTransparent ? '' : currentValue;
    hexInput.maxLength = 7;
    hexInput.placeholder = 'transparent';
    hexInput.spellcheck = false;

    // Transparent toggle button
    const transparentBtn = document.createElement('button');
    transparentBtn.className = 'ci-transparent-btn';
    transparentBtn.title = 'Toggle transparent';
    transparentBtn.innerHTML = ICONS.transparent;

    // Checkerboard overlay (shown when transparent)
    const checkerOverlay = document.createElement('div');
    checkerOverlay.className = 'ci-checker';

    // Color swatch area
    const swatchArea = document.createElement('div');
    swatchArea.className = 'ci-swatch-area';

    swatchArea.appendChild(checkerOverlay);
    swatchArea.appendChild(colorPicker);

    wrapper.appendChild(swatchArea);
    wrapper.appendChild(hexInput);
    wrapper.appendChild(transparentBtn);

    // --- Validation display ---
    function setValid(valid) {
        hexInput.style.borderColor = valid ? '' : 'var(--color-error, #ef4444)';
    }

    // --- Sync state ---
    function applyValue(newVal) {
        currentValue = newVal;
        isTransparent = newVal === 'transparent';
        if (isTransparent) {
            colorPicker.style.display = 'none';
            checkerOverlay.style.display = 'block';
            hexInput.value = '';
            hexInput.placeholder = 'transparent';
        } else {
            colorPicker.style.display = '';
            checkerOverlay.style.display = 'none';
            colorPicker.value = newVal || '#000000';
            hexInput.value = newVal || '';
            hexInput.placeholder = '';
        }
    }

    function commitColor(hex) {
        const normalized = normalizeHex(hex);
        if (normalized) {
            setValid(true);
            currentValue = normalized;
            applyValue(normalized);
            onChange?.(normalized);
        } else {
            setValid(false);
        }
    }

    // --- Events ---
    colorPicker.addEventListener('input', () => {
        setValid(true);
        currentValue = colorPicker.value;
        hexInput.value = colorPicker.value;
        checkerOverlay.style.display = 'none';
        isTransparent = false;
        onChange?.(colorPicker.value);
    });

    hexInput.addEventListener('change', () => {
        const raw = hexInput.value.trim();
        if (!raw) {
            isTransparent = true;
            applyValue('transparent');
            onChange?.('transparent');
            setValid(true);
            return;
        }
        commitColor(raw);
    });

    hexInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            hexInput.blur();
        }
    });

    hexInput.addEventListener('input', () => {
        const raw = hexInput.value.trim();
        if (!raw || raw === 'transparent') {
            setValid(true);
            return;
        }
        const normalized = normalizeHex(raw);
        setValid(normalized !== null);
    });

    transparentBtn.addEventListener('click', () => {
        isTransparent = !isTransparent;
        if (isTransparent) {
            applyValue('transparent');
            onChange?.('transparent');
        } else {
            const fallback = normalizeHex(hexInput.value) || '#000000';
            applyValue(fallback);
            onChange?.(fallback);
        }
        setValid(true);
    });

    // --- Init ---
    applyValue(currentValue);

    container.appendChild(wrapper);

    return {
        element: wrapper,
        setValue(newVal) {
            applyValue(newVal || 'transparent');
            setValid(true);
        },
        getValue() {
            return currentValue;
        },
    };
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'color-input-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .ci-wrapper {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;
        }

        .ci-swatch-area {
            position: relative;
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            overflow: hidden;
            cursor: pointer;
        }

        .ci-swatch-area input[type="color"] {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: none;
            padding: 0;
            cursor: pointer;
            background: transparent;
        }

        .ci-swatch-area input[type="color"]::-webkit-color-swatch-wrapper {
            padding: 2px;
        }

        .ci-swatch-area input[type="color"]::-webkit-color-swatch {
            border: none;
            border-radius: 2px;
        }

        .ci-checker {
            position: absolute;
            inset: 0;
            background-image:
                linear-gradient(45deg, #ccc 25%, transparent 25%),
                linear-gradient(-45deg, #ccc 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #ccc 75%),
                linear-gradient(-45deg, transparent 75%, #ccc 75%);
            background-size: 8px 8px;
            background-position: 0 0, 0 4px, 4px -4px, -4px 0;
            display: none;
        }

        .ci-hex {
            flex: 1;
            min-width: 0;
            padding: 4px 6px;
            font-size: 12px;
            font-family: var(--font-mono, monospace);
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
        }

        .ci-hex:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .ci-transparent-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
            cursor: pointer;
            color: var(--color-text-tertiary, #999);
            flex-shrink: 0;
            transition: all 0.1s ease;
        }

        .ci-transparent-btn:hover {
            background: var(--color-bg-secondary, #f0f0f0);
            color: var(--color-text-primary, #1a1a1a);
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
