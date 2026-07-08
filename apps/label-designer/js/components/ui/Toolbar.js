/**
 * Toolbar Component
 *
 * Top toolbar with dropdown menus for File, Edit, View, and Zoom operations.
 * Uses the DropdownMenu component for menu rendering.
 *
 * @module Toolbar
 */

import { showDropdown, closeDropdown } from './DropdownMenu.js';
import {
    getState,
    subscribe,
    undo,
    redo,
    getCanUndo,
    getCanRedo,
    copyElements,
    pasteElements,
    duplicateElements,
    setViewMode,
    setPreviewPageIndex,
    setZoom,
    resetView,
    removeMasterElement,
    clearSelection,
    setTemplate,
    setMasterLabel,
} from '../../store/designStore.js';
import {
    getState as getDataState,
    setColumns,
    setRows,
    subscribe as subscribeData,
} from '../../store/dataStore.js';
import {
    serializeDesign,
    deserializeDesign,
    serializeDesignOnly,
    deserializeDesignOnly,
    validateDesignFile,
    validateDesignOnlyFile,
    getFileVersion,
} from '../../lib/fileFormat.js';
import { generateBulkPDF } from '../../lib/export.js';
import { checkMissingReferences } from '../../lib/referenceChecker.js';
import { showImageFixDialog } from './ImageFixDialog.js';
import { getPortalRoot, isDesignerVisible } from '../../lib/portal.js';

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} The root toolbar element */
let toolbarEl = null;

/** @type {function|null} Unsubscribe from design store */
let unsubscribeDesign = null;

/** @type {function|null} Unsubscribe from data store */
let unsubscribeData = null;

/** @type {number|null} Missing references count */
let missingRefCount = null;

/** @type {Object|null} Last known missing references result */
let lastRefResult = null;

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    save: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 14H3a1 1 0 01-1-1V3a1 1 0 011-1h7.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13a1 1 0 01-1 1z"/><path d="M10 14V9H6v5"/><path d="M6 2v3h5"/></svg>',
    load: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"/><polyline points="4 7 8 11 12 7"/><line x1="8" y1="2" x2="8" y2="11"/></svg>',
    export: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"/><polyline points="12 5 8 1 4 5"/><line x1="8" y1="1" x2="8" y2="11"/></svg>',
    undo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h7a3 3 0 110 6H7"/><polyline points="6 4 3 7 6 10"/></svg>',
    redo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 7H6a3 3 0 100 6h3"/><polyline points="10 4 13 7 10 10"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M5 11H3a1 1 0 01-1-1V3a1 1 0 011-1h7a1 1 0 011 1v2"/></svg>',
    paste: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="10" height="11" rx="1"/><path d="M6 3V2a1 1 0 011-1h2a1 1 0 011 1v1"/></svg>',
    duplicate: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="9" height="9" rx="1"/><rect x="2" y="2" width="9" height="9" rx="1"/></svg>',
    template: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="8" y1="2" x2="8" y2="14"/></svg>',
    preview: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6z"/><circle cx="8" cy="8" r="2"/></svg>',
    zoomIn: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="7" y1="5" x2="7" y2="9"/></svg>',
    zoomOut: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/></svg>',
    zoomReset: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M8 1L1 14h14L8 1z"/><line x1="8" y1="6" x2="8" y2="10"/><circle cx="8" cy="12" r="0.5" fill="#f59e0b"/></svg>',
    chevronLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="10 3 5 8 10 13"/></svg>',
    chevronRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 3 11 8 6 13"/></svg>',
    page: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/></svg>',
};

// ============================================================================
// File Operations
// ============================================================================

/**
 * Show a confirmation dialog.
 * @param {string} message
 * @returns {boolean}
 */
function confirm(message) {
    return window.confirm(message);
}

/**
 * Save full design + data file.
 */
function handleSaveAll() {
    try {
        const designState = getState();
        const dataState = getDataState();
        const json = serializeDesign(designState, dataState);
        downloadJSON(json, generateFilename('full', 'labeldesign'));
    } catch (err) {
        console.error('Failed to save:', err);
        alert('Failed to save design. See console for details.');
    }
}

/**
 * Load full design + data file.
 */
function handleLoadAll() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.labeldesign,.json';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const text = await readFileAsText(file);
            const parsed = JSON.parse(text);
            if (!validateDesignFile(parsed)) {
                alert('Invalid file format.');
                return;
            }
            const result = deserializeDesign(parsed);
            if (result.validationErrors.length > 0) {
                alert(`File loaded with errors:\n${result.validationErrors.join('\n')}`);
            }
            setTemplate(result.design.template);
            setMasterLabel(result.design.masterLabel);
            setColumns(result.data.columns);
            setRows(result.data.rows);
        } catch (err) {
            console.error('Failed to load:', err);
            alert('Failed to load file. See console for details.');
        }
    };
    input.click();
}

/**
 * Save design only (no data).
 */
function handleSaveDesign() {
    try {
        const designState = getState();
        const json = serializeDesignOnly(designState);
        downloadJSON(json, generateFilename('design-only', 'labeltemplate'));
    } catch (err) {
        console.error('Failed to save design:', err);
        alert('Failed to save design. See console for details.');
    }
}

/**
 * Load design only (no data).
 */
function handleLoadDesign() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.labeltemplate,.labeldesign,.json';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const text = await readFileAsText(file);
            const parsed = JSON.parse(text);
            const result = deserializeDesignOnly(parsed);
            setTemplate(result.template);
            setMasterLabel(result.masterLabel);
        } catch (err) {
            console.error('Failed to load design:', err);
            alert('Failed to load design. See console for details.');
        }
    };
    input.click();
}

/**
 * Export to PDF.
 */
function handleExportPDF() {
    showExportDialog();
}

/**
 * Export selection only (filtered rows).
 */
function handleExportSelection() {
    showExportDialog(true);
}

/**
 * Show the export progress dialog.
 * @param {boolean} [selectionOnly=false]
 */
function showExportDialog(selectionOnly = false) {
    const state = getState();
    const dataState = getDataState();

    if (dataState.rows.length === 0 && selectionOnly) {
        alert('No data rows to export.');
        return;
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute; inset: 0; background: rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center; z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #fff; border-radius: 8px; padding: 24px; min-width: 320px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    `;

    const title = document.createElement('h3');
    title.textContent = 'Exporting PDF...';
    title.style.cssText = 'margin: 0 0 16px; font-size: 16px;';

    const progressOuter = document.createElement('div');
    progressOuter.style.cssText = `
        width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;
    `;

    const progressInner = document.createElement('div');
    progressInner.style.cssText = `
        height: 100%; width: 0%; background: #2563eb; border-radius: 4px; transition: width 0.2s;
    `;

    const statusText = document.createElement('p');
    statusText.style.cssText = 'margin: 8px 0 0; font-size: 13px; color: #666;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'ld-btn ld-btn-secondary';
    cancelBtn.style.cssText = 'margin-top: 16px;';

    let cancelled = false;
    cancelBtn.onclick = () => { cancelled = true; overlay.remove(); };

    progressOuter.appendChild(progressInner);
    dialog.appendChild(title);
    dialog.appendChild(progressOuter);
    dialog.appendChild(statusText);
    dialog.appendChild(cancelBtn);
    overlay.appendChild(dialog);
    getPortalRoot().appendChild(overlay);

    // Start export
    const selectedRowIds = selectionOnly ? dataState.selectedRowIds : null;
    const filename = `labels-${Date.now()}.pdf`;

    generateBulkPDF({
        template: state.template,
        masterLabel: state.masterLabel,
        rows: dataState.rows,
        labelOverrides: state.labelOverrides,
        filename,
        selectedRowIds,
        columns: dataState.columns,
        onProgress: (current, total) => {
            if (cancelled) return;
            const pct = Math.round((current / total) * 100);
            progressInner.style.width = `${pct}%`;
            statusText.textContent = `${current} / ${total} labels`;
        },
    }).then(() => {
        if (!cancelled) {
            title.textContent = 'Export Complete';
            statusText.textContent = 'PDF downloaded successfully.';
            cancelBtn.textContent = 'Close';
            cancelBtn.onclick = () => overlay.remove();
        }
    }).catch((err) => {
        console.error('Export failed:', err);
        if (!cancelled) {
            title.textContent = 'Export Failed';
            statusText.textContent = err.message || 'An error occurred.';
            cancelBtn.textContent = 'Close';
            cancelBtn.onclick = () => overlay.remove();
        }
    });
}

// ============================================================================
// Helpers
// ============================================================================

function generateFilename(type, ext) {
    const now = new Date();
    const d = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((n) => String(n).padStart(2, '0')).join('-');
    const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, '0')).join('');
    return `label-${type}-${d}-${t}.${ext}`;
}

function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file, 'UTF-8');
    });
}

// ============================================================================
// Menu Definitions
// ============================================================================

function getFileMenuItems() {
    return [
        { id: 'save-all', label: 'Save All', icon: ICONS.save, shortcut: 'Ctrl+Shift+S', action: handleSaveAll },
        { id: 'load-all', label: 'Load All', icon: ICONS.load, shortcut: 'Ctrl+Shift+O', action: handleLoadAll },
        { divider: true },
        { id: 'save-design', label: 'Save Design', icon: ICONS.save, shortcut: 'Ctrl+S', action: handleSaveDesign },
        { id: 'load-design', label: 'Load Design', icon: ICONS.load, shortcut: 'Ctrl+O', action: handleLoadDesign },
        { divider: true },
        { id: 'export-pdf', label: 'Export PDF', icon: ICONS.export, shortcut: 'Ctrl+E', action: handleExportPDF },
        { id: 'export-selection', label: 'Export Selection', icon: ICONS.export, action: handleExportSelection },
    ];
}

function getEditMenuItems() {
    const state = getState();
    return [
        { id: 'undo', label: 'Undo', icon: ICONS.undo, shortcut: 'Ctrl+Z', disabled: !getCanUndo(), action: undo },
        { id: 'redo', label: 'Redo', icon: ICONS.redo, shortcut: 'Ctrl+Shift+Z', disabled: !getCanRedo(), action: redo },
        { divider: true },
        { id: 'copy', label: 'Copy', icon: ICONS.copy, shortcut: 'Ctrl+C', disabled: state.selectedElementIds.length === 0, action: () => copyElements(state.selectedElementIds) },
        { id: 'paste', label: 'Paste', icon: ICONS.paste, shortcut: 'Ctrl+V', disabled: state.clipboard.length === 0, action: pasteElements },
        { id: 'duplicate', label: 'Duplicate', icon: ICONS.duplicate, shortcut: 'Ctrl+D', disabled: state.selectedElementIds.length === 0, action: () => duplicateElements(state.selectedElementIds) },
    ];
}

/**
 * Total pages in Preview mode: one page per sheet-full of labels, sized to
 * fit however many data rows are actually imported. Previously this was
 * miscomputed as (labels-per-page / labels-per-page), which is always 1 —
 * "Next Page" was permanently disabled and the page counter always read
 * "Page 1 of 1" regardless of how much data was loaded.
 * @param {ReturnType<typeof getState>} state
 * @param {ReturnType<typeof getDataState>} dataState
 * @returns {number}
 */
function getTotalPreviewPages(state, dataState) {
    const labelsPerPage = state.template.rows * state.template.columns;
    return Math.max(1, Math.ceil(dataState.rows.length / labelsPerPage));
}

function getViewMenuItems() {
    const state = getState();
    const isTemplate = state.viewMode === 'TEMPLATE';
    const totalPages = getTotalPreviewPages(state, getDataState());
    const pageItems = [];

    if (!isTemplate) {
        pageItems.push(
            { divider: true },
            { id: 'prev-page', label: 'Previous Page', icon: ICONS.chevronLeft, shortcut: '', disabled: state.previewPageIndex === 0, action: () => setPreviewPageIndex(state.previewPageIndex - 1) },
            { id: 'next-page', label: 'Next Page', icon: ICONS.chevronRight, shortcut: '', disabled: state.previewPageIndex >= totalPages - 1, action: () => setPreviewPageIndex(state.previewPageIndex + 1) },
        );
    }

    return [
        { id: 'toggle-template', label: isTemplate ? 'Switch to Preview' : 'Switch to Template', icon: isTemplate ? ICONS.preview : ICONS.template, action: () => setViewMode(isTemplate ? 'PREVIEW' : 'TEMPLATE') },
        ...pageItems,
    ];
}

function getZoomMenuItems() {
    const state = getState();
    const zoomPct = Math.round(state.zoom * 100);
    return [
        { id: 'zoom-in', label: `Zoom In`, icon: ICONS.zoomIn, shortcut: 'Ctrl++', action: () => setZoom(state.zoom + 0.1) },
        { id: 'zoom-out', label: `Zoom Out`, icon: ICONS.zoomOut, shortcut: 'Ctrl+-', action: () => setZoom(state.zoom - 0.1) },
        { divider: true },
        { id: 'zoom-reset', label: `Reset Zoom (${zoomPct}%)`, icon: ICONS.zoomReset, shortcut: 'Ctrl+0', action: resetView },
        { id: 'zoom-50', label: '50%', checked: state.zoom === 0.5, action: () => setZoom(0.5) },
        { id: 'zoom-75', label: '75%', checked: state.zoom === 0.75, action: () => setZoom(0.75) },
        { id: 'zoom-100', label: '100%', checked: state.zoom === 1.0, action: () => setZoom(1.0) },
        { id: 'zoom-150', label: '150%', checked: state.zoom === 1.5, action: () => setZoom(1.5) },
        { id: 'zoom-200', label: '200%', checked: state.zoom === 2.0, action: () => setZoom(2.0) },
    ];
}

// ============================================================================
// DOM Creation
// ============================================================================

/**
 * Create a toolbar button with optional dropdown.
 * @param {string} label
 * @param {function} [onClick]
 * @returns {{ button: HTMLElement, label: HTMLElement }}
 */
function createToolbarButton(label, onClick) {
    const wrapper = document.createElement('div');
    wrapper.className = 'toolbar-menu-item';

    const btn = document.createElement('button');
    btn.className = 'toolbar-button';
    btn.textContent = label;

    if (onClick) {
        btn.addEventListener('click', onClick);
    }

    wrapper.appendChild(btn);
    return { button: wrapper, label: btn };
}

/**
 * Create a dropdown toolbar button.
 * @param {string} label
 * @param {function} getItems - Function returning MenuItem[]
 * @returns {{ wrapper: HTMLElement, button: HTMLElement }}
 */
function createDropdownButton(label, getItems) {
    const wrapper = document.createElement('div');
    wrapper.className = 'toolbar-menu-item';

    const btn = document.createElement('button');
    btn.className = 'toolbar-button toolbar-button--dropdown';
    btn.textContent = label;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDropdown(btn, getItems(), { align: 'left' });
    });

    wrapper.appendChild(btn);
    return { wrapper, button: btn };
}

/**
 * Render the toolbar into the given container.
 *
 * @param {HTMLElement} container - Parent element to render into
 * @returns {HTMLElement} The toolbar root element
 */
export function createToolbar(container) {
    // Root element
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'toolbar';

    // File menu
    const fileMenu = createDropdownButton('File', getFileMenuItems);

    // Edit menu
    const editMenu = createDropdownButton('Edit', getEditMenuItems);

    // View menu
    const viewMenu = createDropdownButton('View', getViewMenuItems);

    // Zoom menu
    const zoomMenu = createDropdownButton('Zoom', getZoomMenuItems);

    // Zoom display
    const zoomDisplay = document.createElement('span');
    zoomDisplay.className = 'toolbar-zoom-display';
    zoomDisplay.textContent = '100%';

    // Missing references indicator
    const refIndicator = document.createElement('button');
    refIndicator.className = 'toolbar-ref-indicator';
    refIndicator.style.display = 'none';
    refIndicator.innerHTML = ICONS.warning;
    refIndicator.addEventListener('mouseenter', () => showRefTooltip(refIndicator));
    refIndicator.addEventListener('mouseleave', hideRefTooltip);
    refIndicator.addEventListener('focus', () => showRefTooltip(refIndicator));
    refIndicator.addEventListener('blur', hideRefTooltip);
    refIndicator.addEventListener('click', () => {
        hideRefTooltip();
        // Missing images are the one issue with an actual fix flow — jump
        // straight there instead of burying it as the last, easy-to-miss
        // item in a dropdown otherwise full of disabled/informational rows.
        // Missing columns/data (no fix flow yet) still fall back to the list.
        if (lastRefResult && lastRefResult.missingImages.length > 0) {
            showImageFixDialog();
            return;
        }
        showRefIndicatorDropdown(refIndicator);
    });

    // Page navigation (shown in preview mode)
    const pageNav = document.createElement('div');
    pageNav.className = 'toolbar-page-nav';
    pageNav.style.display = 'none';

    const prevPageBtn = document.createElement('button');
    prevPageBtn.className = 'toolbar-icon-btn';
    prevPageBtn.innerHTML = ICONS.chevronLeft;
    prevPageBtn.addEventListener('click', () => {
        const s = getState();
        if (s.previewPageIndex > 0) setPreviewPageIndex(s.previewPageIndex - 1);
    });

    const pageInfo = document.createElement('span');
    pageInfo.className = 'toolbar-page-info';

    const nextPageBtn = document.createElement('button');
    nextPageBtn.className = 'toolbar-icon-btn';
    nextPageBtn.innerHTML = ICONS.chevronRight;
    nextPageBtn.addEventListener('click', () => {
        const s = getState();
        const maxPage = getTotalPreviewPages(s, getDataState()) - 1;
        if (s.previewPageIndex < maxPage) setPreviewPageIndex(s.previewPageIndex + 1);
    });

    pageNav.appendChild(prevPageBtn);
    pageNav.appendChild(pageInfo);
    pageNav.appendChild(nextPageBtn);

    // Assemble toolbar
    toolbarEl.appendChild(fileMenu.wrapper);
    toolbarEl.appendChild(editMenu.wrapper);
    toolbarEl.appendChild(viewMenu.wrapper);

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';
    toolbarEl.appendChild(spacer);

    toolbarEl.appendChild(pageNav);
    toolbarEl.appendChild(refIndicator);
    toolbarEl.appendChild(zoomMenu.wrapper);
    toolbarEl.appendChild(zoomDisplay);

    // Insert at start of container
    container.insertBefore(toolbarEl, container.firstChild);

    // Subscribe to state changes
    unsubscribeDesign = subscribe(() => {
        updateToolbarState();
        scheduleMissingRefsCheck();
    });
    unsubscribeData = subscribeData(() => scheduleMissingRefsCheck());
    updateToolbarState();

    // Initial check
    checkMissingRefs();

    return toolbarEl;
}

// ============================================================================
// State Update
// ============================================================================

function updateToolbarState() {
    if (!toolbarEl) return;

    const state = getState();
    const zoomPct = Math.round(state.zoom * 100);

    // Update zoom display
    const zoomEl = toolbarEl.querySelector('.toolbar-zoom-display');
    if (zoomEl) zoomEl.textContent = `${zoomPct}%`;

    // Show/hide page nav
    const pageNav = toolbarEl.querySelector('.toolbar-page-nav');
    if (pageNav) {
        pageNav.style.display = state.viewMode === 'PREVIEW' ? 'flex' : 'none';
    }

    // Update page info
    const pageInfo = toolbarEl.querySelector('.toolbar-page-info');
    if (pageInfo) {
        const totalPages = getTotalPreviewPages(state, getDataState());
        pageInfo.textContent = `Page ${state.previewPageIndex + 1} of ${totalPages}`;
    }

    // Update missing ref indicator
    if (lastRefResult) {
        const refEl = toolbarEl.querySelector('.toolbar-ref-indicator');
        if (refEl) {
            const count = lastRefResult.totalCount;
            if (count > 0) {
                refEl.style.display = 'flex';
                refEl.setAttribute('aria-label', `${count} missing reference(s) detected — hover for details`);
            } else {
                refEl.style.display = 'none';
                hideRefTooltip();
            }
        }
    }
}

// ============================================================================
// Missing References Check
// ============================================================================

async function checkMissingRefs() {
    const state = getState();
    const dataState = getDataState();
    try {
        lastRefResult = await checkMissingReferences(
            state.template,
            state.masterLabel,
            state.labelOverrides,
            dataState.rows,
            dataState.columns
        );
        updateToolbarState();
    } catch (err) {
        console.error('Failed to check references:', err);
    }
}

/** @type {number|null} */
let refCheckDebounceTimer = null;

/**
 * Re-run the missing-reference check shortly after design/data changes
 * (adding an element, importing data, uploading/deleting an asset, editing
 * a binding, ...). Debounced so rapid-fire updates — e.g. dragging an
 * element, which can post many state updates a second — only trigger one
 * check after things settle, rather than one per update.
 */
function scheduleMissingRefsCheck() {
    if (refCheckDebounceTimer) clearTimeout(refCheckDebounceTimer);
    refCheckDebounceTimer = setTimeout(() => {
        refCheckDebounceTimer = null;
        checkMissingRefs();
    }, 400);
}

/** Cap on how many individual named entries to list per category before summarizing. */
const REF_LIST_LIMIT = 5;

/**
 * Build dropdown items naming the specific missing things (image filenames,
 * column names) rather than just a bare count — "3 missing images" doesn't
 * tell you which ones to go fix.
 * @param {string} heading
 * @param {string[]} names - already deduplicated
 * @returns {Array}
 */
function buildNamedRefItems(heading, names) {
    const unique = Array.from(new Set(names));
    const items = [{ label: `${heading} (${unique.length})`, disabled: true }];
    for (const name of unique.slice(0, REF_LIST_LIMIT)) {
        items.push({ label: `  ${name}`, disabled: true });
    }
    if (unique.length > REF_LIST_LIMIT) {
        items.push({ label: `  +${unique.length - REF_LIST_LIMIT} more`, disabled: true });
    }
    return items;
}

function showRefIndicatorDropdown(trigger) {
    if (!lastRefResult || lastRefResult.totalCount === 0) return;

    // Missing images are handled by jumping straight to the fix dialog (see
    // the click handler above), so this list only ever needs to cover the
    // issues that don't have a dedicated fix flow.
    const items = [];
    if (lastRefResult.missingColumns.length > 0) {
        if (items.length > 0) items.push({ divider: true });
        items.push(
            ...buildNamedRefItems('Missing columns', lastRefResult.missingColumns.map((m) => m.columnName)),
        );
    }
    if (lastRefResult.missingData.length > 0) {
        if (items.length > 0) items.push({ divider: true });
        items.push({ label: `Missing data (${lastRefResult.missingData.length} entries)`, disabled: true });
    }

    showDropdown(trigger, items, { align: 'right', minWidth: 220 });
}

// ============================================================================
// Missing References Hover Preview
// ============================================================================

/** @type {HTMLElement|null} Currently shown hover preview for the ref indicator */
let refTooltipEl = null;

function hideRefTooltip() {
    if (refTooltipEl) {
        refTooltipEl.remove();
        refTooltipEl = null;
    }
}

/**
 * Build the hover preview's content: a count summary, a peek at the actual
 * missing image names (the thing most likely to need fixing), and a hint
 * that tells you what clicking will actually do — so the icon isn't just
 * "something's wrong, click to find out."
 */
function buildRefTooltipContent() {
    const frag = document.createElement('div');

    // Dedupe by name — the checker emits one raw entry per (label position ×
    // row), so a template with several labels per page inflates the same
    // handful of missing filenames into a much bigger-looking number.
    const imageNames = Array.from(new Set(lastRefResult.missingImages.map((m) => m.imageName)));
    const columnNames = Array.from(new Set(lastRefResult.missingColumns.map((m) => m.columnName)));

    const summaryParts = [];
    if (imageNames.length > 0) {
        summaryParts.push(`${imageNames.length} missing image${imageNames.length === 1 ? '' : 's'}`);
    }
    if (columnNames.length > 0) {
        summaryParts.push(`${columnNames.length} missing column${columnNames.length === 1 ? '' : 's'}`);
    }
    if (lastRefResult.missingData.length > 0) {
        summaryParts.push(`${lastRefResult.missingData.length} missing data ${lastRefResult.missingData.length === 1 ? 'entry' : 'entries'}`);
    }

    const summary = document.createElement('div');
    summary.className = 'toolbar-ref-tooltip-summary';
    summary.textContent = summaryParts.join(' · ');
    frag.appendChild(summary);

    if (imageNames.length > 0) {
        const names = imageNames;
        const list = document.createElement('ul');
        list.className = 'toolbar-ref-tooltip-list';
        for (const name of names.slice(0, 4)) {
            const li = document.createElement('li');
            li.textContent = name;
            li.title = name;
            list.appendChild(li);
        }
        if (names.length > 4) {
            const li = document.createElement('li');
            li.className = 'toolbar-ref-tooltip-more';
            li.textContent = `+${names.length - 4} more`;
            list.appendChild(li);
        }
        frag.appendChild(list);
    }

    const hint = document.createElement('div');
    hint.className = 'toolbar-ref-tooltip-hint';
    hint.textContent = lastRefResult.missingImages.length > 0
        ? 'Click to fix missing images →'
        : 'Click to view details →';
    frag.appendChild(hint);

    return frag;
}

function showRefTooltip(trigger) {
    if (!lastRefResult || lastRefResult.totalCount === 0) return;
    hideRefTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'toolbar-ref-tooltip';
    tooltip.appendChild(buildRefTooltipContent());

    const portalRoot = getPortalRoot();
    tooltip.style.visibility = 'hidden';
    portalRoot.appendChild(tooltip);

    const triggerRect = trigger.getBoundingClientRect();
    const rootRect = portalRoot.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = triggerRect.bottom - rootRect.top + 6;
    let left = triggerRect.right - rootRect.left - tooltipRect.width;
    if (left < 4) left = 4;
    if (top + tooltipRect.height > rootRect.height - 4) {
        top = triggerRect.top - rootRect.top - tooltipRect.height - 6;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.visibility = 'visible';

    refTooltipEl = tooltip;
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function isTextInput(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (e.target && e.target.isContentEditable) return true;
    return false;
}

function handleKeyboardShortcuts(e) {
    // This listener lives on document for the lifetime of the page — bail
    // out unless the designer is the app actually showing in the phone.
    if (!isDesignerVisible()) return;
    // Don't hijack Ctrl+C/V/Z etc. while the user is typing in any text
    // field (Property Panel inputs, the canvas inline text editor) — those
    // should get normal browser copy/paste/undo, not app-level element ops.
    if (isTextInput(e)) return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); handleSaveAll(); }
    else if (ctrl && e.shiftKey && e.key === 'O') { e.preventDefault(); handleLoadAll(); }
    else if (ctrl && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSaveDesign(); }
    else if (ctrl && !e.shiftKey && e.key === 'o') { e.preventDefault(); handleLoadDesign(); }
    else if (ctrl && !e.shiftKey && e.key === 'e') { e.preventDefault(); handleExportPDF(); }
    else if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
    else if (ctrl && e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); }
    else if (ctrl && e.key === 'c') { e.preventDefault(); const s = getState(); copyElements(s.selectedElementIds); }
    else if (ctrl && e.key === 'v') { e.preventDefault(); pasteElements(); }
    else if (ctrl && e.key === 'd') { e.preventDefault(); const s = getState(); duplicateElements(s.selectedElementIds); }
    else if (ctrl && e.key === '=') { e.preventDefault(); const s = getState(); setZoom(s.zoom + 0.1); }
    else if (ctrl && e.key === '-') { e.preventDefault(); const s = getState(); setZoom(s.zoom - 0.1); }
    else if (ctrl && e.key === '0') { e.preventDefault(); resetView(); }
}

document.addEventListener('keydown', handleKeyboardShortcuts);

// ============================================================================
// Cleanup
// ============================================================================

export function destroyToolbar() {
    if (unsubscribeDesign) unsubscribeDesign();
    if (unsubscribeData) unsubscribeData();
    if (refCheckDebounceTimer) clearTimeout(refCheckDebounceTimer);
    refCheckDebounceTimer = null;
    hideRefTooltip();
    if (toolbarEl) toolbarEl.remove();
    toolbarEl = null;
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'toolbar-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .toolbar {
            display: flex;
            align-items: center;
            height: var(--toolbar-height, 48px);
            background: var(--color-bg-primary, #fff);
            border-bottom: 1px solid var(--color-border, #d0d0d0);
            padding: 0 var(--spacing-sm, 8px);
            gap: 2px;
            user-select: none;
            flex-shrink: 0;
            z-index: 100;
        }

        .toolbar-menu-item {
            position: relative;
        }

        .toolbar-button {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border-radius: var(--radius-sm, 4px);
            font-size: 13px;
            font-weight: 500;
            color: var(--color-text-primary, #1a1a1a);
            background: transparent;
            border: none;
            cursor: pointer;
            transition: background-color 0.1s ease;
            white-space: nowrap;
            height: 32px;
        }

        .toolbar-button:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .toolbar-button--dropdown::after {
            content: '';
            display: inline-block;
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 4px solid currentColor;
            margin-left: 2px;
            opacity: 0.6;
        }

        .toolbar-spacer {
            flex: 1;
        }

        .toolbar-zoom-display {
            font-size: 12px;
            color: var(--color-text-secondary, #666);
            padding: 0 8px;
            min-width: 40px;
            text-align: center;
            font-variant-numeric: tabular-nums;
        }

        .toolbar-page-nav {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-right: 8px;
            padding: 0 8px;
            border-left: 1px solid var(--color-border-light, #e8e8e8);
            border-right: 1px solid var(--color-border-light, #e8e8e8);
            height: 32px;
        }

        .toolbar-icon-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: var(--radius-sm, 4px);
            color: var(--color-text-secondary, #666);
            background: transparent;
            border: none;
            cursor: pointer;
            transition: background-color 0.1s ease;
        }

        .toolbar-icon-btn:hover {
            background: var(--color-bg-secondary, #f0f0f0);
            color: var(--color-text-primary, #1a1a1a);
        }

        .toolbar-icon-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .toolbar-page-info {
            font-size: 12px;
            color: var(--color-text-secondary, #666);
            min-width: 80px;
            text-align: center;
            font-variant-numeric: tabular-nums;
        }

        .toolbar-ref-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: var(--radius-sm, 4px);
            color: #f59e0b;
            background: transparent;
            border: none;
            cursor: pointer;
            transition: background-color 0.1s ease;
            margin-right: 4px;
        }

        .toolbar-ref-indicator:hover {
            background: rgba(245, 158, 11, 0.1);
        }

        .toolbar-ref-tooltip {
            position: absolute;
            z-index: 9998;
            max-width: 260px;
            background: var(--color-text-primary, #1a1a1a);
            color: #fff;
            border-radius: var(--radius-sm, 4px);
            padding: 8px 10px;
            font-size: 11px;
            line-height: 1.5;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
            pointer-events: none;
        }

        .toolbar-ref-tooltip-summary {
            font-weight: 600;
            color: #fbbf24;
            margin-bottom: 4px;
        }

        .toolbar-ref-tooltip-list {
            list-style: none;
            margin: 0 0 6px;
            padding: 0;
        }

        .toolbar-ref-tooltip-list li {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: rgba(255, 255, 255, 0.85);
        }

        .toolbar-ref-tooltip-more {
            font-style: italic;
            color: rgba(255, 255, 255, 0.6) !important;
        }

        .toolbar-ref-tooltip-hint {
            color: rgba(255, 255, 255, 0.7);
            border-top: 1px solid rgba(255, 255, 255, 0.15);
            padding-top: 4px;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
