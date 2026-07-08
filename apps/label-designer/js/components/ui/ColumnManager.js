/**
 * ColumnManager Component
 *
 * Data column management: add, edit, delete columns with name, type, required fields.
 * Inline editing with validation.
 *
 * @module ColumnManager
 */

import {
    getState,
    subscribe,
    addColumn,
    updateColumn,
    removeColumn,
} from '../../store/dataStore.js';
import { showConfirmDialog } from './ConfirmDialog.js';
import { createDataColumn, ColumnType } from '../../types.js';

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    add: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 4 13 4"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M4 4l1 10h6l1-10"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 8 7 12 13 4"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
};

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {function|null} */
let unsubscribe = null;

/** @type {string|null} */
let editingColumnId = null;

// ============================================================================
// Column Type Options
// ============================================================================

const COLUMN_TYPES = [
    { value: ColumnType.TEXT, label: 'Text' },
    { value: ColumnType.NUMBER, label: 'Number' },
    { value: ColumnType.IMAGE, label: 'Image' },
    { value: ColumnType.QR, label: 'QR Code' },
    { value: ColumnType.BARCODE, label: 'Barcode' },
];

// ============================================================================
// Inline Edit Row
// ============================================================================

function createEditRow(column) {
    const row = document.createElement('div');
    row.className = 'cm-row cm-row--editing';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cm-input';
    nameInput.value = column.name;
    nameInput.placeholder = 'Column name';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'cm-select';
    for (const t of COLUMN_TYPES) {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        opt.selected = column.type === t.value;
        typeSelect.appendChild(opt);
    }

    const requiredCheck = document.createElement('input');
    requiredCheck.type = 'checkbox';
    requiredCheck.className = 'cm-checkbox';
    requiredCheck.checked = column.required;

    const requiredLabel = document.createElement('label');
    requiredLabel.className = 'cm-required-label';
    requiredLabel.appendChild(requiredCheck);
    requiredLabel.appendChild(document.createTextNode(' Req'));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'cm-btn cm-btn--save';
    saveBtn.innerHTML = ICONS.check;
    saveBtn.title = 'Save';
    saveBtn.addEventListener('click', () => {
        const newName = nameInput.value.trim();
        if (!newName) {
            nameInput.style.borderColor = 'var(--color-error, #ef4444)';
            return;
        }
        try {
            updateColumn(column.id, {
                name: newName,
                type: typeSelect.value,
                required: requiredCheck.checked,
            });
            editingColumnId = null;
            render();
        } catch (err) {
            nameInput.style.borderColor = 'var(--color-error, #ef4444)';
            nameInput.title = err.message;
        }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cm-btn cm-btn--cancel';
    cancelBtn.innerHTML = ICONS.close;
    cancelBtn.title = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        editingColumnId = null;
        render();
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
    });

    row.appendChild(nameInput);
    row.appendChild(typeSelect);
    row.appendChild(requiredLabel);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);

    return row;
}

// ============================================================================
// Render
// ============================================================================

function render() {
    if (!panelEl) return;

    panelEl.innerHTML = '';

    const state = getState();
    const columns = state.columns;

    const header = document.createElement('div');
    header.className = 'cm-header';

    const title = document.createElement('span');
    title.className = 'cm-title';
    title.textContent = 'Columns';

    const addBtn = document.createElement('button');
    addBtn.className = 'cm-btn';
    addBtn.innerHTML = ICONS.add;
    addBtn.title = 'Add column';
    addBtn.addEventListener('click', () => {
        const newCol = createDataColumn({ name: 'Column ' + (columns.length + 1) });
        try {
            addColumn(newCol);
            editingColumnId = newCol.id;
            render();
            requestAnimationFrame(() => {
                const input = panelEl.querySelector('.cm-row--editing .cm-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            });
        } catch (err) {
            alert(err.message);
        }
    });

    header.appendChild(title);
    header.appendChild(addBtn);
    panelEl.appendChild(header);

    if (columns.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'cm-hint';
        hint.textContent = 'No columns defined.';
        panelEl.appendChild(hint);
        return;
    }

    const list = document.createElement('div');
    list.className = 'cm-list';

    for (const col of columns) {
        if (editingColumnId === col.id) {
            list.appendChild(createEditRow(col));
            continue;
        }

        const row = document.createElement('div');
        row.className = 'cm-row';

        const name = document.createElement('span');
        name.className = 'cm-col-name';
        name.textContent = col.name;

        const typeBadge = document.createElement('span');
        typeBadge.className = 'cm-type-badge';
        typeBadge.textContent = COLUMN_TYPES.find((t) => t.value === col.type)?.label || col.type;

        const reqBadge = document.createElement('span');
        reqBadge.className = 'cm-req-badge';
        reqBadge.textContent = 'Req';
        reqBadge.style.display = col.required ? '' : 'none';

        const editBtn = document.createElement('button');
        editBtn.className = 'cm-btn';
        editBtn.innerHTML = ICONS.add.replace('8', '7.5').replace('8', '7.5');
        editBtn.title = 'Edit column';
        editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg>';
        editBtn.addEventListener('click', () => {
            editingColumnId = col.id;
            render();
            requestAnimationFrame(() => {
                const input = panelEl.querySelector('.cm-row--editing .cm-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            });
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'cm-btn cm-btn--danger';
        deleteBtn.innerHTML = ICONS.trash;
        deleteBtn.title = 'Delete column';
        deleteBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmDialog(
                'Delete Column',
                'Delete column "' + col.name + '"? This will also remove all data in this column.',
                { confirmLabel: 'Delete', danger: true }
            );
            if (confirmed) {
                removeColumn(col.id);
            }
        });

        row.appendChild(name);
        row.appendChild(typeBadge);
        if (col.required) row.appendChild(reqBadge);
        row.appendChild(editBtn);
        row.appendChild(deleteBtn);
        list.appendChild(row);
    }

    panelEl.appendChild(list);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the column manager component.
 *
 * @param {HTMLElement} container - Parent element
 * @returns {{ element: HTMLElement, destroy: function() }}
 */
export function createColumnManager(container) {
    panelEl = document.createElement('div');
    panelEl.className = 'column-manager';

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

const CSS_ID = 'column-manager-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .column-manager {
            user-select: none;
        }

        .cm-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 8px;
        }

        .cm-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--color-text-secondary, #666);
        }

        .cm-hint {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            text-align: center;
            padding: 16px 8px;
            font-style: italic;
        }

        .cm-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 0 4px 4px;
        }

        .cm-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 8px;
            border-radius: var(--radius-sm, 4px);
            transition: background-color 0.1s ease;
        }

        .cm-row:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .cm-row--editing {
            background: var(--color-bg-secondary, #f0f0f0);
            padding: 6px 8px;
            flex-wrap: wrap;
        }

        .cm-col-name {
            flex: 1;
            font-size: 12px;
            color: var(--color-text-primary, #1a1a1a);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .cm-type-badge {
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 8px;
            background: var(--color-bg-tertiary, #e8e8e8);
            color: var(--color-text-secondary, #666);
            flex-shrink: 0;
        }

        .cm-req-badge {
            font-size: 9px;
            padding: 1px 4px;
            border-radius: 4px;
            background: rgba(37, 99, 235, 0.1);
            color: var(--color-accent, #2563eb);
            font-weight: 600;
            flex-shrink: 0;
        }

        .cm-input {
            flex: 1;
            min-width: 0;
            padding: 4px 6px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
        }

        .cm-input:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .cm-select {
            padding: 4px 6px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
        }

        .cm-select:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .cm-checkbox {
            margin: 0;
        }

        .cm-required-label {
            font-size: 11px;
            color: var(--color-text-secondary, #666);
            display: flex;
            align-items: center;
            gap: 3px;
            flex-shrink: 0;
        }

        .cm-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: none;
            border-radius: var(--radius-sm, 4px);
            background: transparent;
            cursor: pointer;
            color: var(--color-text-tertiary, #999);
            transition: all 0.1s ease;
            flex-shrink: 0;
        }

        .cm-btn:hover {
            background: var(--color-bg-tertiary, #e8e8e8);
            color: var(--color-text-primary, #1a1a1a);
        }

        .cm-btn--save {
            color: var(--color-accent, #2563eb);
        }

        .cm-btn--save:hover {
            background: rgba(37, 99, 235, 0.1);
        }

        .cm-btn--cancel {
            color: var(--color-text-tertiary, #999);
        }

        .cm-btn--danger:hover {
            background: rgba(239, 68, 68, 0.1);
            color: var(--color-error, #ef4444);
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
