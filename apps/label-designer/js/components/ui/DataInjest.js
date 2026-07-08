/**
 * DataInjest Component
 *
 * CSV data import with text paste, smart parsing, column mapping preview,
 * demo data import, mini data grid, and column manager integration.
 *
 * @module DataInjest
 */

import {
    getState,
    setColumns,
    setRows,
    updateRow,
    toggleRowSelection,
    selectAllRows,
    clearRowSelection,
} from '../../store/dataStore.js';
import { subscribe as subscribeData } from '../../store/dataStore.js';
import { parseCSV, sanitizeColumnName } from '../../lib/csvParser.js';
import { createDataColumn, createDataRow } from '../../types.js';
import { createColumnManager } from './ColumnManager.js';
import { showImageFixDialog } from './ImageFixDialog.js';

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"/><polyline points="12 5 8 1 4 5"/><line x1="8" y1="1" x2="8" y2="11"/></svg>',
    paste: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="10" height="11" rx="1"/><path d="M6 3V2a1 1 0 011-1h2a1 1 0 011 1v1"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 8 7 12 13 4"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M8 1L1 14h14L8 1z"/><line x1="8" y1="6" x2="8" y2="10"/><circle cx="8" cy="12" r="0.5" fill="#f59e0b"/></svg>',
};

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {function|null} */
let unsubData = null;

/** @type {HTMLElement|null} */
let columnManagerEl = null;

/** @type {Object|null} */
let columnManagerInstance = null;

/** @type {Array} */
let warnings = [];

/** @type {boolean} */
let skipEmptyRows = true;

/** @type {string} Current data-grid row search filter, kept across re-renders */
let rowSearchQuery = '';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Merge parsed CSV headers/rows into the data store.
 *
 * Headers are matched onto existing columns by case-insensitive name (so
 * re-importing a corrected CSV updates values in place instead of piling up
 * duplicate "Name", "Name (1)", "Name (2)" columns every time); only
 * genuinely new headers get a freshly created column. Columns not present
 * in this CSV — including ones the user added by hand via the Column
 * Manager — are left untouched. Row data is always a full replace, matching
 * the "one import = one dataset" mental model.
 *
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {boolean} skipEmpty
 */
function importParsedData(headers, rows, skipEmpty) {
    const state = getState();
    const existingColumns = state.columns;
    const existingNames = new Set(existingColumns.map((c) => c.name.toLowerCase()));
    const mergedColumns = [...existingColumns];
    const headerToColumnId = new Map();

    for (const header of headers) {
        const existing = existingColumns.find((c) => c.name.toLowerCase() === header.toLowerCase());
        if (existing) {
            headerToColumnId.set(header, existing.id);
            continue;
        }
        const sanitized = sanitizeColumnName(header, existingNames);
        existingNames.add(sanitized.toLowerCase());
        const column = createDataColumn({ name: sanitized });
        mergedColumns.push(column);
        headerToColumnId.set(header, column.id);
    }

    const cleanedRows = skipEmpty
        ? rows.filter((r) => r.some((cell) => (cell || '').trim() !== ''))
        : rows;

    const dataRows = cleanedRows.map((values) => {
        const row = createDataRow();
        headers.forEach((header, i) => {
            const columnId = headerToColumnId.get(header);
            if (values[i] !== undefined && values[i] !== '') {
                row[columnId] = values[i];
            }
        });
        return row;
    });

    setColumns(mergedColumns);
    setRows(dataRows);
    warnings = [];
    rowSearchQuery = '';
}

async function importDemoData() {
    // Real demo dataset: 51 tool-label rows (Name, Brand, QR, Image) shipped
    // with the app, merged in via the same column-matching path as a normal
    // CSV import.
    try {
        const url = new URL('../../../assets/tools_data.csv', import.meta.url);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const result = parseCSV(await resp.text());
        if (result.headers.length === 0) throw new Error('no columns in demo CSV');
        importParsedData(result.headers, result.rows, true);
        render();
    } catch (err) {
        console.error('Failed to load demo data:', err);
        alert('Failed to load demo data.');
    }
}

// ============================================================================
// Render
// ============================================================================

function render() {
    if (!panelEl) return;

    panelEl.innerHTML = '';

    const state = getState();

    // Status
    const status = document.createElement('div');
    status.className = 'di-status';
    status.textContent = state.columns.length + ' columns, ' + state.rows.length + ' rows';
    panelEl.appendChild(status);

    // Fix / browse images button — opens a dialog that groups any CSV rows
    // pointing at a missing image asset, and lets you search unused uploads
    // to assign the right one (updating the row data in place).
    const fixImagesBtn = document.createElement('button');
    fixImagesBtn.className = 'ld-btn ld-btn-secondary di-fix-images-btn';
    fixImagesBtn.innerHTML = ICONS.warning + ' Fix / Browse Images';
    fixImagesBtn.addEventListener('click', () => {
        showImageFixDialog();
    });
    panelEl.appendChild(fixImagesBtn);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.className = 'di-btn-row';

    const fileBtn = document.createElement('button');
    fileBtn.className = 'ld-btn ld-btn-secondary di-btn';
    fileBtn.innerHTML = ICONS.upload + ' Import CSV';
    fileBtn.addEventListener('click', handleFileImport);

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'ld-btn ld-btn-secondary di-btn';
    pasteBtn.innerHTML = ICONS.paste + ' Paste CSV';
    pasteBtn.addEventListener('click', handlePasteImport);

    const demoBtn = document.createElement('button');
    demoBtn.className = 'ld-btn ld-btn-secondary di-btn';
    demoBtn.textContent = 'Load Demo';
    demoBtn.addEventListener('click', () => {
        importDemoData();
    });

    btnRow.appendChild(fileBtn);
    btnRow.appendChild(pasteBtn);
    btnRow.appendChild(demoBtn);
    panelEl.appendChild(btnRow);

    // Skip empty rows checkbox
    const skipRow = document.createElement('div');
    skipRow.className = 'di-skip-row';

    const skipCheck = document.createElement('input');
    skipCheck.type = 'checkbox';
    skipCheck.checked = skipEmptyRows;
    skipCheck.addEventListener('change', () => {
        skipEmptyRows = skipCheck.checked;
    });

    const skipLabel = document.createElement('label');
    skipLabel.className = 'di-skip-label';
    skipLabel.appendChild(skipCheck);
    skipLabel.appendChild(document.createTextNode(' Skip empty rows'));

    skipRow.appendChild(skipLabel);
    panelEl.appendChild(skipRow);

    // Paste textarea (hidden by default)
    const pasteArea = document.createElement('div');
    pasteArea.className = 'di-paste-area';
    pasteArea.style.display = 'none';

    const textarea = document.createElement('textarea');
    textarea.className = 'di-textarea';
    textarea.rows = 6;
    textarea.placeholder = 'Paste CSV data here...';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'ld-btn ld-btn-primary di-apply-btn';
    applyBtn.textContent = 'Apply Data';
    applyBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        const result = parseCSV(text);
        warnings = result.errors;
        if (result.headers.length > 0) {
            importParsedData(result.headers, result.rows, skipEmptyRows);
        }
        pasteArea.style.display = 'none';
        render();
        if (warnings.length > 0) renderWarnings();
    });

    const cancelPasteBtn = document.createElement('button');
    cancelPasteBtn.className = 'ld-btn ld-btn-secondary di-apply-btn';
    cancelPasteBtn.textContent = 'Cancel';
    cancelPasteBtn.addEventListener('click', () => {
        pasteArea.style.display = 'none';
    });

    const pasteBtnRow = document.createElement('div');
    pasteBtnRow.className = 'di-btn-row';
    pasteBtnRow.appendChild(applyBtn);
    pasteBtnRow.appendChild(cancelPasteBtn);

    pasteArea.appendChild(textarea);
    pasteArea.appendChild(pasteBtnRow);
    panelEl.appendChild(pasteArea);

    // Column Manager
    const cmContainer = document.createElement('div');
    cmContainer.className = 'di-cm-container';
    panelEl.appendChild(cmContainer);

    if (columnManagerInstance) {
        columnManagerInstance.destroy();
    }
    columnManagerInstance = createColumnManager(cmContainer);
    columnManagerEl = cmContainer;

    // Clear data button
    if (state.rows.length > 0) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'ld-btn ld-btn-ghost di-clear-btn';
        clearBtn.textContent = 'Clear All Data';
        clearBtn.style.color = 'var(--color-error, #ef4444)';
        clearBtn.addEventListener('click', () => {
            setColumns([
                { id: 'id', name: 'ID', type: 'text', required: true },
                { id: 'name', name: 'Name', type: 'text', required: true },
                { id: 'description', name: 'Description', type: 'text', required: false },
            ]);
            setRows([]);
            rowSearchQuery = '';
        });
        panelEl.appendChild(clearBtn);
    }

    // Data grid preview
    if (state.rows.length > 0) {
        renderDataGrid(state);
    }

    // Show paste area function
    panelEl._showPaste = () => {
        pasteArea.style.display = pasteArea.style.display === 'none' ? '' : 'none';
    };

    function handleFileImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.tsv,.txt';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const result = parseCSV(text);
                warnings = result.errors;
                if (result.headers.length === 0) {
                    alert('No columns found in file.');
                    return;
                }
                importParsedData(result.headers, result.rows, skipEmptyRows);
                render();
                if (warnings.length > 0) renderWarnings();
            } catch (err) {
                console.error('Failed to parse file:', err);
                alert('Failed to parse file.');
            }
        };
        input.click();
    }

    function handlePasteImport() {
        const area = panelEl.querySelector('.di-paste-area');
        if (area) {
            area.style.display = area.style.display === 'none' ? '' : 'none';
        }
    }
}

function renderWarnings() {
    if (!panelEl || warnings.length === 0) return;

    const existing = panelEl.querySelector('.di-warnings');
    if (existing) existing.remove();

    const warnEl = document.createElement('div');
    warnEl.className = 'di-warnings';

    for (const w of warnings) {
        const item = document.createElement('div');
        item.className = 'di-warn-item';
        item.innerHTML = ICONS.warning + ' <span>' + w + '</span>';
        warnEl.appendChild(item);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'di-warn-close';
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener('click', () => warnEl.remove());
    warnEl.appendChild(closeBtn);

    panelEl.insertBefore(warnEl, panelEl.firstChild);
}

function renderDataGrid(state) {
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'di-grid-wrapper';

    const gridTitle = document.createElement('div');
    gridTitle.className = 'di-grid-title';

    const titleText = document.createElement('span');
    gridTitle.appendChild(titleText);

    const selectAllRow = document.createElement('div');
    selectAllRow.className = 'di-grid-select-all';

    const selectAllCheck = document.createElement('input');
    selectAllCheck.type = 'checkbox';
    selectAllCheck.checked = state.selectedRowIds.size === state.rows.length && state.rows.length > 0;
    selectAllCheck.addEventListener('change', () => {
        if (selectAllCheck.checked) {
            selectAllRows();
        } else {
            clearRowSelection();
        }
    });

    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'di-skip-label';
    selectAllLabel.appendChild(selectAllCheck);
    selectAllLabel.appendChild(document.createTextNode(' Select all'));

    selectAllRow.appendChild(selectAllLabel);
    gridTitle.appendChild(selectAllRow);
    gridWrapper.appendChild(gridTitle);

    // Row search — filters the (now fully rendered, no longer capped) grid
    // by matching against every column's value, so fixing a specific row in
    // a large dataset doesn't mean scrolling through hundreds of others.
    const searchRow = document.createElement('div');
    searchRow.className = 'di-grid-search-row';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'di-grid-search-input';
    searchInput.placeholder = 'Search rows…';
    searchInput.value = rowSearchQuery;
    searchInput.addEventListener('input', () => {
        rowSearchQuery = searchInput.value;
        applyRowFilter();
    });
    searchRow.appendChild(searchInput);
    gridWrapper.appendChild(searchRow);

    const table = document.createElement('div');
    table.className = 'di-grid';

    // Header
    const headerRow = document.createElement('div');
    headerRow.className = 'di-grid-row di-grid-header';

    const checkHeader = document.createElement('div');
    checkHeader.className = 'di-grid-cell di-grid-cell--check';
    headerRow.appendChild(checkHeader);

    for (const col of state.columns) {
        const cell = document.createElement('div');
        cell.className = 'di-grid-cell';
        cell.textContent = col.name;
        headerRow.appendChild(cell);
    }
    table.appendChild(headerRow);

    // All rows — filtering (not a hard cap) is what keeps a large dataset
    // manageable now, so every row is rendered up front.
    for (const row of state.rows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'di-grid-row';
        rowEl.dataset.search = state.columns
            .map((col) => (row[col.id] != null ? String(row[col.id]) : ''))
            .join(' ')
            .toLowerCase();

        const check = document.createElement('div');
        check.className = 'di-grid-cell di-grid-cell--check';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selectedRowIds.has(row.id);
        checkbox.addEventListener('change', () => {
            toggleRowSelection(row.id);
        });

        check.appendChild(checkbox);
        rowEl.appendChild(check);

        for (const col of state.columns) {
            const cell = document.createElement('div');
            cell.className = 'di-grid-cell di-grid-cell--editable';

            const value = row[col.id] != null ? String(row[col.id]) : '';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'di-grid-input';
            input.value = value;
            input.title = value;
            input.addEventListener('change', () => {
                const next = input.value;
                updateRow(row.id, { [col.id]: next === '' ? undefined : next });
                input.title = next;
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
            });

            cell.appendChild(input);
            rowEl.appendChild(cell);
        }

        table.appendChild(rowEl);
    }

    const noMatches = document.createElement('div');
    noMatches.className = 'di-grid-row di-grid-more di-grid-no-matches';
    noMatches.textContent = 'No rows match your search.';
    noMatches.style.display = 'none';
    table.appendChild(noMatches);

    gridWrapper.appendChild(table);
    panelEl.appendChild(gridWrapper);

    function applyRowFilter() {
        const q = rowSearchQuery.trim().toLowerCase();
        let visibleCount = 0;
        for (const rowEl of table.querySelectorAll('.di-grid-row:not(.di-grid-header):not(.di-grid-no-matches)')) {
            const match = !q || rowEl.dataset.search.includes(q);
            rowEl.style.display = match ? '' : 'none';
            if (match) visibleCount++;
        }
        noMatches.style.display = q && visibleCount === 0 ? '' : 'none';
        titleText.textContent = q
            ? `Data Preview (${visibleCount} of ${state.rows.length} rows)`
            : `Data Preview (${state.rows.length} rows)`;
    }

    applyRowFilter();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the data injest component.
 *
 * @param {HTMLElement} container - Parent element
 * @returns {{ element: HTMLElement, destroy: function() }}
 */
export function createDataInjest(container) {
    panelEl = document.createElement('div');
    panelEl.className = 'data-injest';

    container.appendChild(panelEl);

    unsubData = subscribeData(() => render());
    render();

    return {
        element: panelEl,
        destroy() {
            if (unsubData) unsubData();
            if (columnManagerInstance) columnManagerInstance.destroy();
            if (panelEl) panelEl.remove();
            panelEl = null;
        },
    };
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'data-injest-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
    #ld-root {
        .data-injest {
            user-select: none;
        }

        .di-status {
            font-size: 12px;
            color: var(--color-text-secondary, #666);
            text-align: center;
            padding: 8px;
            background: var(--color-bg-secondary, #f0f0f0);
            border-radius: var(--radius-sm, 4px);
            margin-bottom: 8px;
        }

        .di-fix-images-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            padding: 6px 8px;
            font-size: 11px;
            margin-bottom: 8px;
        }

        .di-btn-row {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }

        .di-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 6px 8px;
            font-size: 11px;
        }

        .di-skip-row {
            margin-bottom: 8px;
        }

        .di-skip-label {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: var(--color-text-secondary, #666);
            cursor: pointer;
        }

        .di-paste-area {
            margin-bottom: 8px;
        }

        .di-textarea {
            width: 100%;
            padding: 8px;
            font-size: 12px;
            font-family: var(--font-mono, monospace);
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            resize: vertical;
            min-height: 80px;
            box-sizing: border-box;
        }

        .di-textarea:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .di-apply-btn {
            margin-top: 6px;
        }

        .di-cm-container {
            margin-bottom: 8px;
        }

        .di-clear-btn {
            width: 100%;
            margin-bottom: 8px;
        }

        .di-warnings {
            background: #fffbeb;
            border: 1px solid #fbbf24;
            border-radius: var(--radius-sm, 4px);
            padding: 8px 12px;
            margin-bottom: 8px;
            position: relative;
        }

        .di-warn-item {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            font-size: 12px;
            color: #92400e;
            margin-bottom: 4px;
        }

        .di-warn-item:last-child {
            margin-bottom: 0;
        }

        .di-warn-close {
            position: absolute;
            top: 6px;
            right: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border: none;
            border-radius: var(--radius-sm, 4px);
            background: transparent;
            cursor: pointer;
            color: #92400e;
        }

        .di-warn-close:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        .di-grid-wrapper {
            margin-top: 8px;
        }

        .di-grid-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--color-text-secondary, #666);
            padding: 4px 8px;
        }

        .di-grid-select-all {
            font-weight: normal;
            text-transform: none;
            letter-spacing: normal;
        }

        .di-grid-search-row {
            padding: 0 8px 6px;
        }

        .di-grid-search-input {
            width: 100%;
            padding: 6px 10px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            box-sizing: border-box;
        }

        .di-grid-search-input:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .di-grid {
            border: 1px solid var(--color-border-light, #e8e8e8);
            border-radius: var(--radius-sm, 4px);
            overflow: auto;
            max-height: 420px;
        }

        .di-grid-row {
            display: flex;
            align-items: center;
            border-bottom: 1px solid var(--color-border-light, #e8e8e8);
        }

        .di-grid-row:last-child {
            border-bottom: none;
        }

        .di-grid-header {
            background: var(--color-bg-secondary, #f0f0f0);
            font-weight: 600;
            font-size: 11px;
            color: var(--color-text-secondary, #666);
            position: sticky;
            top: 0;
            z-index: 1;
        }

        .di-grid-more {
            justify-content: center;
            font-size: 11px;
            color: var(--color-text-tertiary, #999);
            font-style: italic;
            padding: 6px;
        }

        .di-grid-cell {
            flex: 1;
            padding: 4px 8px;
            font-size: 11px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
        }

        .di-grid-cell--check {
            flex: 0 0 28px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .di-grid-cell--check input {
            margin: 0;
        }

        .di-grid-cell--editable {
            padding: 0;
        }

        .di-grid-input {
            width: 100%;
            min-width: 0;
            padding: 4px 8px;
            font-size: 11px;
            font-family: inherit;
            color: inherit;
            border: 1px solid transparent;
            background: transparent;
            border-radius: 0;
            box-sizing: border-box;
        }

        .di-grid-input:hover {
            border-color: var(--color-border-light, #e8e8e8);
        }

        .di-grid-input:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
            background: var(--color-bg-primary, #fff);
        }
    }
    `;
    document.head.appendChild(style);
}

injectStyles();
