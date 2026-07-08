/**
 * Canvas Renderer Component
 *
 * Vanilla JS port of the React CanvasRenderer.
 * Renders the label design on a <canvas> element with pan/zoom,
 * click selection, element dragging, and template/preview modes.
 *
 * Controls:
 *   Scroll            → vertical pan
 *   Shift + Scroll    → horizontal pan
 *   Ctrl/Cmd + Scroll → zoom (around cursor)
 *   Middle-click drag → pan
 *   Alt + Left drag   → pan
 */

import { getState, subscribe, setState, getEffectiveElementsForLabel, getTotalLabels, updateMasterElement, updateLabelElement, setSelectedLabel, setSelectedElements } from '../../store/designStore.js';
import * as dataStore from '../../store/dataStore.js';
import { mmToPx, SCREEN_DPI } from '../../lib/dimensions.js';
import { getLabelPosition, getLabelClipRect } from '../../lib/templates.js';
import { getAllAssets, getAssetDataUrl, initializeAssets } from '../../lib/assets.js';
import { createTransformControls } from './TransformControls.js';
import { getPortalRoot } from '../../lib/portal.js';
import { VARIABLE_REGEX } from '../../lib/variables.js';
import { getQRCodeToDataURL } from '../../lib/qrcode-loader.js';

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

/** @type {Map<string, HTMLImageElement>} */
const imageCache = new Map();

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let canvas, container, wrapper;
let transformControlsCleanup = null;
let unsubscribeDesign = null;
let unsubscribeData = null;
let resizeObserver = null;

/** @type {HTMLTextAreaElement|null} Inline text-edit overlay, while active */
let inlineEditorEl = null;

let isPanning = false;
let isDraggingElement = false;
let lastMousePos = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0 };
let elementStartPos = { x: 0, y: 0 };
let resizeTrigger = 0;

/** @type {Map<string, { asset: object, dataUrl: string }>} */
let assetsCache = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pxToMmLocal(px, dpi = SCREEN_DPI) {
    return (px / dpi) * 25.4;
}

// ---------------------------------------------------------------------------
// DOM Creation
// ---------------------------------------------------------------------------

/**
 * Create the canvas renderer inside `containerEl`.
 * Returns a cleanup function that tears everything down.
 */
export function createCanvasRenderer(containerEl) {
    container = containerEl;

    // Outer wrapper (holds mouse events for pan/select/drag)
    wrapper = document.createElement('div');
    wrapper.className = 'canvas-wrapper';
    wrapper.style.cssText =
        'position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;cursor:default;background:#e5e7eb;';

    // <canvas>
    canvas = document.createElement('canvas');
    canvas.className = 'canvas-element';
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    wrapper.appendChild(canvas);

    container.appendChild(wrapper);

    // ------------------------------------------------------------------
    // ResizeObserver
    // ------------------------------------------------------------------

    const updateDimensions = () => {
        if (!container || !canvas) return;
        const rect = container.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w;
            canvas.height = h;
            resizeTrigger++;
            requestAnimationFrame(render);
        }
    };

    resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateDimensions);
    });
    resizeObserver.observe(container);
    // Multiple attempts to get initial size right
    setTimeout(updateDimensions, 0);
    setTimeout(updateDimensions, 50);
    setTimeout(updateDimensions, 100);
    setTimeout(updateDimensions, 200);
    setTimeout(updateDimensions, 500);
    // Also try on window load
    window.addEventListener('load', () => {
        requestAnimationFrame(updateDimensions);
    }, { once: true });

    // ------------------------------------------------------------------
    // Wheel handler (scroll + zoom)
    // ------------------------------------------------------------------

    const onWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const st = getState();

        if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + Scroll → zoom around cursor
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const oldZoom = st.zoom;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(5.0, oldZoom * factor));

            // Adjust pan so the point under the cursor stays fixed
            const newPanX = mouseX - (mouseX - st.panX) * (newZoom / oldZoom);
            const newPanY = mouseY - (mouseY - st.panY) * (newZoom / oldZoom);

            setState({ zoom: newZoom, panX: newPanX, panY: newPanY });
        } else if (e.shiftKey) {
            // Shift + Scroll → horizontal pan
            setState({ panX: st.panX - e.deltaY, panY: st.panY });
        } else {
            // Normal scroll → vertical pan
            setState({ panX: st.panX, panY: st.panY - e.deltaY });
        }
    };
    wrapper.addEventListener('wheel', onWheel, { passive: false });

    // ------------------------------------------------------------------
    // Mouse event handlers
    // ------------------------------------------------------------------

    const onMouseDown = (e) => {
        const st = getState();

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            // Middle-click or Alt+Left-click → pan
            isPanning = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
            wrapper.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        if (e.button === 0 && st.selectedElementIds.length === 1) {
            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;

            // Convert canvas pixel to world (pre-zoom) coordinates
            const worldX = (canvasX - st.panX) / st.zoom;
            const worldY = (canvasY - st.panY) / st.zoom;

            const elementId = st.selectedElementIds[0];
            const element = st.masterLabel.elements.find((el) => el.id === elementId);
            if (!element) return;

            let hitX, hitY;

            if (st.viewMode === 'TEMPLATE') {
                const labelWidthPx = mmToPx(st.template.labelWidth, SCREEN_DPI);
                const labelHeightPx = mmToPx(st.template.labelHeight, SCREEN_DPI);
                // Label's world-space anchor is fixed (independent of zoom)
                // — see renderTemplateMode for why.
                const labelX = (canvas.width - labelWidthPx) / 2;
                const labelY = (canvas.height - labelHeightPx) / 2;
                // World coords are offset by label position
                hitX = pxToMmLocal(worldX - labelX);
                hitY = pxToMmLocal(worldY - labelY);
            } else {
                if (st.selectedLabelIndex === null) return;
                const labelPos = getLabelPosition(st.template, st.selectedLabelIndex);
                if (!labelPos) return;
                hitX = labelPos.x + element.transform.x;
                hitY = labelPos.y + element.transform.y;
            }

            // Simple hit test
            if (
                hitX >= element.transform.x &&
                hitX <= element.transform.x + element.transform.width &&
                hitY >= element.transform.y &&
                hitY <= element.transform.y + element.transform.height
            ) {
                isDraggingElement = true;
                lastMousePos = { x: e.clientX, y: e.clientY };
                dragStartPos = { x: e.clientX, y: e.clientY };
                elementStartPos = { x: element.transform.x, y: element.transform.y };
                wrapper.style.cursor = 'move';
            }
        }
    };

    const onMouseMove = (e) => {
        const st = getState();
        if (isPanning) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setState({ panX: st.panX + dx, panY: st.panY + dy });
            lastMousePos = { x: e.clientX, y: e.clientY };
        } else if (isDraggingElement && st.selectedElementIds.length === 1) {
            const elementId = st.selectedElementIds[0];
            const totalDxPx = e.clientX - dragStartPos.x;
            const totalDyPx = e.clientY - dragStartPos.y;
            const totalDxMm = pxToMmLocal(totalDxPx / st.zoom);
            const totalDyMm = pxToMmLocal(totalDyPx / st.zoom);
            const el = st.masterLabel.elements.find((el) => el.id === elementId);
            if (!el) return;
            updateMasterElement(elementId, {
                transform: {
                    ...el.transform,
                    x: elementStartPos.x + totalDxMm,
                    y: elementStartPos.y + totalDyMm,
                },
            });
            lastMousePos = { x: e.clientX, y: e.clientY };
        }
    };

    const onMouseUp = () => {
        if (isPanning || isDraggingElement) {
            isPanning = false;
            isDraggingElement = false;
            wrapper.style.cursor = 'default';
        }
    };

    const onClick = (e) => {
        if (e.button === 1 || e.altKey) return;

        const st = getState();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Convert canvas pixel to world (pre-zoom) coordinates
        const worldX = (canvasX - st.panX) / st.zoom;
        const worldY = (canvasY - st.panY) / st.zoom;

        let clickedLabelIndex = null;
        let clickedElementId = null;

        if (st.viewMode === 'TEMPLATE') {
            const labelWidthPx = mmToPx(st.template.labelWidth, SCREEN_DPI);
            const labelHeightPx = mmToPx(st.template.labelHeight, SCREEN_DPI);
            // Label's world-space anchor is fixed (independent of zoom) —
            // see renderTemplateMode for why.
            const labelX = (canvas.width - labelWidthPx) / 2;
            const labelY = (canvas.height - labelHeightPx) / 2;

            if (
                worldX >= labelX &&
                worldX <= labelX + labelWidthPx &&
                worldY >= labelY &&
                worldY <= labelY + labelHeightPx
            ) {
                clickedLabelIndex = 0;
                const labelRelativeX = worldX - labelX;
                const labelRelativeY = worldY - labelY;
                const elements = getEffectiveElementsForLabel(0);
                for (let j = elements.length - 1; j >= 0; j--) {
                    const element = elements[j];
                    if (!element.visible) continue;
                    const ex = mmToPx(element.transform.x, SCREEN_DPI);
                    const ey = mmToPx(element.transform.y, SCREEN_DPI);
                    const ew = mmToPx(element.transform.width, SCREEN_DPI);
                    const eh = mmToPx(element.transform.height, SCREEN_DPI);
                    if (labelRelativeX >= ex && labelRelativeX <= ex + ew && labelRelativeY >= ey && labelRelativeY <= ey + eh) {
                        clickedElementId = element.id;
                        break;
                    }
                }
            }
        } else {
            // PREVIEW mode
            const totalLabels = getTotalLabels();
            const labelsPerPage = st.template.rows * st.template.columns;

            for (let i = 0; i < totalLabels; i++) {
                const position = getLabelPosition(st.template, i);
                if (!position) continue;
                const lx = mmToPx(position.x, SCREEN_DPI);
                const ly = mmToPx(position.y, SCREEN_DPI);
                const lw = mmToPx(st.template.labelWidth, SCREEN_DPI);
                const lh = mmToPx(st.template.labelHeight, SCREEN_DPI);
                if (worldX >= lx && worldX <= lx + lw && worldY >= ly && worldY <= ly + lh) {
                    const absoluteLabelIndex = st.previewPageIndex * labelsPerPage + i;
                    clickedLabelIndex = absoluteLabelIndex;
                    const labelRelativeX = worldX - lx;
                    const labelRelativeY = worldY - ly;
                    const elements = getEffectiveElementsForLabel(absoluteLabelIndex);
                    for (let j = elements.length - 1; j >= 0; j--) {
                        const element = elements[j];
                        if (!element.visible) continue;
                        const ex = mmToPx(element.transform.x, SCREEN_DPI);
                        const ey = mmToPx(element.transform.y, SCREEN_DPI);
                        const ew = mmToPx(element.transform.width, SCREEN_DPI);
                        const eh = mmToPx(element.transform.height, SCREEN_DPI);
                        if (labelRelativeX >= ex && labelRelativeX <= ex + ew && labelRelativeY >= ey && labelRelativeY <= ey + eh) {
                            clickedElementId = element.id;
                            break;
                        }
                    }
                    break;
                }
            }
        }

        if (clickedLabelIndex !== null) {
            setSelectedLabel(clickedLabelIndex);
        }

        if (clickedElementId) {
            setSelectedElements([clickedElementId]);
            if (clickedLabelIndex === null && st.viewMode === 'PREVIEW') {
                const totalLabels = getTotalLabels();
                const labelsPerPage = st.template.rows * st.template.columns;
                for (let i = 0; i < totalLabels; i++) {
                    const absoluteLabelIndex = st.previewPageIndex * labelsPerPage + i;
                    const elements = getEffectiveElementsForLabel(absoluteLabelIndex);
                    if (elements.some((el) => el.id === clickedElementId)) {
                        setSelectedLabel(absoluteLabelIndex);
                        break;
                    }
                }
            }
        } else {
            setSelectedElements([]);
        }
    };

    // ------------------------------------------------------------------
    // Double-click a text element → inline edit directly on the canvas
    // ------------------------------------------------------------------

    /**
     * Same hit-testing as onClick above, but restricted to text elements and
     * returning the element plus everything needed to position an overlay
     * editor over it (kept separate from onClick to avoid touching its
     * already-working selection/drag logic).
     */
    function hitTestTextElement(e) {
        const st = getState();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - st.panX) / st.zoom;
        const worldY = (canvasY - st.panY) / st.zoom;

        const findInLabel = (elements, labelRelativeX, labelRelativeY) => {
            for (let j = elements.length - 1; j >= 0; j--) {
                const el = elements[j];
                if (!el.visible || el.type !== 'text') continue;
                const ex = mmToPx(el.transform.x, SCREEN_DPI);
                const ey = mmToPx(el.transform.y, SCREEN_DPI);
                const ew = mmToPx(el.transform.width, SCREEN_DPI);
                const eh = mmToPx(el.transform.height, SCREEN_DPI);
                if (labelRelativeX >= ex && labelRelativeX <= ex + ew && labelRelativeY >= ey && labelRelativeY <= ey + eh) {
                    return el;
                }
            }
            return null;
        };

        if (st.viewMode === 'TEMPLATE') {
            const labelWidthPx = mmToPx(st.template.labelWidth, SCREEN_DPI);
            const labelHeightPx = mmToPx(st.template.labelHeight, SCREEN_DPI);
            // Label's world-space anchor is fixed (independent of zoom) —
            // see renderTemplateMode for why.
            const labelX = (canvas.width - labelWidthPx) / 2;
            const labelY = (canvas.height - labelHeightPx) / 2;
            if (worldX < labelX || worldX > labelX + labelWidthPx || worldY < labelY || worldY > labelY + labelHeightPx) {
                return null;
            }
            const element = findInLabel(getEffectiveElementsForLabel(0), worldX - labelX, worldY - labelY);
            return element ? { element, labelIndex: 0, labelOriginX: labelX, labelOriginY: labelY, canvasRect: rect } : null;
        }

        // PREVIEW mode
        const totalLabels = getTotalLabels();
        const labelsPerPage = st.template.rows * st.template.columns;
        for (let i = 0; i < totalLabels; i++) {
            const position = getLabelPosition(st.template, i);
            if (!position) continue;
            const lx = mmToPx(position.x, SCREEN_DPI);
            const ly = mmToPx(position.y, SCREEN_DPI);
            const lw = mmToPx(st.template.labelWidth, SCREEN_DPI);
            const lh = mmToPx(st.template.labelHeight, SCREEN_DPI);
            if (worldX < lx || worldX > lx + lw || worldY < ly || worldY > ly + lh) continue;
            const absoluteLabelIndex = st.previewPageIndex * labelsPerPage + i;
            const element = findInLabel(getEffectiveElementsForLabel(absoluteLabelIndex), worldX - lx, worldY - ly);
            return element ? { element, labelIndex: absoluteLabelIndex, labelOriginX: lx, labelOriginY: ly, canvasRect: rect } : null;
        }
        return null;
    }

    /**
     * Overlay a real <textarea> directly on top of a text element so its
     * raw (unresolved) template content — e.g. "{Name}" — can be typed
     * directly, instead of only through the Property Panel's Content field.
     */
    function startInlineTextEdit(hit) {
        endInlineTextEdit(false);

        const { element, labelIndex, labelOriginX, labelOriginY, canvasRect } = hit;
        const st = getState();
        const ex = mmToPx(element.transform.x, SCREEN_DPI);
        const ey = mmToPx(element.transform.y, SCREEN_DPI);
        const ew = mmToPx(element.transform.width, SCREEN_DPI);
        const eh = mmToPx(element.transform.height, SCREEN_DPI);

        const portalRoot = getPortalRoot();
        const rootRect = portalRoot.getBoundingClientRect();
        const left = (canvasRect.left - rootRect.left) + (labelOriginX + ex) * st.zoom + st.panX;
        const top = (canvasRect.top - rootRect.top) + (labelOriginY + ey) * st.zoom + st.panY;

        const textarea = document.createElement('textarea');
        textarea.value = element.content;
        textarea.spellcheck = false;
        textarea.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${ew * st.zoom}px;
            height: ${eh * st.zoom}px;
            margin: 0;
            padding: 2px;
            box-sizing: border-box;
            border: 2px solid var(--color-accent, #2563eb);
            outline: none;
            resize: none;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.96);
            font-family: ${element.fontFamily};
            font-size: ${element.fontSize * st.zoom}pt;
            font-weight: ${element.fontWeight};
            font-style: ${element.fontStyle};
            text-align: ${element.textAlign};
            color: ${element.color};
            line-height: ${element.lineHeight};
            letter-spacing: ${element.letterSpacing}px;
            transform: rotate(${element.transform.rotation}deg);
            transform-origin: center center;
            z-index: 2000;
        `;

        textarea._commit = () => {
            if (textarea.value !== element.content) {
                const s = getState();
                if (s.viewMode === 'PREVIEW' && s.selectedLabelIndex !== null) {
                    updateLabelElement(s.selectedLabelIndex, element.id, { content: textarea.value });
                } else {
                    updateMasterElement(element.id, { content: textarea.value });
                }
            }
        };
        textarea.addEventListener('blur', () => endInlineTextEdit(true));
        textarea.addEventListener('keydown', (e) => {
            // Keep every keystroke (including Ctrl+Z/C/V) inside the editor
            // instead of triggering app-level undo/copy/element shortcuts.
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                endInlineTextEdit(false);
            }
        });

        inlineEditorEl = textarea;
        portalRoot.appendChild(textarea);
        textarea.focus();
        textarea.select();

        setSelectedElements([element.id]);
        if (st.viewMode === 'PREVIEW') {
            setSelectedLabel(labelIndex);
        }
    }

    /**
     * Close the inline editor, optionally committing its value first.
     * @param {boolean} commit
     */
    function endInlineTextEdit(commit) {
        if (!inlineEditorEl) return;
        const el = inlineEditorEl;
        inlineEditorEl = null;
        if (commit) el._commit();
        el.remove();
    }

    const onDblClick = (e) => {
        if (e.button !== 0) return;
        const hit = hitTestTextElement(e);
        if (!hit) return;
        e.preventDefault();
        startInlineTextEdit(hit);
    };

    wrapper.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    wrapper.addEventListener('click', onClick);
    wrapper.addEventListener('dblclick', onDblClick);

    // ------------------------------------------------------------------
    // State subscriptions → trigger re-render
    // ------------------------------------------------------------------

    unsubscribeDesign = subscribe(() => {
        resizeTrigger++;
        requestAnimationFrame(render);
    });
    unsubscribeData = dataStore.subscribe(() => {
        resizeTrigger++;
        requestAnimationFrame(render);
    });

    // ------------------------------------------------------------------
    // Asset preloading
    // ------------------------------------------------------------------

    (async () => {
        try {
            await initializeAssets();
            const assets = await getAllAssets();
            const cache = new Map();
            for (const asset of assets) {
                try {
                    const dataUrl = await getAssetDataUrl(asset);
                    cache.set(asset.name, { asset, dataUrl });
                } catch (err) {
                    console.error(`Failed to load asset ${asset.name}:`, err);
                    cache.set(asset.name, { asset, dataUrl: asset.dataUrl });
                }
            }
            assetsCache = cache;
            resizeTrigger++;
            requestAnimationFrame(render);
        } catch (err) {
            console.error('Failed to load assets:', err);
        }
    })();

    // Initial render
    requestAnimationFrame(render);

    // ------------------------------------------------------------------
    // Return cleanup function
    // ------------------------------------------------------------------

    return () => {
        if (unsubscribeDesign) unsubscribeDesign();
        if (unsubscribeData) unsubscribeData();
        if (resizeObserver) resizeObserver.disconnect();
        if (transformControlsCleanup) transformControlsCleanup();
        endInlineTextEdit(false);
        canvas.removeEventListener('wheel', onWheel);
        wrapper.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        wrapper.removeEventListener('click', onClick);
        wrapper.removeEventListener('dblclick', onDblClick);
        container.removeChild(wrapper);
    };
}

// ===========================================================================
// Render loop
// ===========================================================================

function render() {
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const st = getState();

    // Ensure canvas dimensions match container
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
    }

    if (canvas.width === 0 || canvas.height === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom and pan transforms
    ctx.save();
    ctx.translate(st.panX, st.panY);
    ctx.scale(st.zoom, st.zoom);

    if (st.viewMode === 'TEMPLATE') {
        renderTemplateMode(ctx, st);
    } else {
        renderPreviewMode(ctx, st);
    }

    ctx.restore();

    // Render transform controls overlay
    renderTransformControls(st);
}

// ---------------------------------------------------------------------------
// Template mode (single centered label)
// ---------------------------------------------------------------------------

function renderTemplateMode(ctx, st) {
    const labelWidthPx = mmToPx(st.template.labelWidth, SCREEN_DPI);
    const labelHeightPx = mmToPx(st.template.labelHeight, SCREEN_DPI);

    // Visible viewport in world coordinates — shrinks/grows inversely with
    // zoom, so the background fill below always covers the whole visible
    // canvas at any zoom level.
    const canvasW = canvas.width / st.zoom;
    const canvasH = canvas.height / st.zoom;

    // The label's own world-space anchor must be a FIXED point, independent
    // of zoom — computed from the canvas's raw pixel size, not the
    // zoom-adjusted viewport above. Using the zoom-adjusted value here was
    // the bug: it made the label's "world" position shift on every zoom
    // change, fighting the wheel handler's cursor-anchored zoom math (the
    // symptom was ctrl+scroll zooming appearing to drift toward a corner
    // instead of staying under the cursor).
    const labelX = (canvas.width - labelWidthPx) / 2;
    const labelY = (canvas.height - labelHeightPx) / 2;

    // Background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Label background
    ctx.save();
    ctx.translate(labelX, labelY);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, labelWidthPx, labelHeightPx);

    // Border
    const isSelected = st.selectedLabelIndex === 0;
    const hasOverride = st.labelOverrides.has(0);
    if (isSelected) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 / st.zoom;
    } else if (hasOverride) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1 / st.zoom;
    } else {
        ctx.strokeStyle = '#d0d0d0';
        ctx.lineWidth = 1 / st.zoom;
    }
    ctx.strokeRect(0, 0, labelWidthPx, labelHeightPx);

    // Override indicator
    if (hasOverride) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(labelWidthPx - 8 / st.zoom, 8 / st.zoom, 4 / st.zoom, 0, Math.PI * 2);
        ctx.fill();
    }

    // Elements
    const elements = getEffectiveElementsForLabel(0);
    for (const element of elements) {
        if (element.visible) {
            renderElement(ctx, element, null, st);
        }
    }

    ctx.restore();
}

// ---------------------------------------------------------------------------
// Preview mode (full sheet)
// ---------------------------------------------------------------------------

function renderPreviewMode(ctx, st) {
    const sheetWidthPx = mmToPx(st.template.sheetConfig.width, SCREEN_DPI);
    const sheetHeightPx = mmToPx(st.template.sheetConfig.height, SCREEN_DPI);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, sheetWidthPx, sheetHeightPx);

    const totalLabels = getTotalLabels();
    const labelsPerPage = st.template.rows * st.template.columns;
    const dataState = dataStore.getState();

    for (let i = 0; i < totalLabels; i++) {
        const absoluteLabelIndex = st.previewPageIndex * labelsPerPage + i;
        const labelRowData = absoluteLabelIndex < dataState.rows.length ? dataState.rows[absoluteLabelIndex] : undefined;
        // Once real CSV data is loaded, leave any slot past the last row
        // blank (matches the PDF export) instead of repeating the master
        // template on a partially-filled last page.
        if (dataState.rows.length > 0 && labelRowData === undefined) continue;
        renderLabel(ctx, i, st, labelRowData, absoluteLabelIndex);
    }
}

// ---------------------------------------------------------------------------
// Single label (preview mode)
// ---------------------------------------------------------------------------

function renderLabel(ctx, labelIndex, st, rowData, absoluteLabelIndex) {
    const position = getLabelPosition(st.template, labelIndex);
    if (!position) return;

    const x = mmToPx(position.x, SCREEN_DPI);
    const y = mmToPx(position.y, SCREEN_DPI);
    const width = mmToPx(st.template.labelWidth, SCREEN_DPI);
    const height = mmToPx(st.template.labelHeight, SCREEN_DPI);

    const overrideLabelIndex = absoluteLabelIndex !== undefined ? absoluteLabelIndex : labelIndex;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height);

    // Border
    const isSelected = st.selectedLabelIndex === overrideLabelIndex;
    const hasOverride = st.labelOverrides.has(overrideLabelIndex);
    if (isSelected) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
    } else if (hasOverride) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
    } else {
        ctx.strokeStyle = '#d0d0d0';
        ctx.lineWidth = 1;
    }
    ctx.strokeRect(x, y, width, height);

    // Override indicator
    if (hasOverride) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(x + width - 8, y + 8, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Render elements
    const elements = getEffectiveElementsForLabel(overrideLabelIndex);
    ctx.save();

    // Smart clipping
    const clipRect = getLabelClipRect(st.template, labelIndex);
    if (clipRect) {
        const clipX = mmToPx(clipRect.x, SCREEN_DPI);
        const clipY = mmToPx(clipRect.y, SCREEN_DPI);
        const clipWidth = mmToPx(clipRect.width, SCREEN_DPI);
        const clipHeight = mmToPx(clipRect.height, SCREEN_DPI);
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipWidth, clipHeight);
        ctx.clip();
    }

    ctx.translate(x, y);

    for (const element of elements) {
        if (element.visible) {
            renderElement(ctx, element, rowData, st);
        }
    }

    ctx.restore();
}

// ===========================================================================
// Element rendering
// ===========================================================================

function renderElement(ctx, element, rowData, st) {
    const x = mmToPx(element.transform.x, SCREEN_DPI);
    const y = mmToPx(element.transform.y, SCREEN_DPI);
    const width = mmToPx(element.transform.width, SCREEN_DPI);
    const height = mmToPx(element.transform.height, SCREEN_DPI);

    ctx.save();

    // Rotation
    if (element.transform.rotation !== 0) {
        ctx.translate(x + width / 2, y + height / 2);
        ctx.rotate((element.transform.rotation * Math.PI) / 180);
        ctx.translate(-(x + width / 2), -(y + height / 2));
    }

    switch (element.type) {
        case 'text':
            renderTextElement(ctx, element, x, y, width, height, rowData, st);
            break;
        case 'shape':
            renderShapeElement(ctx, element, x, y, width, height);
            break;
        case 'image':
            renderImageElement(ctx, element, x, y, width, height, st);
            break;
        case 'placeholder':
            renderPlaceholderElement(ctx, element, x, y, width, height, rowData, st);
            break;
    }

    // Selection outline
    if (st.selectedElementIds.includes(element.id)) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        ctx.setLineDash([]);
    }

    ctx.restore();
}

// ---------------------------------------------------------------------------
// Text element
// ---------------------------------------------------------------------------

function renderTextElement(ctx, element, x, y, width, height, rowData, st) {
    ctx.fillStyle = element.color;
    ctx.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}pt ${element.fontFamily}`;
    ctx.textBaseline = 'top';

    let displayContent = element.content;

    // Resolve variable bindings / {variable} substitution
    const dataRow = rowData || getActiveRow(st);
    if (dataRow) {
        const contentBinding = element.bindings?.find((b) => b.property === 'content');
        if (contentBinding && contentBinding.columnId) {
            const boundValue = dataRow[contentBinding.columnId];
            if (boundValue !== undefined && boundValue !== null && boundValue !== '') {
                displayContent = String(boundValue);
            } else {
                displayContent = '';
            }
        } else {
            displayContent = displayContent.replace(VARIABLE_REGEX, (match, curlyKey, angleKey) => {
                const cleanKey = (curlyKey ?? angleKey).trim();
                const columns = dataStore.getState().columns;
                const column = columns.find((c) => c.name.toLowerCase() === cleanKey.toLowerCase());
                if (column) {
                    const value = dataRow[column.id];
                    if (value !== undefined && value !== null) return String(value);
                }
                const rowKey = Object.keys(dataRow).find((k) => k.toLowerCase() === cleanKey.toLowerCase());
                if (rowKey && dataRow[rowKey] !== undefined && dataRow[rowKey] !== null) {
                    return String(dataRow[rowKey]);
                }
                return match;
            });
        }
    }

    // Word-wrap helper
    const wrapText = (text, maxWidth) => {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines.length > 0 ? lines : [''];
    };

    // Split by manual newlines then word-wrap each
    const manualLines = displayContent.split('\n');
    const allLines = [];
    manualLines.forEach((line) => {
        const wrapped = wrapText(line, width);
        allLines.push(...wrapped);
    });

    const lineHeight = element.fontSize * element.lineHeight * 1.33;

    allLines.forEach((line, index) => {
        let textX = x;
        if (element.textAlign === 'center') {
            ctx.textAlign = 'center';
            textX = x + width / 2;
        } else if (element.textAlign === 'right') {
            ctx.textAlign = 'right';
            textX = x + width;
        } else {
            ctx.textAlign = 'left';
        }
        ctx.fillText(line, textX, y + index * lineHeight);
    });
}

// ---------------------------------------------------------------------------
// Shape element
// ---------------------------------------------------------------------------

function renderShapeElement(ctx, element, x, y, width, height) {
    ctx.globalAlpha = element.opacity;

    if (element.shapeType === 'rectangle') {
        if (element.cornerRadius) {
            const radius = mmToPx(element.cornerRadius, SCREEN_DPI);
            const strokeWidth = mmToPx(element.strokeWidth, SCREEN_DPI);

            if (typeof ctx.roundRect === 'function') {
                ctx.beginPath();
                ctx.roundRect(x, y, width, height, radius);
                if (element.fillColor !== 'transparent') {
                    ctx.fillStyle = element.fillColor;
                    ctx.fill();
                }
                if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
                    ctx.strokeStyle = element.strokeColor;
                    ctx.lineWidth = strokeWidth;
                    ctx.stroke();
                }
            } else {
                if (element.fillColor !== 'transparent') {
                    ctx.fillStyle = element.fillColor;
                    roundRect(ctx, x, y, width, height, radius);
                    ctx.fill();
                }
                if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
                    const halfStroke = strokeWidth / 2;
                    const strokeX = x + halfStroke;
                    const strokeY = y + halfStroke;
                    const sw = width - strokeWidth;
                    const sh = height - strokeWidth;
                    const sr = Math.max(0, radius - halfStroke);
                    ctx.strokeStyle = element.strokeColor;
                    ctx.lineWidth = strokeWidth;
                    ctx.lineJoin = 'round';
                    roundRect(ctx, strokeX, strokeY, sw, sh, sr);
                    ctx.stroke();
                }
            }
        } else {
            if (element.fillColor !== 'transparent') {
                ctx.fillStyle = element.fillColor;
                ctx.fillRect(x, y, width, height);
            }
            if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
                ctx.strokeStyle = element.strokeColor;
                ctx.lineWidth = mmToPx(element.strokeWidth, SCREEN_DPI);
                ctx.strokeRect(x, y, width, height);
            }
        }
    } else if (element.shapeType === 'circle') {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const radius = Math.min(width, height) / 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = element.fillColor;
        ctx.fill();
        if (element.strokeWidth > 0) {
            ctx.strokeStyle = element.strokeColor;
            ctx.lineWidth = mmToPx(element.strokeWidth, SCREEN_DPI);
            ctx.stroke();
        }
    } else if (element.shapeType === 'line') {
        ctx.strokeStyle = element.strokeColor;
        ctx.lineWidth = mmToPx(element.strokeWidth, SCREEN_DPI);
        ctx.beginPath();
        ctx.moveTo(x, y + height / 2);
        ctx.lineTo(x + width, y + height / 2);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Image element
// ---------------------------------------------------------------------------

function renderImageElement(ctx, element, x, y, width, height, st) {
    let img = imageCache.get(element.src);
    if (!img) {
        img = new Image();
        img.crossOrigin = 'anonymous';
        // Assigned once at creation, not on every render pass while
        // loading. Marking `_failed` here (rather than relying on
        // `img.complete && naturalWidth > 0` alone) matters because a
        // failed load still leaves `img.complete === true` — without this
        // flag, a genuinely broken image URL would render the neutral
        // "loading" placeholder forever instead of ever showing an error.
        img.onload = () => { resizeTrigger++; requestAnimationFrame(render); };
        img.onerror = () => { img._failed = true; resizeTrigger++; requestAnimationFrame(render); };
        imageCache.set(element.src, img);
        img.src = element.src;
    }

    if (img._failed) {
        drawImagePlaceholder(ctx, x, y, width, height, true);
        return;
    }

    if (img.complete && img.naturalWidth > 0) {
        try {
            const cropX = element.cropX * element.originalWidth;
            const cropY = element.cropY * element.originalHeight;
            const cropWidth = element.cropWidth * element.originalWidth;
            const cropHeight = element.cropHeight * element.originalHeight;
            ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
        } catch (_err) {
            drawImagePlaceholder(ctx, x, y, width, height, true);
        }
    } else {
        drawImagePlaceholder(ctx, x, y, width, height, false);
    }
}

// ---------------------------------------------------------------------------
// Placeholder element
// ---------------------------------------------------------------------------

function renderPlaceholderElement(ctx, element, x, y, width, height, rowData, st) {
    ctx.globalAlpha = element.opacity;

    const dataRow = rowData || getActiveRow(st);

    if (element.placeholderType === 'image') {
        let imageNameToUse = element.imageName;
        if (element.imageNameBinding && element.imageNameBinding.columnId && dataRow) {
            const columnValue = dataRow[element.imageNameBinding.columnId];
            if (columnValue !== undefined && columnValue !== null) {
                imageNameToUse = String(columnValue);
            }
        }

        const cachedAsset = imageNameToUse ? assetsCache.get(imageNameToUse) : undefined;
        if (!cachedAsset) {
            // No asset by this name in the library (deleted, mistyped, or a
            // data-bound row value that doesn't match any uploaded asset) —
            // show a visible "Not Found" box instead of rendering nothing,
            // so a broken reference is obvious right on the label instead
            // of silently leaving a blank gap.
            drawPlaceholderBox(ctx, element, x, y, width, height, true);
            ctx.globalAlpha = 1;
            return;
        }

        const { dataUrl } = cachedAsset;
        let img = imageCache.get(dataUrl);
        if (!img) {
            img = new Image();
            img.crossOrigin = 'anonymous';
            imageCache.set(dataUrl, img);
            img.src = dataUrl;
        }

        if (img.complete && img.naturalWidth > 0) {
            const imgAspect = img.width / img.height;
            const fitMode = element.imageFit || 'fitHorizontal';
            let drawWidth = width, drawHeight = height, drawX = x, drawY = y;

            switch (fitMode) {
                case 'fitVertical':
                    drawWidth = height * imgAspect;
                    drawHeight = height;
                    drawX = x + (width - drawWidth) / 2;
                    break;
                case 'fitHorizontal':
                    drawWidth = width;
                    drawHeight = width / imgAspect;
                    drawY = y + (height - drawHeight) / 2;
                    break;
                case 'stretch':
                    break;
            }

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        } else {
            drawPlaceholderBox(ctx, element, x, y, width, height);
            img.onload = () => { resizeTrigger++; requestAnimationFrame(render); };
            img.onerror = () => { resizeTrigger++; requestAnimationFrame(render); };
        }
    } else if (element.placeholderType === 'qrCode') {
        let qrValue = element.displayText;
        const hasBinding = !!(element.qrValueBinding && element.qrValueBinding.columnId && dataRow);

        if (element.qrValueBinding && element.qrValueBinding.columnId && dataRow) {
            const columnValue = dataRow[element.qrValueBinding.columnId];
            if (columnValue !== undefined && columnValue !== null) {
                qrValue = String(columnValue);
            }
        }

        const shouldGenerate = qrValue && (hasBinding || qrValue !== element.displayText);

        if (shouldGenerate) {
            const cacheKey = `qr_${qrValue}`;
            const cachedQr = imageCache.get(cacheKey);

            if (cachedQr && cachedQr.complete) {
                const qrSize = Math.min(width, height);
                const qrX = x + (width - qrSize) / 2;
                const qrY = y + (height - qrSize) / 2;
                ctx.drawImage(cachedQr, qrX, qrY, qrSize, qrSize);
            } else {
                drawPlaceholderBox(ctx, element, x, y, width, height);

                generateQRCode(qrValue, Math.min(width, height) * 4)
                    .then((qrDataUrl) => {
                        const qrImg = new Image();
                        qrImg.src = qrDataUrl;
                        qrImg.onload = () => {
                            imageCache.set(cacheKey, qrImg);
                            resizeTrigger++;
                            requestAnimationFrame(render);
                        };
                    })
                    .catch((err) => {
                        console.error('Failed to generate QR code:', err);
                    });
            }
        } else {
            ctx.globalAlpha = 1;
            return;
        }
    }

    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Placeholder box (generic fallback)
// ---------------------------------------------------------------------------

function drawPlaceholderBox(ctx, element, x, y, width, height, hasError = false) {
    ctx.fillStyle = element.fillColor;
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = hasError ? '#ff0000' : element.strokeColor;
    ctx.lineWidth = element.strokeWidth;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = hasError ? '#ff0000' : '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hasError ? 'Not Found' : element.displayText, x + width / 2, y + height / 2);
}

// ---------------------------------------------------------------------------
// Image placeholder (loading/error state)
// ---------------------------------------------------------------------------

function drawImagePlaceholder(ctx, x, y, width, height, isError) {
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#999999';
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = isError ? '#ff0000' : '#666666';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isError ? '\u26a0' : '\ud83d\uddbc\ufe0f', x + width / 2, y + height / 2);
}

// ---------------------------------------------------------------------------
// Rounded rectangle helper
// ---------------------------------------------------------------------------

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ---------------------------------------------------------------------------
// QR code generation
// ---------------------------------------------------------------------------

async function generateQRCode(text, size) {
    try {
        const toDataURL = await getQRCodeToDataURL();
        return await toDataURL(text, { width: size, margin: 1 });
    } catch (err) {
        console.error('QRCode library unavailable, showing placeholder instead:', err);
    }
    // Fallback: minimal QR-like placeholder
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.max(10, size / 10)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR', size / 2, size / 2);
    return c.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Active data row helper
// ---------------------------------------------------------------------------

function getActiveRow(st) {
    const dataState = dataStore.getState();
    const labelsPerPage = st.template.rows * st.template.columns;
    const activeRowIndex = st.viewMode === 'PREVIEW'
        ? st.previewPageIndex * labelsPerPage
        : (st.selectedLabelIndex !== null ? st.selectedLabelIndex : 0);
    return activeRowIndex < dataState.rows.length ? dataState.rows[activeRowIndex] : undefined;
}

// ---------------------------------------------------------------------------
// TransformControls overlay
// ---------------------------------------------------------------------------

function renderTransformControls(st) {
    // Skip recreation during active drag — the controls are still tracking
    if (transformControlsCleanup && transformControlsCleanup.isDragging()) {
        return;
    }

    // Remove previous controls
    if (transformControlsCleanup) {
        transformControlsCleanup();
        transformControlsCleanup = null;
    }

    if (st.selectedElementIds.length !== 1 || !wrapper) return;

    const elementId = st.selectedElementIds[0];

    // Find the effective element
    let element;
    if (st.viewMode === 'PREVIEW' && st.selectedLabelIndex !== null) {
        const effectiveElements = getEffectiveElementsForLabel(st.selectedLabelIndex);
        element = effectiveElements.find((el) => el.id === elementId);
    } else {
        element = st.masterLabel.elements.find((el) => el.id === elementId);
    }

    if (!element) return;

    // Calculate container offset in mm (label origin in world coordinates)
    let containerOffset;
    if (st.viewMode === 'TEMPLATE') {
        // Label's world-space anchor is fixed (independent of zoom) — see
        // renderTemplateMode for why.
        const labelWidthPx = mmToPx(st.template.labelWidth, SCREEN_DPI);
        const labelHeightPx = mmToPx(st.template.labelHeight, SCREEN_DPI);
        const labelXPx = (canvas.width - labelWidthPx) / 2;
        const labelYPx = (canvas.height - labelHeightPx) / 2;
        containerOffset = { x: pxToMmLocal(labelXPx), y: pxToMmLocal(labelYPx) };
    } else {
        const labelIndex = st.selectedLabelIndex !== null ? st.selectedLabelIndex : 0;
        const labelPos = getLabelPosition(st.template, labelIndex);
        if (!labelPos) return;
        containerOffset = labelPos;
    }

    const handleUpdate = (updates) => {
        if (st.viewMode === 'PREVIEW' && st.selectedLabelIndex !== null) {
            updateLabelElement(st.selectedLabelIndex, element.id, updates);
        } else {
            updateMasterElement(element.id, updates);
        }
    };

    transformControlsCleanup = createTransformControls(
        wrapper,
        element,
        st.zoom,
        st.panX,
        st.panY,
        containerOffset,
        handleUpdate
    );
}
