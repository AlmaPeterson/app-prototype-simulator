/**
 * ColumnFixDialog Component
 *
 * Modal for resolving missing column references — an element (text, image,
 * or QR placeholder) bound to a columnId that doesn't exist in the current
 * data table. This happens whenever a design and a data set were authored
 * independently and then paired up (loading a saved .labeltemplate against
 * a fresh CSV import, or another app handing off both together): the
 * design's bindings are baked to specific column ids that only ever existed
 * in the original author's session, so nothing lines up until someone picks
 * which current column each broken binding should actually point at. This
 * dialog is that picker — mirrors ImageFixDialog's group/assign pattern,
 * but rewrites element bindings on the design store rather than row data on
 * the data store.
 *
 * @module ColumnFixDialog
 */

import { getPortalRoot } from '../../lib/portal.js';
import { getState as getDesignState, updateMasterElement, updateLabelElement } from '../../store/designStore.js';
import { getState as getDataState } from '../../store/dataStore.js';
import { checkMissingReferences } from '../../lib/referenceChecker.js';

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let overlayEl = null;

/** @type {HTMLElement|null} */
let bodyEl = null;

/** @type {Map<string, string>} broken-entry key -> chosen column id (pending, not yet applied) */
let pendingChoices = new Map();

// ============================================================================
// Helpers
// ============================================================================

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find an element by id in the master label or, failing that, in any label override's additionalElements. */
function locateElement(elementId, masterLabel, labelOverrides) {
    const masterEl = masterLabel.elements.find((el) => el.id === elementId);
    if (masterEl) return { element: masterEl, scope: 'master', labelIndex: null };
    for (const [labelIndex, override] of labelOverrides.entries()) {
        const additional = override.additionalElements.find((el) => el.id === elementId);
        if (additional) return { element: additional, scope: 'override', labelIndex };
    }
    return null;
}

/** Which binding on the element this missing-column entry actually refers to. */
function bindingKindFor(element, columnNameOrId) {
    if (element.type === 'placeholder' && element.placeholderType === 'image') return 'imageNameBinding';
    if (element.type === 'placeholder' && element.placeholderType === 'qrCode') return 'qrValueBinding';
    if (element.type === 'text') {
        const structured = (element.bindings || []).some((b) => b.columnId === columnNameOrId);
        return structured ? 'textBinding' : 'textLiteral';
    }
    return null;
}

function elementSummary(element, kind, columnName) {
    if (kind === 'imageNameBinding') return { typeLabel: 'Image placeholder', detail: element.displayText || 'Image' };
    if (kind === 'qrValueBinding') return { typeLabel: 'QR Code placeholder', detail: element.displayText || 'QR Code' };
    if (kind === 'textLiteral') return { typeLabel: 'Text', detail: `“${element.content}”` };
    if (kind === 'textBinding') return { typeLabel: 'Text (bound)', detail: `“${element.content}”` };
    return { typeLabel: 'Element', detail: columnName };
}

/**
 * Collapse the checker's one-entry-per-label output into one row per
 * distinct (element, missing reference) pair, with a count of how many
 * labels it affects.
 */
function collectBrokenBindings(missingColumns, masterLabel, labelOverrides) {
    const byKey = new Map();
    for (const m of missingColumns) {
        const key = m.elementId + '::' + m.columnName;
        if (!byKey.has(key)) {
            byKey.set(key, { elementId: m.elementId, columnName: m.columnName, labelIndices: new Set() });
        }
        byKey.get(key).labelIndices.add(m.labelIndex);
    }

    const results = [];
    for (const entry of byKey.values()) {
        const located = locateElement(entry.elementId, masterLabel, labelOverrides);
        if (!located) continue; // element was deleted since the check ran
        const kind = bindingKindFor(located.element, entry.columnName);
        if (!kind) continue;
        const key = entry.elementId + '::' + entry.columnName;
        results.push({
            key,
            elementId: entry.elementId,
            columnName: entry.columnName,
            labelCount: entry.labelIndices.size,
            element: located.element,
            scope: located.scope,
            overrideLabelIndex: located.labelIndex,
            kind,
            ...elementSummary(located.element, kind, entry.columnName),
        });
    }
    // Stable order so the list doesn't reshuffle as the user works through it.
    results.sort((a, b) => a.key.localeCompare(b.key));
    return results;
}

function applyColumnFix(broken, targetColumn) {
    const { element, scope, overrideLabelIndex, kind, columnName } = broken;
    let updates = null;

    if (kind === 'imageNameBinding') {
        updates = { imageNameBinding: { property: 'imageName', columnId: targetColumn.id } };
    } else if (kind === 'qrValueBinding') {
        updates = { qrValueBinding: { property: 'qrValue', columnId: targetColumn.id } };
    } else if (kind === 'textBinding') {
        updates = {
            bindings: (element.bindings || []).map((b) =>
                b.columnId === columnName ? { ...b, columnId: targetColumn.id } : b
            ),
        };
    } else if (kind === 'textLiteral') {
        const pattern = new RegExp('\\{' + escapeRegExp(columnName) + '\\}|<' + escapeRegExp(columnName) + '>', 'g');
        updates = { content: element.content.replace(pattern, '{' + targetColumn.name + '}') };
    }

    if (!updates) return;

    if (scope === 'master') {
        updateMasterElement(element.id, updates);
    } else {
        updateLabelElement(overrideLabelIndex, element.id, updates);
    }
}

// ============================================================================
// Render
// ============================================================================

async function loadComputed() {
    const designState = getDesignState();
    const dataState = getDataState();
    const result = await checkMissingReferences(
        designState.template,
        designState.masterLabel,
        designState.labelOverrides,
        dataState.rows,
        dataState.columns
    );
    return {
        columns: dataState.columns,
        broken: collectBrokenBindings(result.missingColumns, designState.masterLabel, designState.labelOverrides),
    };
}

async function refresh(statusMsg) {
    if (!bodyEl) return;
    try {
        const computed = await loadComputed();
        render(computed, statusMsg);
    } catch (err) {
        console.error('ColumnFixDialog: failed to load', err);
        bodyEl.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'cfd-static-note';
        errEl.textContent = 'Failed to load column data: ' + (err?.message || err);
        bodyEl.appendChild(errEl);
    }
}

function render(computed, statusMsg) {
    const { columns, broken } = computed;

    bodyEl.innerHTML = '';

    if (statusMsg) {
        const status = document.createElement('div');
        status.className = 'cfd-status';
        status.textContent = statusMsg;
        bodyEl.appendChild(status);
    }

    const section = document.createElement('div');
    section.className = 'cfd-section';

    const title = document.createElement('div');
    title.className = 'cfd-section-title';
    title.textContent = broken.length > 0
        ? `Unresolved column references (${broken.length})`
        : 'No unresolved column references — nice.';
    section.appendChild(title);

    if (columns.length === 0 && broken.length > 0) {
        const note = document.createElement('div');
        note.className = 'cfd-static-note';
        note.textContent = 'There’s no data loaded yet, so there’s nothing to bind these to. Import or paste data first.';
        section.appendChild(note);
    }

    for (const item of broken) {
        const row = document.createElement('div');
        row.className = 'cfd-group';

        const info = document.createElement('div');
        info.className = 'cfd-group-info';

        const typeEl = document.createElement('div');
        typeEl.className = 'cfd-group-type';
        typeEl.textContent = item.typeLabel;

        const detailEl = document.createElement('div');
        detailEl.className = 'cfd-group-detail';
        detailEl.textContent = item.detail;
        detailEl.title = item.detail;

        const metaEl = document.createElement('div');
        metaEl.className = 'cfd-group-meta';
        metaEl.textContent = `Affects ${item.labelCount} label${item.labelCount === 1 ? '' : 's'}`;

        info.appendChild(typeEl);
        info.appendChild(detailEl);
        info.appendChild(metaEl);

        const controls = document.createElement('div');
        controls.className = 'cfd-group-controls';

        const select = document.createElement('select');
        select.className = 'cfd-select';

        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = columns.length > 0 ? 'Choose a column…' : 'No columns available';
        select.appendChild(placeholderOpt);

        for (const col of columns) {
            const opt = document.createElement('option');
            opt.value = col.id;
            opt.textContent = col.name;
            select.appendChild(opt);
        }

        const chosen = pendingChoices.get(item.key);
        if (chosen && columns.some((c) => c.id === chosen)) select.value = chosen;

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'ld-btn ld-btn-secondary cfd-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.disabled = !select.value;

        select.addEventListener('change', () => {
            if (select.value) pendingChoices.set(item.key, select.value);
            else pendingChoices.delete(item.key);
            applyBtn.disabled = !select.value;
        });

        applyBtn.addEventListener('click', () => {
            const targetColumn = columns.find((c) => c.id === select.value);
            if (!targetColumn) return;
            applyColumnFix(item, targetColumn);
            pendingChoices.delete(item.key);
            refresh(`Bound "${item.detail}" to column "${targetColumn.name}".`);
        });

        controls.appendChild(select);
        controls.appendChild(applyBtn);

        row.appendChild(info);
        row.appendChild(controls);
        section.appendChild(row);
    }

    bodyEl.appendChild(section);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Open the Fix Missing Columns dialog. No-op if already open.
 */
export async function showColumnFixDialog() {
    if (overlayEl) return;

    const overlay = document.createElement('div');
    overlay.className = 'cfd-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'cfd-dialog';

    const header = document.createElement('div');
    header.className = 'cfd-header';

    const title = document.createElement('h3');
    title.className = 'cfd-title';
    title.textContent = 'Fix Missing Columns';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cfd-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', close);

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'cfd-body';

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }
    document.addEventListener('keydown', handleKeydown);

    function close() {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        overlayEl = null;
        bodyEl = null;
        pendingChoices = new Map();
    }

    getPortalRoot().appendChild(overlay);
    overlayEl = overlay;
    bodyEl = body;

    await refresh(undefined);
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'column-fix-dialog-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .cfd-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }

        .cfd-dialog {
            background: var(--color-bg-primary, #fff);
            border-radius: 8px;
            width: min(92%, 460px);
            max-height: 85%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: cfd-in 0.15s ease;
        }

        @keyframes cfd-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .cfd-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px 12px;
            border-bottom: 1px solid var(--color-border-light, #e8e8e8);
            flex-shrink: 0;
        }

        .cfd-title {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--color-text-primary, #1a1a1a);
        }

        .cfd-close-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            border: none;
            border-radius: var(--radius-sm, 4px);
            background: transparent;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            color: var(--color-text-tertiary, #999);
        }

        .cfd-close-btn:hover {
            background: var(--color-bg-secondary, #f0f0f0);
            color: var(--color-text-primary, #1a1a1a);
        }

        .cfd-body {
            padding: 12px 20px 20px;
            overflow-y: auto;
        }

        .cfd-status {
            font-size: 12px;
            color: #166534;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: var(--radius-sm, 4px);
            padding: 8px 10px;
            margin-bottom: 12px;
        }

        .cfd-section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--color-text-secondary, #666);
            margin-bottom: 8px;
        }

        .cfd-static-note {
            font-size: 12px;
            color: #92400e;
            background: #fffbeb;
            border: 1px solid #fbbf24;
            border-radius: var(--radius-sm, 4px);
            padding: 8px 10px;
            margin-bottom: 8px;
        }

        .cfd-group {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border: 1px solid var(--color-border-light, #e8e8e8);
            border-radius: var(--radius-sm, 4px);
            padding: 8px 10px;
            margin-bottom: 8px;
        }

        .cfd-group-info {
            min-width: 0;
            flex: 1;
        }

        .cfd-group-type {
            font-size: 11px;
            font-weight: 600;
            color: var(--color-accent, #2563eb);
        }

        .cfd-group-detail {
            font-size: 13px;
            color: var(--color-text-primary, #1a1a1a);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .cfd-group-meta {
            font-size: 11px;
            color: var(--color-text-secondary, #666);
        }

        .cfd-group-controls {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }

        .cfd-select {
            font-size: 12px;
            padding: 5px 6px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            max-width: 140px;
        }

        .cfd-select:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .cfd-apply-btn {
            flex-shrink: 0;
            padding: 5px 10px;
            font-size: 12px;
            white-space: nowrap;
        }

        .cfd-apply-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
