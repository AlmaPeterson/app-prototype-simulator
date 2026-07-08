/**
 * Data State Store
 *
 * Vanilla JS pub/sub state manager for tabular label data.
 * Replaces the Zustand store from the TypeScript original.
 */

// ============================================================================
// State
// ============================================================================

let state = {
    columns: [
        { id: 'id', name: 'ID', type: 'text', required: true },
        { id: 'name', name: 'Name', type: 'text', required: true },
        { id: 'description', name: 'Description', type: 'text', required: false },
    ],
    rows: [],
    selectedRowIds: new Set(),
};

// ============================================================================
// Pub/Sub
// ============================================================================

/** @type {Set<function>} */
const listeners = new Set();

/**
 * Get the current state (read-only snapshot).
 * @returns {typeof state}
 */
export function getState() {
    return state;
}

/**
 * Merge a partial state update (or a function that returns one) into state
 * and notify all listeners.
 * @param {Partial<typeof state>|function} partial
 */
export function setState(partial) {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
    listeners.forEach((fn) => fn(state));
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 * @param {function} fn
 * @returns {function} unsubscribe
 */
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Replace all columns.
 * @param {import('../types.js').DataColumn[]} columns
 */
export function setColumns(columns) {
    setState({ columns });
}

/**
 * Replace all rows and clear selection.
 * @param {import('../types.js').DataRow[]} rows
 */
export function setRows(rows) {
    setState({ rows, selectedRowIds: new Set() });
}

/**
 * Append a single row.
 * @param {import('../types.js').DataRow} row
 */
export function addRow(row) {
    setState((s) => ({ rows: [...s.rows, row] }));
}

/**
 * Merge partial data into a row by ID.
 * @param {string} id
 * @param {Partial<import('../types.js').DataRow>} data
 */
export function updateRow(id, data) {
    setState((s) => ({
        rows: s.rows.map((row) => (row.id === id ? { ...row, ...data } : row)),
    }));
}

/**
 * Remove a row by ID and deselect it.
 * @param {string} id
 */
export function removeRow(id) {
    setState((s) => {
        const newSelectedIds = new Set(s.selectedRowIds);
        newSelectedIds.delete(id);
        return {
            rows: s.rows.filter((row) => row.id !== id),
            selectedRowIds: newSelectedIds,
        };
    });
}

/**
 * Add a new column. Throws if the name already exists.
 * @param {import('../types.js').DataColumn} column
 */
export function addColumn(column) {
    setState((s) => {
        const nameExists = s.columns.some(
            (c) => c.name.toLowerCase() === column.name.toLowerCase() && c.id !== column.id
        );
        if (nameExists) {
            throw new Error(`Column with name "${column.name}" already exists`);
        }
        return { columns: [...s.columns, column] };
    });
}

/**
 * Update a column by ID. If the name changes, row data keys are migrated.
 * @param {string} columnId
 * @param {Partial<import('../types.js').DataColumn>} updates
 */
export function updateColumn(columnId, updates) {
    setState((s) => {
        const columnIndex = s.columns.findIndex((c) => c.id === columnId);
        if (columnIndex === -1) {
            throw new Error(`Column with id "${columnId}" not found`);
        }

        if (updates.name) {
            const nameExists = s.columns.some(
                (c) =>
                    c.name.toLowerCase() === updates.name.toLowerCase() && c.id !== columnId
            );
            if (nameExists) {
                throw new Error(`Column with name "${updates.name}" already exists`);
            }
        }

        const newColumns = [...s.columns];
        newColumns[columnIndex] = { ...newColumns[columnIndex], ...updates };

        let newRows = s.rows;
        if (updates.name && s.columns[columnIndex].name !== updates.name) {
            const oldColumnName = s.columns[columnIndex].name;
            newRows = s.rows.map((row) => {
                const newRow = { ...row };
                if (oldColumnName in newRow) {
                    newRow[columnId] = newRow[oldColumnName];
                    delete newRow[oldColumnName];
                }
                return newRow;
            });
        }

        return { columns: newColumns, rows: newRows };
    });
}

/**
 * Rename a column (convenience wrapper around updateColumn).
 * @param {string} columnId
 * @param {string} newName
 */
export function renameColumn(columnId, newName) {
    updateColumn(columnId, { name: newName });
}

/**
 * Remove a column and clean up all row data for that column.
 * @param {string} id
 */
export function removeColumn(id) {
    setState((s) => {
        const newColumns = s.columns.filter((col) => col.id !== id);
        const newRows = s.rows.map((row) => {
            const newRow = { ...row };
            delete newRow[id];
            return newRow;
        });
        return { columns: newColumns, rows: newRows };
    });
}

/**
 * Clear all rows and selection.
 */
export function clearData() {
    setState({ rows: [], selectedRowIds: new Set() });
}

// --- Selection ---

/**
 * Toggle a row's selection state.
 * @param {string} rowId
 */
export function toggleRowSelection(rowId) {
    setState((s) => {
        const newSelectedIds = new Set(s.selectedRowIds);
        if (newSelectedIds.has(rowId)) {
            newSelectedIds.delete(rowId);
        } else {
            newSelectedIds.add(rowId);
        }
        return { selectedRowIds: newSelectedIds };
    });
}

/**
 * Select all rows.
 */
export function selectAllRows() {
    setState((s) => ({
        selectedRowIds: new Set(s.rows.map((row) => row.id)),
    }));
}

/**
 * Clear row selection.
 */
export function clearRowSelection() {
    setState({ selectedRowIds: new Set() });
}

/**
 * Check whether a specific row is selected.
 * @param {string} rowId
 * @returns {boolean}
 */
export function isRowSelected(rowId) {
    return state.selectedRowIds.has(rowId);
}
