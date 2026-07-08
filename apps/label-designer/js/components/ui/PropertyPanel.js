/**
 * PropertyPanel Component
 *
 * Right sidebar for editing selected element properties including
 * transform, text, shape, and placeholder settings.
 *
 * @module PropertyPanel
 */

import {
    getState,
    subscribe,
    updateMasterElement,
    updateLabelElement,
    removeMasterElement,
    clearSelection,
    alignElementsToLabel,
} from '../../store/designStore.js';
import { getState as getDataState, subscribe as subscribeData } from '../../store/dataStore.js';
import { createResizable } from './Resizable.js';

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {{container: HTMLElement, destroy: function}|null} */
let resizable = null;

/** @type {function|null} */
let unsubDesign = null;

/** @type {function|null} */
let unsubData = null;

/** @type {string|null} Currently rendered element ID */
let currentRenderedElementId = null;

/** @type {boolean} True when user is actively editing an input */
let isEditing = false;

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    alignLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="2" y2="14"/><rect x="2" y="3" width="10" height="3" fill="currentColor" opacity="0.3"/><rect x="2" y="8" width="7" height="3" fill="currentColor" opacity="0.3"/></svg>',
    alignCenterH: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="2" x2="8" y2="14"/><rect x="3" y="3" width="10" height="3" fill="currentColor" opacity="0.3"/><rect x="5" y="8" width="6" height="3" fill="currentColor" opacity="0.3"/></svg>',
    alignRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="14" y1="2" x2="14" y2="14"/><rect x="4" y="3" width="10" height="3" fill="currentColor" opacity="0.3"/><rect x="7" y="8" width="7" height="3" fill="currentColor" opacity="0.3"/></svg>',
    alignTop: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="14" y2="2"/><rect x="3" y="2" width="3" height="10" fill="currentColor" opacity="0.3"/><rect x="8" y="2" width="3" height="7" fill="currentColor" opacity="0.3"/></svg>',
    alignCenterV: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="8" x2="14" y2="8"/><rect x="3" y="3" width="3" height="10" fill="currentColor" opacity="0.3"/><rect x="8" y="5" width="3" height="6" fill="currentColor" opacity="0.3"/></svg>',
    alignBottom: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="14" x2="14" y2="14"/><rect x="3" y="4" width="3" height="10" fill="currentColor" opacity="0.3"/><rect x="8" y="5" width="3" height="7" fill="currentColor" opacity="0.3"/></svg>',
    delete: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 4 13 4"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M4 4l1 10h6l1-10"/><line x1="7" y1="7" x2="7" y2="12"/><line x1="9" y1="7" x2="9" y2="12"/></svg>',
    bold: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h5a3 3 0 011.5 5.6A3.5 3.5 0 019.5 14H4V2zm2 5h3a1 1 0 000-2H6v2zm0 2v3h3.5a1.5 1.5 0 000-3H6z"/></svg>',
    italic: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h6v2h-2.1l-3 8H9v2H3v-2h2.1l3-8H6V2z"/></svg>',
    textLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="3" x2="14" y2="3"/><line x1="2" y1="7" x2="10" y2="7"/><line x1="2" y1="11" x2="12" y2="11"/></svg>',
    textCenter: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="3" x2="14" y2="3"/><line x1="4" y1="7" x2="12" y2="7"/><line x1="3" y1="11" x2="13" y2="11"/></svg>',
    textRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="3" x2="14" y2="3"/><line x1="6" y1="7" x2="14" y2="7"/><line x1="4" y1="11" x2="14" y2="11"/></svg>',
    link: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 10l4-4"/><path d="M9 3h4v4"/><path d="M7 13H3V9"/></svg>',
    unlink: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 9l2-2"/><path d="M11 5h3v3"/><path d="M5 13H2V9"/></svg>',
};

// ============================================================================
// Helpers
// ============================================================================

function getSelectedElement() {
    const state = getState();
    if (state.selectedElementIds.length !== 1) return null;
    const id = state.selectedElementIds[0];
    return state.masterLabel.elements.find((el) => el.id === id) || null;
}

function getSelectedLabelIndex() {
    return getState().selectedLabelIndex;
}

function updateElement(id, updates) {
    const state = getState();
    if (state.viewMode === 'PREVIEW' && state.selectedLabelIndex !== null) {
        updateLabelElement(state.selectedLabelIndex, id, updates);
    } else {
        updateMasterElement(id, updates);
    }
}

function formatNumber(n) {
    return n != null ? String(Math.round(n * 100) / 100) : '';
}

function parseNumber(val) {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}

// ============================================================================
// Section Builders
// ============================================================================

function createSection(title) {
    const section = document.createElement('div');
    section.className = 'pp-section';

    const header = document.createElement('div');
    header.className = 'pp-section-header';
    header.textContent = title;

    const body = document.createElement('div');
    body.className = 'pp-section-body';

    section.appendChild(header);
    section.appendChild(body);
    return { section, body };
}

function createRow(label, control) {
    const row = document.createElement('div');
    row.className = 'pp-row';

    if (label) {
        const labelEl = document.createElement('label');
        labelEl.className = 'pp-label';
        labelEl.textContent = label;
        row.appendChild(labelEl);
    }

    row.appendChild(control);
    return row;
}

function addFocusTracking(el) {
    el.addEventListener('focus', () => { isEditing = true; });
    el.addEventListener('blur', () => { isEditing = false; });
}

function createNumberInput(value, onChange, opts = {}) {
    const { min, max, step, unit, compact = false } = opts;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = compact ? 'pp-input pp-input--compact' : 'pp-input';
    input.value = value != null ? value : '';
    if (min != null) input.min = min;
    if (max != null) input.max = max;
    if (step != null) input.step = step;

    input.addEventListener('change', () => {
        const val = parseNumber(input.value);
        if (val !== null) onChange(val);
    });

    input.addEventListener('focus', () => { isEditing = true; });
    input.addEventListener('blur', () => { isEditing = false; });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        }
    });

    if (unit) {
        const wrapper = document.createElement('div');
        wrapper.className = 'pp-input-group';
        wrapper.appendChild(input);
        const unitEl = document.createElement('span');
        unitEl.className = 'pp-input-unit';
        unitEl.textContent = unit;
        wrapper.appendChild(unitEl);
        return wrapper;
    }

    return input;
}

function createColorInput(value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pp-color-input';

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'pp-color-swatch';
    color.value = value || '#000000';

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'pp-color-hex';
    hex.value = value || '#000000';
    hex.maxLength = 7;

    color.addEventListener('input', () => {
        hex.value = color.value;
        onChange(color.value);
    });
    color.addEventListener('focus', () => { isEditing = true; });
    color.addEventListener('blur', () => { isEditing = false; });

    hex.addEventListener('change', () => {
        const val = hex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            color.value = val;
            onChange(val);
        }
    });
    hex.addEventListener('focus', () => { isEditing = true; });
    hex.addEventListener('blur', () => { isEditing = false; });

    wrapper.appendChild(color);
    wrapper.appendChild(hex);
    return wrapper;
}

function createAlignmentButtons(currentAlign, onChange) {
    const group = document.createElement('div');
    group.className = 'pp-button-group';

    const options = [
        { value: 'left', icon: ICONS.textLeft, title: 'Align Left' },
        { value: 'center', icon: ICONS.textCenter, title: 'Align Center' },
        { value: 'right', icon: ICONS.textRight, title: 'Align Right' },
    ];

    for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'pp-btn-icon' + (currentAlign === opt.value ? ' pp-btn-icon--active' : '');
        btn.innerHTML = opt.icon;
        btn.title = opt.title;
        btn.addEventListener('click', () => onChange(opt.value));
        group.appendChild(btn);
    }

    return group;
}

function createAlignToLabelButtons(elementId) {
    const group = document.createElement('div');
    group.className = 'pp-button-group';

    const options = [
        { value: 'left', icon: ICONS.alignLeft, title: 'Align Left to Label' },
        { value: 'centerH', icon: ICONS.alignCenterH, title: 'Center Horizontally' },
        { value: 'right', icon: ICONS.alignRight, title: 'Align Right to Label' },
        { value: 'top', icon: ICONS.alignTop, title: 'Align Top to Label' },
        { value: 'centerV', icon: ICONS.alignCenterV, title: 'Center Vertically' },
        { value: 'bottom', icon: ICONS.alignBottom, title: 'Align Bottom to Label' },
    ];

    for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'pp-btn-icon';
        btn.innerHTML = opt.icon;
        btn.title = opt.title;
        btn.addEventListener('click', () => alignElementsToLabel([elementId], opt.value));
        group.appendChild(btn);
    }

    return group;
}

// ============================================================================
// Section Renderers
// ============================================================================

function renderTransformSection(body, element) {
    body.innerHTML = '';

    const t = element.transform;

    const grid = document.createElement('div');
    grid.className = 'pp-grid pp-grid-2x3';

    // X
    const xRow = document.createElement('div');
    xRow.className = 'pp-row-compact';
    xRow.appendChild(createNumberInput(t.x, (v) => updateElement(element.id, { transform: { ...t, x: v } }), { unit: 'mm' }));
    const xLabel = document.createElement('label');
    xLabel.className = 'pp-row-label';
    xLabel.textContent = 'X';
    xRow.insertBefore(xLabel, xRow.firstChild);
    grid.appendChild(xRow);

    // Y
    const yRow = document.createElement('div');
    yRow.className = 'pp-row-compact';
    yRow.appendChild(createNumberInput(t.y, (v) => updateElement(element.id, { transform: { ...t, y: v } }), { unit: 'mm' }));
    const yLabel = document.createElement('label');
    yLabel.className = 'pp-row-label';
    yLabel.textContent = 'Y';
    yRow.insertBefore(yLabel, yRow.firstChild);
    grid.appendChild(yRow);

    // Width
    const wRow = document.createElement('div');
    wRow.className = 'pp-row-compact';
    wRow.appendChild(createNumberInput(t.width, (v) => updateElement(element.id, { transform: { ...t, width: v } }), { min: 1, unit: 'mm' }));
    const wLabel = document.createElement('label');
    wLabel.className = 'pp-row-label';
    wLabel.textContent = 'W';
    wRow.insertBefore(wLabel, wRow.firstChild);
    grid.appendChild(wRow);

    // Height
    const hRow = document.createElement('div');
    hRow.className = 'pp-row-compact';
    hRow.appendChild(createNumberInput(t.height, (v) => updateElement(element.id, { transform: { ...t, height: v } }), { min: 1, unit: 'mm' }));
    const hLabel = document.createElement('label');
    hLabel.className = 'pp-row-label';
    hLabel.textContent = 'H';
    hRow.insertBefore(hLabel, hRow.firstChild);
    grid.appendChild(hRow);

    // Rotation
    const rRow = document.createElement('div');
    rRow.className = 'pp-row-compact';
    rRow.appendChild(createNumberInput(t.rotation, (v) => updateElement(element.id, { transform: { ...t, rotation: v } }), { unit: 'deg' }));
    const rLabel = document.createElement('label');
    rLabel.className = 'pp-row-label';
    rLabel.textContent = 'Rot';
    rRow.insertBefore(rLabel, rRow.firstChild);
    grid.appendChild(rRow);

    // Spacer
    const spacer = document.createElement('div');
    grid.appendChild(spacer);

    body.appendChild(grid);

    // Align to label buttons
    const alignRow = createRow('Align to Label', createAlignToLabelButtons(element.id));
    alignRow.className = 'pp-row pp-row--tight';
    body.appendChild(alignRow);
}

function renderTextSection(body, element) {
    body.innerHTML = '';

    // Content textarea
    const contentRow = document.createElement('div');
    contentRow.className = 'pp-row pp-row--full';
    const contentLabel = document.createElement('label');
    contentLabel.className = 'pp-label';
    contentLabel.textContent = 'Content';
    const textarea = document.createElement('textarea');
    textarea.className = 'pp-textarea';
    textarea.rows = 3;
    textarea.placeholder = 'e.g. Tool: {Name}';
    textarea.value = element.content || '';
    textarea.addEventListener('input', () => {
        updateElement(element.id, { content: textarea.value });
    });
    textarea.addEventListener('focus', () => { isEditing = true; });
    textarea.addEventListener('blur', () => { isEditing = false; });

    const contentHint = document.createElement('p');
    contentHint.className = 'pp-hint';
    contentHint.textContent = 'Insert imported data with {ColumnName} or <ColumnName>, e.g. {Name} or <Name>.';

    contentRow.appendChild(contentLabel);
    contentRow.appendChild(textarea);
    contentRow.appendChild(contentHint);
    body.appendChild(contentRow);

    // Font Size + Font Family
    const fontRow = document.createElement('div');
    fontRow.className = 'pp-row pp-row--split';

    const fontSizeGroup = document.createElement('div');
    fontSizeGroup.className = 'pp-field-group';
    const fsLabel = document.createElement('label');
    fsLabel.className = 'pp-label';
    fsLabel.textContent = 'Font Size';
    fontSizeGroup.appendChild(fsLabel);
    fontSizeGroup.appendChild(createNumberInput(element.fontSize, (v) => updateElement(element.id, { fontSize: v }), { min: 1, max: 200, unit: 'pt' }));

    const fontFamilyGroup = document.createElement('div');
    fontFamilyGroup.className = 'pp-field-group';
    const ffLabel = document.createElement('label');
    ffLabel.className = 'pp-label';
    ffLabel.textContent = 'Font';
    fontFamilyGroup.appendChild(ffLabel);

    const fontSelect = document.createElement('select');
    fontSelect.className = 'pp-select';
    const fonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Impact', 'Comic Sans MS'];
    for (const f of fonts) {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        opt.selected = element.fontFamily === f;
        fontSelect.appendChild(opt);
    }
    fontSelect.addEventListener('change', () => updateElement(element.id, { fontFamily: fontSelect.value }));
    addFocusTracking(fontSelect);
    fontFamilyGroup.appendChild(fontSelect);

    fontRow.appendChild(fontSizeGroup);
    fontRow.appendChild(fontFamilyGroup);
    body.appendChild(fontRow);

    // Color
    body.appendChild(createRow('Color', createColorInput(element.color, (v) => updateElement(element.id, { color: v }))));
}

function renderAlignmentSection(body, element) {
    body.innerHTML = '';

    const alignRow = document.createElement('div');
    alignRow.className = 'pp-row';

    const label = document.createElement('label');
    label.className = 'pp-label';
    label.textContent = 'Text Align';
    alignRow.appendChild(label);

    alignRow.appendChild(createAlignmentButtons(element.textAlign || 'left', (v) => updateElement(element.id, { textAlign: v })));
    body.appendChild(alignRow);
}

function renderBindingsSection(body, element) {
    body.innerHTML = '';

    const dataState = getDataState();

    if (dataState.columns && dataState.columns.length > 0) {
        const label = document.createElement('label');
        label.className = 'pp-label';
        label.textContent = 'Data Bindings';
        body.appendChild(label);

        const bindings = element.bindings || [];

        for (const col of dataState.columns) {
            const binding = bindings.find((b) => b.columnId === col.id);
            const row = document.createElement('div');
            row.className = 'pp-binding-row';

            const colName = document.createElement('span');
            colName.className = 'pp-binding-name';
            colName.textContent = col.name;

            const btn = document.createElement('button');
            btn.className = 'pp-btn-icon pp-btn-icon--small';
            btn.innerHTML = binding ? ICONS.unlink : ICONS.link;
            btn.title = binding ? 'Remove binding' : 'Bind to column';

            btn.addEventListener('click', () => {
                let newBindings;
                if (binding) {
                    newBindings = bindings.filter((b) => b.columnId !== col.id);
                } else {
                    newBindings = [...bindings, { property: 'content', columnId: col.id }];
                }
                updateElement(element.id, { bindings: newBindings });
            });

            row.appendChild(colName);
            row.appendChild(btn);
            body.appendChild(row);
        }
    } else {
        const hint = document.createElement('p');
        hint.className = 'pp-hint';
        hint.textContent = 'Import data to enable bindings';
        body.appendChild(hint);
    }
}

function renderShapeSection(body, element) {
    body.innerHTML = '';

    // Fill Color
    body.appendChild(createRow('Fill Color', createColorInput(element.fillColor, (v) => updateElement(element.id, { fillColor: v }))));

    // Stroke Color
    body.appendChild(createRow('Stroke Color', createColorInput(element.strokeColor, (v) => updateElement(element.id, { strokeColor: v }))));

    // Stroke Width
    body.appendChild(createRow('Stroke Width', createNumberInput(element.strokeWidth, (v) => updateElement(element.id, { strokeWidth: v }), { min: 0, step: 0.1, unit: 'mm' })));

    // Opacity
    body.appendChild(createRow('Opacity', createNumberInput(element.opacity, (v) => updateElement(element.id, { opacity: Math.max(0, Math.min(1, v)) }), { min: 0, max: 1, step: 0.05 })));

    // Corner Radius (rectangles only)
    if (element.shapeType === 'rectangle') {
        body.appendChild(createRow('Corner Radius', createNumberInput(element.cornerRadius || 0, (v) => updateElement(element.id, { cornerRadius: v }), { min: 0, step: 0.5, unit: 'mm' })));
    }
}

function renderPlaceholderSection(body, element) {
    body.innerHTML = '';

    // Type
    const typeRow = document.createElement('div');
    typeRow.className = 'pp-row';
    const typeLabel = document.createElement('label');
    typeLabel.className = 'pp-label';
    typeLabel.textContent = 'Type';
    typeRow.appendChild(typeLabel);
    const typeSelect = document.createElement('select');
    typeSelect.className = 'pp-select';
    const types = [
        { value: 'image', label: 'Image' },
        { value: 'qrCode', label: 'QR Code' },
    ];
    for (const t of types) {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        opt.selected = element.placeholderType === t.value;
        typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener('change', () => updateElement(element.id, { placeholderType: typeSelect.value }));
    addFocusTracking(typeSelect);
    typeRow.appendChild(typeSelect);
    body.appendChild(typeRow);

    if (element.placeholderType === 'image') {
        // Image Name
        body.appendChild(createRow('Image Name', (() => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'pp-input';
            input.value = element.imageName || '';
            input.addEventListener('change', () => updateElement(element.id, { imageName: input.value }));
            addFocusTracking(input);
            return input;
        })()));

        // Image Name Binding
        const dataState = getDataState();
        if (dataState.columns && dataState.columns.length > 0) {
            const bindingRow = document.createElement('div');
            bindingRow.className = 'pp-row';
            const bLabel = document.createElement('label');
            bLabel.className = 'pp-label';
            bLabel.textContent = 'Name Binding';
            bindingRow.appendChild(bLabel);
            const bindingSelect = document.createElement('select');
            bindingSelect.className = 'pp-select';
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = 'None (static)';
            bindingSelect.appendChild(noneOpt);
            for (const col of dataState.columns) {
                const opt = document.createElement('option');
                opt.value = col.id;
                opt.textContent = col.name;
                opt.selected = element.imageNameBinding?.columnId === col.id;
                bindingSelect.appendChild(opt);
            }
            bindingSelect.addEventListener('change', () => {
                const val = bindingSelect.value;
                updateElement(element.id, {
                    imageNameBinding: val ? { property: 'imageName', columnId: val } : undefined,
                });
            });
            addFocusTracking(bindingSelect);
            bindingRow.appendChild(bindingSelect);
            body.appendChild(bindingRow);
        }

        // Image Fit
        const fitRow = document.createElement('div');
        fitRow.className = 'pp-row';
        const fitLabel = document.createElement('label');
        fitLabel.className = 'pp-label';
        fitLabel.textContent = 'Image Fit';
        fitRow.appendChild(fitLabel);
        const fitSelect = document.createElement('select');
        fitSelect.className = 'pp-select';
        const fits = [
            { value: 'fitHorizontal', label: 'Fit Horizontal' },
            { value: 'fitVertical', label: 'Fit Vertical' },
            { value: 'stretch', label: 'Stretch' },
        ];
        for (const f of fits) {
            const opt = document.createElement('option');
            opt.value = f.value;
            opt.textContent = f.label;
            opt.selected = element.imageFit === f.value;
            fitSelect.appendChild(opt);
        }
        fitSelect.addEventListener('change', () => updateElement(element.id, { imageFit: fitSelect.value }));
        addFocusTracking(fitSelect);
        fitRow.appendChild(fitSelect);
        body.appendChild(fitRow);
    }

    if (element.placeholderType === 'qrCode') {
        // QR Value Binding
        const qrState = getDataState();
        if (qrState.columns && qrState.columns.length > 0) {
            const qrRow = document.createElement('div');
            qrRow.className = 'pp-row';
            const qrLabel = document.createElement('label');
            qrLabel.className = 'pp-label';
            qrLabel.textContent = 'QR Value Binding';
            qrRow.appendChild(qrLabel);
            const qrSelect = document.createElement('select');
            qrSelect.className = 'pp-select';
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = 'None';
            qrSelect.appendChild(noneOpt);
            for (const col of qrState.columns) {
                const opt = document.createElement('option');
                opt.value = col.id;
                opt.textContent = col.name;
                opt.selected = element.qrValueBinding?.columnId === col.id;
                qrSelect.appendChild(opt);
            }
            qrSelect.addEventListener('change', () => {
                const val = qrSelect.value;
                updateElement(element.id, {
                    qrValueBinding: val ? { property: 'content', columnId: val } : undefined,
                });
            });
            addFocusTracking(qrSelect);
            qrRow.appendChild(qrSelect);
            body.appendChild(qrRow);
        }
    }

    // Display Text
    body.appendChild(createRow('Display Text', (() => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pp-input';
        input.value = element.displayText || '';
        input.addEventListener('change', () => updateElement(element.id, { displayText: input.value }));
        addFocusTracking(input);
        return input;
    })()));

    // Colors
    body.appendChild(createRow('Fill Color', createColorInput(element.fillColor, (v) => updateElement(element.id, { fillColor: v }))));
    body.appendChild(createRow('Stroke Color', createColorInput(element.strokeColor, (v) => updateElement(element.id, { strokeColor: v }))));
    body.appendChild(createRow('Stroke Width', createNumberInput(element.strokeWidth, (v) => updateElement(element.id, { strokeWidth: v }), { min: 0, step: 0.1, unit: 'mm' })));

    // Opacity
    body.appendChild(createRow('Opacity', createNumberInput(element.opacity, (v) => updateElement(element.id, { opacity: Math.max(0, Math.min(1, v)) }), { min: 0, max: 1, step: 0.05 })));
}

// ============================================================================
// Main Render
// ============================================================================

function renderPanel() {
    if (!panelEl) return;

    const element = getSelectedElement();

    if (!element) {
        currentRenderedElementId = null;
        panelEl.innerHTML = `
            <div class="pp-empty">
                <p class="pp-empty-title">No Selection</p>
                <p class="pp-empty-hint">Select an element on the canvas to edit its properties.</p>
            </div>
        `;
        return;
    }

    // Skip full rebuild while the user is actively typing into one of this
    // panel's own fields for the same element — rebuilding mid-keystroke
    // would reset focus/cursor position. Any OTHER source of change (the
    // inline canvas text editor, Data Bindings panel, Column Manager, ...)
    // must still cause a rebuild so this panel reflects the new value.
    if (element.id === currentRenderedElementId && isEditing) {
        return;
    }

    currentRenderedElementId = element.id;
    panelEl.innerHTML = '';

    // Element type label
    const typeBadge = document.createElement('div');
    typeBadge.className = 'pp-type-badge';
    typeBadge.textContent = element.type.charAt(0).toUpperCase() + element.type.slice(1);
    panelEl.appendChild(typeBadge);

    // Transform section
    const transform = createSection('Transform');
    renderTransformSection(transform.body, element);
    panelEl.appendChild(transform.section);

    // Type-specific sections
    if (element.type === 'text') {
        const textSection = createSection('Text');
        renderTextSection(textSection.body, element);
        panelEl.appendChild(textSection.section);

        const alignmentSection = createSection('Alignment');
        renderAlignmentSection(alignmentSection.body, element);
        panelEl.appendChild(alignmentSection.section);

        const bindingsSection = createSection('Data Bindings');
        renderBindingsSection(bindingsSection.body, element);
        panelEl.appendChild(bindingsSection.section);
    }

    if (element.type === 'shape') {
        const shapeSection = createSection('Shape');
        renderShapeSection(shapeSection.body, element);
        panelEl.appendChild(shapeSection.section);
    }

    if (element.type === 'placeholder') {
        const placeholderSection = createSection('Placeholder');
        renderPlaceholderSection(placeholderSection.body, element);
        panelEl.appendChild(placeholderSection.section);
    }

    // Delete button
    const deleteSection = document.createElement('div');
    deleteSection.className = 'pp-section pp-section--delete';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ld-btn ld-btn-secondary pp-delete-btn';
    deleteBtn.innerHTML = ICONS.delete + ' Delete Element';
    deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this element?')) {
            removeMasterElement(element.id);
            clearSelection();
        }
    });
    deleteSection.appendChild(deleteBtn);
    panelEl.appendChild(deleteSection);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create and render the property panel.
 *
 * @param {HTMLElement} container - Parent element
 * @returns {HTMLElement}
 */
export function createPropertyPanel(container) {
    panelEl = document.createElement('div');
    panelEl.className = 'property-panel';
    panelEl.innerHTML = `
        <div class="pp-empty">
            <p class="pp-empty-title">No Selection</p>
            <p class="pp-empty-hint">Select an element on the canvas to edit its properties.</p>
        </div>
    `;

    resizable = createResizable(panelEl, {
        side: 'right',
        defaultWidth: 320,
        minWidth: 250,
        maxWidth: 600,
    });
    container.insertBefore(resizable.container, container.firstChild);

    unsubDesign = subscribe(() => renderPanel());
    renderPanel();

    return resizable.container;
}

/**
 * Clean up the property panel.
 */
export function destroyPropertyPanel() {
    if (unsubDesign) unsubDesign();
    if (unsubData) unsubData();
    if (resizable) resizable.destroy();
    resizable = null;
    panelEl = null;
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'property-panel-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .property-panel {
            width: 100%;
            height: 100%;
            overflow-y: auto;
            padding: var(--spacing-sm, 8px);
            font-size: 13px;
        }

        .pp-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: var(--color-text-tertiary, #999);
            text-align: center;
            padding: var(--spacing-md, 16px);
        }

        .pp-empty-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--color-text-secondary, #666);
            margin-bottom: 4px;
        }

        .pp-empty-hint {
            font-size: 12px;
            line-height: 1.4;
        }

        .pp-type-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 4px;
            background: var(--color-bg-secondary, #f0f0f0);
            color: var(--color-text-secondary, #666);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .pp-section {
            border-bottom: 1px solid var(--color-border-light, #e8e8e8);
            padding-bottom: 8px;
            margin-bottom: 8px;
        }

        .pp-section:last-child {
            border-bottom: none;
        }

        .pp-section--delete {
            padding-top: 12px;
        }

        .pp-section-header {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--color-text-tertiary, #999);
            margin-bottom: 8px;
        }

        .pp-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }

        .pp-row--full {
            flex-direction: column;
            align-items: stretch;
        }

        .pp-row--split {
            gap: 12px;
        }

        .pp-row--split > * {
            flex: 1;
        }

        .pp-row--tight {
            margin-top: 8px;
        }

        .pp-row-compact {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .pp-row-label {
            font-size: 11px;
            color: var(--color-text-tertiary, #999);
            font-weight: 500;
        }

        .pp-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--color-text-secondary, #666);
            flex-shrink: 0;
        }

        .pp-input {
            width: 100%;
            padding: 4px 6px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
        }

        .pp-input:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .pp-input-group {
            display: flex;
            align-items: center;
            width: 100%;
        }

        .pp-input-group .pp-input {
            border-radius: var(--radius-sm, 4px) 0 0 var(--radius-sm, 4px);
            flex: 1;
        }

        .pp-input-unit {
            display: flex;
            align-items: center;
            padding: 4px 6px;
            font-size: 11px;
            color: var(--color-text-tertiary, #999);
            background: var(--color-bg-secondary, #f0f0f0);
            border: 1px solid var(--color-border, #d0d0d0);
            border-left: none;
            border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
            height: 28px;
        }

        .pp-textarea {
            width: 100%;
            padding: 6px 8px;
            font-size: 12px;
            font-family: inherit;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            resize: vertical;
            min-height: 60px;
        }

        .pp-textarea:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .pp-select {
            width: 100%;
            padding: 4px 6px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
        }

        .pp-select:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .pp-color-input {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;
        }

        .pp-color-swatch {
            width: 28px;
            height: 28px;
            padding: 2px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            cursor: pointer;
            flex-shrink: 0;
        }

        .pp-color-hex {
            flex: 1;
            padding: 4px 6px;
            font-size: 12px;
            font-family: var(--font-mono, monospace);
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
        }

        .pp-color-hex:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .pp-button-group {
            display: flex;
            gap: 2px;
        }

        .pp-btn-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
            cursor: pointer;
            transition: all 0.1s ease;
            color: var(--color-text-secondary, #666);
        }

        .pp-btn-icon:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .pp-btn-icon--active {
            background: var(--color-accent, #2563eb);
            color: #fff;
            border-color: var(--color-accent, #2563eb);
        }

        .pp-btn-icon--active:hover {
            background: var(--color-accent-hover, #1d4ed8);
        }

        .pp-btn-icon--small {
            width: 24px;
            height: 24px;
        }

        .pp-field-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .pp-binding-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 0;
        }

        .pp-binding-name {
            font-size: 12px;
            color: var(--color-text-primary, #1a1a1a);
        }

        .pp-hint {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            font-style: italic;
        }

        .pp-delete-btn {
            width: 100%;
            color: var(--color-error, #ef4444);
            border: 1px solid var(--color-error, #ef4444);
            background: transparent;
        }

        .pp-delete-btn:hover {
            background: var(--color-error, #ef4444);
            color: #fff;
        }

        .pp-grid {
            display: grid;
            gap: 6px;
        }

        .pp-grid-2x3 {
            grid-template-columns: 1fr 1fr;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
