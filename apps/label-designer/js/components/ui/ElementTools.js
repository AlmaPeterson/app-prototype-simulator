/**
 * ElementTools Component
 *
 * Left sidebar with element creation tools, template selector,
 * layers panel, asset manager, and data injector.
 *
 * @module ElementTools
 */

import {
    getState,
    subscribe,
    addElementToMaster,
    updateMasterElement,
    createTextElement,
    createShapeElement,
    createPlaceholderElement,
    setSelectedElements,
    clearSelection,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    toggleElementSelection,
    setTemplate,
} from '../../store/designStore.js';
import { createResizable } from './Resizable.js';
import { getAllAssets, saveAsset, deleteAsset, initializeAssets } from '../../lib/assets.js';
import { getAllTemplates, PREDEFINED_TEMPLATES } from '../../lib/templates.js';
import { createDataInjest } from './DataInjest.js';

// ============================================================================
// State
// ============================================================================

/** @type {HTMLElement|null} */
let panelEl = null;

/** @type {HTMLElement|null} */
let resizableInstance = null;

/** @type {function|null} */
let unsubDesign = null;

/** @type {{destroy: function}|null} */
let dataInjestInstance = null;

/** @type {boolean} */
let showAssetManager = false;

/** @type {boolean} */
let showDataInjester = false;

/** @type {Array} */
let cachedAssets = [];

/** @type {boolean} */
let assetsLoaded = false;

// ============================================================================
// SVG Icons
// ============================================================================

const ICONS = {
    text: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h12"/><path d="M10 4v13"/><path d="M7 17h6"/></svg>',
    image: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="2"/><path d="M2 14l4-4 3 3 4-4 5 5"/></svg>',
    rectangle: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="1"/></svg>',
    circle: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/></svg>',
    line: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="17" x2="17" y2="3"/></svg>',
    placeholder: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M8 7l-2 6h8l-2-6"/><line x1="10" y1="13" x2="10" y2="15"/></svg>',
    qrCode: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="5" y="5" width="2" height="2" fill="currentColor"/><rect x="13" y="5" width="2" height="2" fill="currentColor"/><rect x="5" y="13" width="2" height="2" fill="currentColor"/><rect x="11" y="11" width="2" height="2" fill="currentColor"/><rect x="13" y="13" width="2" height="2" fill="currentColor"/><rect x="15" y="15" width="2" height="2" fill="currentColor"/></svg>',
    layers: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="8 2 14 6 8 10 2 6"/><polyline points="2 10 8 14 14 10"/><polyline points="2 8 8 12 14 8"/></svg>',
    eye: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6z"/><circle cx="8" cy="8" r="2"/></svg>',
    eyeOff: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6z"/><line x1="3" y1="3" x2="13" y2="13"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="7" width="8" height="7" rx="1"/><path d="M6 7V5a2 2 0 114 0v2"/></svg>',
    unlock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="7" width="8" height="7" rx="1"/><path d="M6 7V5a2 2 0 114 0v2"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 10 8 6 12 10"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 6 8 10 12 6"/></svg>',
    top: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 10 8 6 12 10"/><line x1="8" y1="3" x2="8" y2="13"/></svg>',
    bottom: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 6 8 10 12 6"/><line x1="8" y1="3" x2="8" y2="13"/></svg>',
    add: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 4 13 4"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M4 4l1 10h6l1-10"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"/><polyline points="12 5 8 1 4 5"/><line x1="8" y1="1" x2="8" y2="11"/></svg>',
    grid: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
    data: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="6" y1="2" x2="6" y2="14"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
};

// ============================================================================
// Element Creation
// ============================================================================

function handleAddText() {
    const state = getState();
    const x = (state.template.labelWidth - 50) / 2;
    const y = (state.template.labelHeight - 10) / 2;
    const el = createTextElement(x, y, 'Text');
    addElementToMaster(el);
    setSelectedElements([el.id]);
}

function handleAddImage() {
    showAssetManager = !showAssetManager;
    if (showAssetManager) {
        loadAssets();
    }
    renderPanel();
}

function handleAddRectangle() {
    const state = getState();
    const x = (state.template.labelWidth - 20) / 2;
    const y = (state.template.labelHeight - 20) / 2;
    const el = createShapeElement(x, y, 'rectangle');
    addElementToMaster(el);
    setSelectedElements([el.id]);
}

function handleAddCircle() {
    const state = getState();
    const x = (state.template.labelWidth - 20) / 2;
    const y = (state.template.labelHeight - 20) / 2;
    const el = createShapeElement(x, y, 'circle');
    addElementToMaster(el);
    setSelectedElements([el.id]);
}

function handleAddLine() {
    const state = getState();
    const x = (state.template.labelWidth - 40) / 2;
    const y = (state.template.labelHeight - 2) / 2;
    const el = createShapeElement(x, y, 'line');
    el.transform.height = 2;
    addElementToMaster(el);
    setSelectedElements([el.id]);
}

function handleAddImagePlaceholder() {
    const state = getState();
    const x = (state.template.labelWidth - 25) / 2;
    const y = (state.template.labelHeight - 25) / 2;
    const el = createPlaceholderElement(x, y, 'image');
    addElementToMaster(el);
    setSelectedElements([el.id]);
}

function handleAddQRPlaceholder() {
    const state = getState();
    const x = (state.template.labelWidth - 25) / 2;
    const y = (state.template.labelHeight - 25) / 2;
    const el = createPlaceholderElement(x, y, 'qrCode');
    addElementToMaster(el);
    setSelectedElements([el.id]);
}

// ============================================================================
// Template Selector
// ============================================================================

function renderTemplateSelector(body) {
    body.innerHTML = '';

    const state = getState();

    const select = document.createElement('select');
    select.className = 'et-select';

    for (const tpl of PREDEFINED_TEMPLATES) {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        opt.textContent = `${tpl.name} — ${tpl.description}`;
        opt.selected = state.template.id === tpl.id;
        select.appendChild(opt);
    }

    select.addEventListener('change', () => {
        const tpl = PREDEFINED_TEMPLATES.find((t) => t.id === select.value);
        if (tpl) setTemplate(tpl);
    });

    body.appendChild(select);
}

// ============================================================================
// Layers Panel
// ============================================================================

function renderLayersPanel(body) {
    body.innerHTML = '';

    const state = getState();
    const elements = [...state.masterLabel.elements].sort((a, b) => b.zIndex - a.zIndex);

    if (elements.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'et-hint';
        hint.textContent = 'No elements yet. Use the tools above to add elements.';
        body.appendChild(hint);
        return;
    }

    for (const el of elements) {
        const row = document.createElement('div');
        row.className = 'et-layer-row' + (state.selectedElementIds.includes(el.id) ? ' et-layer-row--selected' : '');

        // Click to select
        row.addEventListener('click', (e) => {
            if (e.target.closest('.et-layer-btn')) return;
            setSelectedElements([el.id]);
        });

        // Visibility toggle
        const visBtn = document.createElement('button');
        visBtn.className = 'et-layer-btn';
        visBtn.innerHTML = el.visible ? ICONS.eye : ICONS.eyeOff;
        visBtn.title = el.visible ? 'Hide' : 'Show';
        visBtn.addEventListener('click', () => {
            updateMasterElement(el.id, { visible: !el.visible });
        });

        // Type icon
        const typeIcon = document.createElement('span');
        typeIcon.className = 'et-layer-type';
        typeIcon.textContent = el.type === 'text' ? 'T' : el.type === 'shape' ? '■' : el.type === 'image' ? '◉' : '☐';

        // Name
        const name = document.createElement('span');
        name.className = 'et-layer-name';
        name.textContent = el.type === 'text' ? (el.content || 'Text').substring(0, 20) : el.type;

        // Layer order buttons
        const orderGroup = document.createElement('div');
        orderGroup.className = 'et-layer-order';

        const upBtn = document.createElement('button');
        upBtn.className = 'et-layer-btn';
        upBtn.innerHTML = ICONS.up;
        upBtn.title = 'Move Up';
        upBtn.addEventListener('click', () => bringForward(el.id));

        const downBtn = document.createElement('button');
        downBtn.className = 'et-layer-btn';
        downBtn.innerHTML = ICONS.down;
        downBtn.title = 'Move Down';
        downBtn.addEventListener('click', () => sendBackward(el.id));

        orderGroup.appendChild(upBtn);
        orderGroup.appendChild(downBtn);

        row.appendChild(visBtn);
        row.appendChild(typeIcon);
        row.appendChild(name);
        row.appendChild(orderGroup);
        body.appendChild(row);
    }
}

// ============================================================================
// Asset Manager
// ============================================================================

async function loadAssets() {
    try {
        await initializeAssets();
        cachedAssets = await getAllAssets();
        assetsLoaded = true;
        renderAssetManager();
    } catch (err) {
        console.error('Failed to load assets:', err);
    }
}

function renderAssetManager() {
    if (!panelEl) return;

    const body = panelEl.querySelector('.et-asset-body');
    if (!body) return;

    body.innerHTML = '';

    if (cachedAssets.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'et-hint';
        hint.textContent = 'No assets uploaded yet.';
        body.appendChild(hint);
    } else {
        const grid = document.createElement('div');
        grid.className = 'et-asset-grid';

        for (const asset of cachedAssets) {
            const card = document.createElement('div');
            card.className = 'et-asset-card';

            const img = document.createElement('img');
            img.className = 'et-asset-img';
            img.src = asset.dataUrl;
            img.alt = asset.name;
            img.loading = 'lazy';

            const name = document.createElement('span');
            name.className = 'et-asset-name';
            name.textContent = asset.name;
            name.title = asset.name;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'et-layer-btn et-layer-btn--danger';
            deleteBtn.innerHTML = ICONS.trash;
            deleteBtn.title = 'Delete asset';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${asset.name}"?`)) {
                    await deleteAsset(asset.id);
                    cachedAssets = cachedAssets.filter((a) => a.id !== asset.id);
                    renderAssetManager();
                }
            });

            card.appendChild(img);
            card.appendChild(name);
            card.appendChild(deleteBtn);
            grid.appendChild(card);
        }

        body.appendChild(grid);
    }

    // Upload button
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'ld-btn ld-btn-secondary et-upload-btn';
    uploadBtn.innerHTML = ICONS.upload + ' Upload Image';
    uploadBtn.addEventListener('click', handleUploadAsset);
    body.appendChild(uploadBtn);

    const dropHint = document.createElement('p');
    dropHint.className = 'et-hint et-asset-drop-hint';
    dropHint.textContent = 'or drag and drop images here';
    body.appendChild(dropHint);
}

function handleUploadAsset() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => processImageFiles(input.files);
    input.click();
}

/**
 * Read, decode, and store a batch of image files as assets — shared by both
 * the click-to-browse upload button and drag-and-drop onto the panel.
 * @param {FileList|File[]|null} fileList
 */
async function processImageFiles(fileList) {
    const files = fileList ? Array.from(fileList).filter((f) => f.type.startsWith('image/')) : [];
    if (files.length === 0) return;

    for (const file of files) {
        try {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const img = new Image();
            const dimensions = await new Promise((resolve, reject) => {
                img.onload = () => resolve({ width: img.width, height: img.height });
                img.onerror = reject;
                img.src = dataUrl;
            });

            const asset = {
                id: crypto.randomUUID(),
                name: file.name,
                dataUrl,
                width: dimensions.width,
                height: dimensions.height,
                dpi: 72,
                size: file.size,
                uploadedAt: Date.now(),
                blobStored: false,
            };

            await saveAsset(asset);
            cachedAssets.push(asset);
        } catch (err) {
            console.error('Failed to upload asset:', err);
        }
    }

    renderAssetManager();
}

// ============================================================================
// Section Helpers
// ============================================================================

function createCollapsibleSection(title, defaultOpen = true) {
    const section = document.createElement('div');
    section.className = 'et-section';

    const header = document.createElement('div');
    header.className = 'et-section-header';

    const chevron = document.createElement('span');
    chevron.className = 'et-section-chevron';
    chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 6 8 10 12 6"/></svg>';
    chevron.style.transform = defaultOpen ? 'rotate(0deg)' : 'rotate(-90deg)';

    const titleEl = document.createElement('span');
    titleEl.className = 'et-section-title';
    titleEl.textContent = title;

    header.appendChild(chevron);
    header.appendChild(titleEl);

    const body = document.createElement('div');
    body.className = 'et-section-body';
    body.style.display = defaultOpen ? 'block' : 'none';

    header.addEventListener('click', () => {
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
    });

    section.appendChild(header);
    section.appendChild(body);

    return { section, body };
}

// ============================================================================
// Main Render
// ============================================================================

function renderPanel() {
    if (!panelEl) return;

    const content = panelEl.querySelector('.et-content') || panelEl;
    content.innerHTML = '';

    // ── Element Creation Tools ──
    const toolsSection = createCollapsibleSection('Add Elements');
    const toolsGrid = document.createElement('div');
    toolsGrid.className = 'et-tools-grid';

    const tools = [
        { icon: ICONS.text, label: 'Text', action: handleAddText },
        { icon: ICONS.image, label: 'Image', action: handleAddImage },
        { icon: ICONS.rectangle, label: 'Rectangle', action: handleAddRectangle },
        { icon: ICONS.circle, label: 'Circle', action: handleAddCircle },
        { icon: ICONS.line, label: 'Line', action: handleAddLine },
        { icon: ICONS.placeholder, label: 'Img Placeholder', action: handleAddImagePlaceholder },
        { icon: ICONS.qrCode, label: 'QR Placeholder', action: handleAddQRPlaceholder },
    ];

    for (const tool of tools) {
        const btn = document.createElement('button');
        btn.className = 'et-tool-btn';
        btn.innerHTML = `<span class="et-tool-icon">${tool.icon}</span><span class="et-tool-label">${tool.label}</span>`;
        btn.addEventListener('click', tool.action);
        toolsGrid.appendChild(btn);
    }

    toolsSection.body.appendChild(toolsGrid);
    content.appendChild(toolsSection.section);

    // ── Template Selector ──
    const templateSection = createCollapsibleSection('Template');
    renderTemplateSelector(templateSection.body);
    content.appendChild(templateSection.section);

    // ── Layers Panel ──
    const layersSection = createCollapsibleSection('Layers');
    renderLayersPanel(layersSection.body);
    content.appendChild(layersSection.section);

    // ── Asset Manager ──
    const assetSection = createCollapsibleSection('Assets', showAssetManager);
    const assetBody = document.createElement('div');
    assetBody.className = 'et-asset-body';
    assetBody.addEventListener('dragover', (e) => {
        e.preventDefault();
        assetBody.classList.add('et-asset-dragover');
    });
    assetBody.addEventListener('dragleave', () => {
        assetBody.classList.remove('et-asset-dragover');
    });
    assetBody.addEventListener('drop', (e) => {
        e.preventDefault();
        assetBody.classList.remove('et-asset-dragover');
        if (e.dataTransfer && e.dataTransfer.files) {
            processImageFiles(e.dataTransfer.files);
        }
    });
    assetSection.body.innerHTML = '';
    assetSection.body.appendChild(assetBody);
    // Always populate the section body (visibility is handled separately by
    // the collapsible header) so opening "Assets" directly — not just via
    // the "Image" quick-tool — shows the upload button and asset grid.
    if (assetsLoaded) {
        renderAssetManager();
    } else {
        loadAssets();
    }
    content.appendChild(assetSection.section);

    // ── Data Injector ──
    // Owns its own reactive subscription/re-render (see DataInjest.js), so it
    // only needs to be mounted once here rather than re-rendered on every
    // renderPanel() pass.
    const dataSection = createCollapsibleSection('Data', showDataInjester);
    if (dataInjestInstance) dataInjestInstance.destroy();
    dataInjestInstance = createDataInjest(dataSection.body);
    content.appendChild(dataSection.section);

    // Re-render layers on state change
    if (unsubDesign) unsubDesign();
    unsubDesign = subscribe(() => {
        const layersBody = content.querySelector('.et-section:nth-child(3) .et-section-body');
        if (layersBody) renderLayersPanel(layersBody);
    });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the element tools sidebar.
 *
 * @param {HTMLElement} container - Parent element
 * @returns {{ container: HTMLElement, destroy: function }}
 */
export function createElementTools(container) {
    panelEl = document.createElement('div');
    panelEl.className = 'element-tools';

    const resizable = createResizable(panelEl, {
        side: 'left',
        defaultWidth: 280,
        minWidth: 200,
        maxWidth: 500,
    });

    container.insertBefore(resizable.container, container.firstChild);

    renderPanel();

    return {
        container: resizable.container,
        destroy() {
            if (unsubDesign) unsubDesign();
            if (dataInjestInstance) dataInjestInstance.destroy();
            dataInjestInstance = null;
            resizable.destroy();
            panelEl = null;
        },
    };
}

// ============================================================================
// Styles
// ============================================================================

const CSS_ID = 'element-tools-styles';

function injectStyles() {
    if (document.getElementById(CSS_ID)) return;

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
        .element-tools {
            width: 100%;
            height: 100%;
            overflow-y: auto;
            padding: var(--spacing-sm, 8px);
            background: var(--color-bg-primary, #fff);
            border-right: 1px solid var(--color-border-light, #e8e8e8);
        }

        .et-section {
            margin-bottom: 4px;
        }

        .et-section-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            cursor: pointer;
            border-radius: var(--radius-sm, 4px);
            user-select: none;
            transition: background-color 0.1s ease;
        }

        .et-section-header:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .et-section-chevron {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 12px;
            height: 12px;
            color: var(--color-text-tertiary, #999);
            transition: transform 0.15s ease;
            flex-shrink: 0;
        }

        .et-section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--color-text-secondary, #666);
        }

        .et-section-body {
            padding: 8px 4px;
        }

        .et-tools-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
        }

        .et-tool-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 10px 4px;
            border: 1px solid var(--color-border-light, #e8e8e8);
            border-radius: var(--radius-md, 6px);
            background: var(--color-bg-primary, #fff);
            cursor: pointer;
            transition: all 0.1s ease;
            color: var(--color-text-secondary, #666);
        }

        .et-tool-btn:hover {
            background: var(--color-bg-secondary, #f0f0f0);
            border-color: var(--color-accent, #2563eb);
            color: var(--color-accent, #2563eb);
        }

        .et-tool-btn:active {
            transform: scale(0.97);
        }

        .et-tool-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
        }

        .et-tool-label {
            font-size: 10px;
            font-weight: 500;
            text-align: center;
            line-height: 1.2;
        }

        .et-select {
            width: 100%;
            padding: 6px 8px;
            font-size: 12px;
            border: 1px solid var(--color-border, #d0d0d0);
            border-radius: var(--radius-sm, 4px);
            background: var(--color-bg-primary, #fff);
        }

        .et-select:focus {
            outline: none;
            border-color: var(--color-accent, #2563eb);
        }

        .et-hint {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            text-align: center;
            padding: 12px 8px;
            font-style: italic;
        }

        .et-layer-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            border-radius: var(--radius-sm, 4px);
            cursor: pointer;
            transition: background-color 0.1s ease;
        }

        .et-layer-row:hover {
            background: var(--color-bg-secondary, #f0f0f0);
        }

        .et-layer-row--selected {
            background: var(--color-selection-bg, rgba(37, 99, 235, 0.1));
            outline: 1px solid var(--color-selection, #2563eb);
        }

        .et-layer-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border: none;
            border-radius: var(--radius-sm, 4px);
            background: transparent;
            cursor: pointer;
            color: var(--color-text-tertiary, #999);
            transition: all 0.1s ease;
            flex-shrink: 0;
        }

        .et-layer-btn:hover {
            background: var(--color-bg-tertiary, #e8e8e8);
            color: var(--color-text-primary, #1a1a1a);
        }

        .et-layer-btn--danger:hover {
            background: rgba(239, 68, 68, 0.1);
            color: var(--color-error, #ef4444);
        }

        .et-layer-type {
            font-size: 12px;
            color: var(--color-text-tertiary, #999);
            width: 16px;
            text-align: center;
            flex-shrink: 0;
        }

        .et-layer-name {
            flex: 1;
            font-size: 12px;
            color: var(--color-text-primary, #1a1a1a);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .et-layer-order {
            display: flex;
            gap: 2px;
            opacity: 0;
            transition: opacity 0.1s ease;
        }

        .et-layer-row:hover .et-layer-order {
            opacity: 1;
        }

        .et-asset-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-bottom: 8px;
        }

        .et-asset-card {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 6px;
            border: 1px solid var(--color-border-light, #e8e8e8);
            border-radius: var(--radius-md, 6px);
            overflow: hidden;
        }

        .et-asset-card:hover .et-layer-btn {
            opacity: 1;
        }

        .et-asset-img {
            width: 100%;
            height: 60px;
            object-fit: contain;
            margin-bottom: 4px;
        }

        .et-asset-name {
            font-size: 10px;
            color: var(--color-text-secondary, #666);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
            text-align: center;
        }

        .et-upload-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .et-asset-body {
            border: 2px dashed transparent;
            border-radius: var(--radius-md, 6px);
            transition: border-color 0.1s ease, background-color 0.1s ease;
        }

        .et-asset-body.et-asset-dragover {
            border-color: var(--color-accent, #2563eb);
            background: var(--color-selection-bg, rgba(37, 99, 235, 0.1));
        }

        .et-asset-drop-hint {
            padding: 4px 8px 0;
            margin-top: -4px;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();
