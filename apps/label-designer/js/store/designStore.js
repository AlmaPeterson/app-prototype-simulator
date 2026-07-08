/**
 * Design State Store
 *
 * Vanilla JS pub/sub state manager for the entire design application state.
 * Replaces the Zustand + zundo store from the TypeScript original.
 */

import { AVERY_5163 } from '../lib/templates.js';

// ============================================================================
// State
// ============================================================================

let state = {
    template: AVERY_5163,
    viewMode: 'TEMPLATE',
    previewPageIndex: 0,
    masterLabel: { elements: [], backgroundColor: '#ffffff' },
    labelOverrides: new Map(),
    selectedLabelIndex: null,
    selectedElementIds: [],
    zoom: 1.0,
    panX: 0,
    panY: 0,
    clipboard: [],
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
// Undo / Redo History
// ============================================================================

/** @type {Array<Pick<typeof state, 'template'|'masterLabel'|'labelOverrides'>>} */
const undoStack = [];
/** @type {Array<Pick<typeof state, 'template'|'masterLabel'|'labelOverrides'>>} */
const redoStack = [];
const HISTORY_LIMIT = 50;

/**
 * Snapshot the undoable fields and push onto the undo stack.
 * Clears the redo stack on any new mutation.
 */
function pushHistory() {
    undoStack.push({
        template: state.template,
        masterLabel: state.masterLabel,
        labelOverrides: state.labelOverrides,
    });
    if (undoStack.length > HISTORY_LIMIT) {
        undoStack.shift();
    }
    // Any new action invalidates the redo future
    redoStack.length = 0;
    notifyHistory();
}

/**
 * Restore undoable fields from a snapshot.
 * @param {object} snapshot
 */
function restoreSnapshot(snapshot) {
    state = {
        ...state,
        template: snapshot.template,
        masterLabel: snapshot.masterLabel,
        labelOverrides: snapshot.labelOverrides,
    };
    listeners.forEach((fn) => fn(state));
}

function notifyHistory() {
    listeners.forEach((fn) => fn(state));
}

// ============================================================================
// Master Override Helpers (inline from masterOverride.ts)
// ============================================================================

/**
 * Get the effective elements for a label by merging master with overrides.
 * @param {import('../types.js').MasterLabel} masterLabel
 * @param {import('../types.js').LabelOverride} [override]
 * @returns {import('../types.js').DesignElement[]}
 */
function getEffectiveElements(masterLabel, override) {
    /** @type {import('../types.js').DesignElement[]} */
    let result = [];

    if (!override) {
        result = [...masterLabel.elements];
    } else {
        for (const masterElement of masterLabel.elements) {
            if (override.hiddenElementIds.includes(masterElement.id)) {
                continue;
            }
            const elementOverride = override.elementOverrides.find(
                (eo) => eo.elementId === masterElement.id
            );
            if (elementOverride) {
                result.push({
                    ...masterElement,
                    ...elementOverride.overrides,
                });
            } else {
                result.push({ ...masterElement });
            }
        }
        result.push(...override.additionalElements);
    }

    result.sort((a, b) => a.zIndex - b.zIndex);
    return result;
}

/**
 * Create / merge an override for a specific element on a specific label.
 * @param {number} labelIndex
 * @param {string} elementId
 * @param {Partial<import('../types.js').DesignElement>} overrides
 * @param {import('../types.js').LabelOverride} [existingOverride]
 * @returns {import('../types.js').LabelOverride}
 */
function createElementOverride(labelIndex, elementId, overrides, existingOverride) {
    const base = existingOverride || {
        labelIndex,
        elementOverrides: [],
        hiddenElementIds: [],
        additionalElements: [],
    };

    const existingElementOverride = base.elementOverrides.find(
        (eo) => eo.elementId === elementId
    );

    if (existingElementOverride) {
        existingElementOverride.overrides = {
            ...existingElementOverride.overrides,
            ...overrides,
        };
    } else {
        base.elementOverrides.push({ elementId, overrides });
    }

    return base;
}

// ============================================================================
// Element ID Generation
// ============================================================================

let elementIdCounter = 0;

/**
 * Generate a unique element ID.
 * @returns {string}
 */
export function generateElementId() {
    return `element-${Date.now()}-${elementIdCounter++}`;
}

// ============================================================================
// Element Factory Functions
// ============================================================================

/**
 * Create a new TextElement with sensible defaults.
 * @param {number} x
 * @param {number} y
 * @param {string} [content='Text']
 * @returns {import('../types.js').TextElement}
 */
export function createTextElement(x, y, content = 'Text') {
    return {
        id: generateElementId(),
        type: 'text',
        transform: { x, y, width: 50, height: 10, rotation: 0 },
        zIndex: 0,
        visible: true,
        locked: false,
        content,
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        color: '#000000',
        lineHeight: 1.2,
        letterSpacing: 0,
        bindings: [],
    };
}

/**
 * Create a new ImageElement with sensible defaults.
 * @param {number} x
 * @param {number} y
 * @param {string} src
 * @param {number} originalWidth
 * @param {number} originalHeight
 * @returns {import('../types.js').ImageElement}
 */
export function createImageElement(x, y, src, originalWidth, originalHeight) {
    return {
        id: generateElementId(),
        type: 'image',
        transform: { x, y, width: 25, height: 25, rotation: 0 },
        zIndex: 0,
        visible: true,
        locked: false,
        src,
        originalWidth,
        originalHeight,
        cropX: 0,
        cropY: 0,
        cropWidth: 1,
        cropHeight: 1,
        maintainAspectRatio: true,
    };
}

/**
 * Create a new ShapeElement with sensible defaults.
 * @param {number} x
 * @param {number} y
 * @param {string} [shapeType='rectangle']
 * @returns {import('../types.js').ShapeElement}
 */
export function createShapeElement(x, y, shapeType = 'rectangle') {
    return {
        id: generateElementId(),
        type: 'shape',
        shapeType,
        transform: { x, y, width: 20, height: 20, rotation: 0 },
        zIndex: 0,
        visible: true,
        locked: false,
        fillColor: '#cccccc',
        strokeColor: '#000000',
        strokeWidth: 0.5,
        cornerRadius: 0,
        opacity: 1,
    };
}

/**
 * Create a new PlaceholderElement with sensible defaults.
 * @param {number} x
 * @param {number} y
 * @param {string} [placeholderType='image']
 * @param {string} [imageName]
 * @returns {import('../types.js').PlaceholderElement}
 */
export function createPlaceholderElement(x, y, placeholderType = 'image', imageName) {
    return {
        id: generateElementId(),
        type: 'placeholder',
        placeholderType,
        transform: { x, y, width: 25, height: 25, rotation: 0 },
        zIndex: 0,
        visible: true,
        locked: false,
        imageName: placeholderType === 'image' ? (imageName || 'image-name') : undefined,
        imageFit: placeholderType === 'image' ? 'fitHorizontal' : undefined,
        qrValueBinding: placeholderType === 'qrCode' ? undefined : undefined,
        displayText: placeholderType === 'image' ? (imageName || 'Image') : 'QR Code',
        fillColor: '#f0f0f0',
        strokeColor: '#999999',
        strokeWidth: 1,
        opacity: 1,
    };
}

// ============================================================================
// Actions
// ============================================================================

// --- Template ---

/**
 * Set the active label template.
 * @param {import('../types.js').LabelTemplate} template
 */
export function setTemplate(template) {
    pushHistory();
    setState({ template, labelOverrides: new Map() });
}

// --- View Mode ---

/**
 * Set the view mode.
 * @param {'TEMPLATE'|'PREVIEW'} viewMode
 */
export function setViewMode(viewMode) {
    setState({ viewMode });
}

/**
 * Set the preview page index. Clears label selection.
 * @param {number} index
 */
export function setPreviewPageIndex(index) {
    setState({
        previewPageIndex: Math.max(0, index),
        selectedLabelIndex: null,
        selectedElementIds: [],
    });
}

// --- Master Label ---

/**
 * Replace the entire master label.
 * @param {import('../types.js').MasterLabel} masterLabel
 */
export function setMasterLabel(masterLabel) {
    pushHistory();
    setState({ masterLabel });
}

/**
 * Add an element to the master label. zIndex is set to top.
 * @param {import('../types.js').DesignElement} element
 */
export function addElementToMaster(element) {
    pushHistory();
    setState((s) => {
        const maxZIndex =
            s.masterLabel.elements.length > 0
                ? Math.max(...s.masterLabel.elements.map((el) => el.zIndex), -1)
                : -1;
        const elementWithZIndex = { ...element, zIndex: maxZIndex + 1 };
        return {
            masterLabel: {
                ...s.masterLabel,
                elements: [...s.masterLabel.elements, elementWithZIndex],
            },
        };
    });
}

/**
 * Update a single element in the master label by ID.
 * @param {string} elementId
 * @param {Partial<import('../types.js').DesignElement>} updates
 */
export function updateMasterElement(elementId, updates) {
    pushHistory();
    setState((s) => ({
        masterLabel: {
            ...s.masterLabel,
            elements: s.masterLabel.elements.map((el) =>
                el.id === elementId ? { ...el, ...updates } : el
            ),
        },
    }));
}

/**
 * Remove an element from the master label by ID.
 * @param {string} elementId
 */
export function removeMasterElement(elementId) {
    pushHistory();
    setState((s) => ({
        masterLabel: {
            ...s.masterLabel,
            elements: s.masterLabel.elements.filter((el) => el.id !== elementId),
        },
        selectedElementIds: s.selectedElementIds.filter((id) => id !== elementId),
    }));
}

// --- Label Overrides ---

/**
 * Set an override for a specific label index.
 * @param {number} labelIndex
 * @param {import('../types.js').LabelOverride} override
 */
export function setLabelOverride(labelIndex, override) {
    pushHistory();
    setState((s) => {
        const newOverrides = new Map(s.labelOverrides);
        newOverrides.set(labelIndex, override);
        return { labelOverrides: newOverrides };
    });
}

/**
 * Remove the override for a specific label index.
 * @param {number} labelIndex
 */
export function removeLabelOverride(labelIndex) {
    pushHistory();
    setState((s) => {
        const newOverrides = new Map(s.labelOverrides);
        newOverrides.delete(labelIndex);
        return { labelOverrides: newOverrides };
    });
}

/**
 * Clear all label overrides.
 */
export function clearAllOverrides() {
    pushHistory();
    setState({ labelOverrides: new Map() });
}

/**
 * Update a single element within a specific label's override.
 * Handles both master elements (via override merging) and additional-only elements.
 * @param {number} labelIndex
 * @param {string} elementId
 * @param {Partial<import('../types.js').DesignElement>} updates
 */
export function updateLabelElement(labelIndex, elementId, updates) {
    pushHistory();
    setState((s) => {
        const existingOverride = s.labelOverrides.get(labelIndex);

        const isInMaster = s.masterLabel.elements.some((el) => el.id === elementId);
        const isInAdditional =
            existingOverride &&
            existingOverride.additionalElements.some((el) => el.id === elementId);

        if (!isInMaster && isInAdditional && existingOverride) {
            // Element is only in additionalElements — update directly
            const updatedAdditional = existingOverride.additionalElements.map((el) =>
                el.id === elementId ? { ...el, ...updates } : el
            );
            const newOverride = {
                ...existingOverride,
                additionalElements: updatedAdditional,
            };
            const newOverrides = new Map(s.labelOverrides);
            newOverrides.set(labelIndex, newOverride);
            return { labelOverrides: newOverrides };
        }

        // Element is in master (or will be) — use normal override mechanism
        const newOverride = createElementOverride(
            labelIndex,
            elementId,
            updates,
            existingOverride
        );
        const newOverrides = new Map(s.labelOverrides);
        newOverrides.set(labelIndex, newOverride);
        return { labelOverrides: newOverrides };
    });
}

// --- Selection ---

/**
 * Set the selected label index.
 * @param {number|null} labelIndex
 */
export function setSelectedLabel(labelIndex) {
    setState({ selectedLabelIndex: labelIndex });
}

/**
 * Set the selected element IDs.
 * @param {string[]} elementIds
 */
export function setSelectedElements(elementIds) {
    setState({ selectedElementIds: elementIds });
}

/**
 * Toggle an element's selection state.
 * @param {string} elementId
 */
export function toggleElementSelection(elementId) {
    setState((s) => {
        const isSelected = s.selectedElementIds.includes(elementId);
        return {
            selectedElementIds: isSelected
                ? s.selectedElementIds.filter((id) => id !== elementId)
                : [...s.selectedElementIds, elementId],
        };
    });
}

/**
 * Clear all element selections.
 */
export function clearSelection() {
    setState({ selectedElementIds: [] });
}

// --- View ---

/**
 * Set zoom level, clamped to [0.1, 5.0].
 * @param {number} zoom
 */
export function setZoom(zoom) {
    setState({ zoom: Math.max(0.1, Math.min(5.0, zoom)) });
}

/**
 * Set pan offsets.
 * @param {number} panX
 * @param {number} panY
 */
export function setPan(panX, panY) {
    setState({ panX, panY });
}

/**
 * Reset zoom and pan to defaults.
 */
export function resetView() {
    setState({ zoom: 1.0, panX: 0, panY: 0 });
}

// --- Utility ---

/**
 * Get the effective elements for a label, merging master + overrides.
 * @param {number} labelIndex
 * @returns {import('../types.js').DesignElement[]}
 */
export function getEffectiveElementsForLabel(labelIndex) {
    const s = getState();
    const override = s.labelOverrides.get(labelIndex);
    return getEffectiveElements(s.masterLabel, override);
}

/**
 * Get the total number of labels in the current template.
 * @returns {number}
 */
export function getTotalLabels() {
    const s = getState();
    return s.template.rows * s.template.columns;
}

// --- Z-Order Management ---

/**
 * Bring an element to the front (highest zIndex).
 * @param {string} elementId
 */
export function bringToFront(elementId) {
    pushHistory();
    setState((s) => {
        const elements = s.masterLabel.elements;
        const maxZIndex = Math.max(...elements.map((el) => el.zIndex), -1);
        return {
            masterLabel: {
                ...s.masterLabel,
                elements: elements.map((el) =>
                    el.id === elementId ? { ...el, zIndex: maxZIndex + 1 } : el
                ),
            },
        };
    });
}

/**
 * Send an element to the back (lowest zIndex).
 * @param {string} elementId
 */
export function sendToBack(elementId) {
    pushHistory();
    setState((s) => {
        const elements = s.masterLabel.elements;
        const minZIndex = Math.min(...elements.map((el) => el.zIndex), 0);
        return {
            masterLabel: {
                ...s.masterLabel,
                elements: elements.map((el) =>
                    el.id === elementId ? { ...el, zIndex: minZIndex - 1 } : el
                ),
            },
        };
    });
}

/**
 * Bring an element forward by one layer (swap with next higher zIndex).
 * @param {string} elementId
 */
export function bringForward(elementId) {
    pushHistory();
    setState((s) => {
        const elements = [...s.masterLabel.elements];
        const elementIndex = elements.findIndex((el) => el.id === elementId);
        if (elementIndex === -1) return {};

        const currentElement = elements[elementIndex];
        const nextElement = elements
            .filter((el) => el.zIndex > currentElement.zIndex)
            .sort((a, b) => a.zIndex - b.zIndex)[0];

        if (!nextElement) return {};

        const tempZIndex = currentElement.zIndex;
        return {
            masterLabel: {
                ...s.masterLabel,
                elements: elements.map((el) => {
                    if (el.id === elementId) return { ...el, zIndex: nextElement.zIndex };
                    if (el.id === nextElement.id) return { ...el, zIndex: tempZIndex };
                    return el;
                }),
            },
        };
    });
}

/**
 * Send an element backward by one layer (swap with next lower zIndex).
 * @param {string} elementId
 */
export function sendBackward(elementId) {
    pushHistory();
    setState((s) => {
        const elements = [...s.masterLabel.elements];
        const elementIndex = elements.findIndex((el) => el.id === elementId);
        if (elementIndex === -1) return {};

        const currentElement = elements[elementIndex];
        const prevElement = elements
            .filter((el) => el.zIndex < currentElement.zIndex)
            .sort((a, b) => b.zIndex - a.zIndex)[0];

        if (!prevElement) return {};

        const tempZIndex = currentElement.zIndex;
        return {
            masterLabel: {
                ...s.masterLabel,
                elements: elements.map((el) => {
                    if (el.id === elementId) return { ...el, zIndex: prevElement.zIndex };
                    if (el.id === prevElement.id) return { ...el, zIndex: tempZIndex };
                    return el;
                }),
            },
        };
    });
}

/**
 * Reorder elements to match the given ID array order.
 * @param {string[]} elementIds
 */
export function reorderElements(elementIds) {
    pushHistory();
    setState((s) => ({
        masterLabel: {
            ...s.masterLabel,
            elements: s.masterLabel.elements.map((el) => {
                const newIndex = elementIds.indexOf(el.id);
                if (newIndex === -1) return el;
                return { ...el, zIndex: newIndex };
            }),
        },
    }));
}

// --- Copy / Paste / Duplicate ---

/**
 * Copy elements to the internal clipboard (cloned with new IDs).
 * @param {string[]} elementIds
 */
export function copyElements(elementIds) {
    setState((s) => {
        const elementsToCopy = s.masterLabel.elements.filter((el) =>
            elementIds.includes(el.id)
        );
        const clonedElements = elementsToCopy.map((el) => ({
            ...el,
            id: generateElementId(),
        }));
        return { clipboard: clonedElements };
    });
}

/**
 * Paste clipboard elements into the master label (offset +5mm each axis).
 * Selects the pasted elements.
 */
export function pasteElements() {
    pushHistory();
    setState((s) => {
        if (s.clipboard.length === 0) return {};

        const maxZIndex =
            s.masterLabel.elements.length > 0
                ? Math.max(...s.masterLabel.elements.map((el) => el.zIndex), -1)
                : -1;

        const offsetX = 5;
        const offsetY = 5;

        const pastedElements = s.clipboard.map((el, index) => ({
            ...el,
            id: generateElementId(),
            zIndex: maxZIndex + 1 + index,
            transform: {
                ...el.transform,
                x: el.transform.x + offsetX,
                y: el.transform.y + offsetY,
            },
        }));

        return {
            masterLabel: {
                ...s.masterLabel,
                elements: [...s.masterLabel.elements, ...pastedElements],
            },
            selectedElementIds: pastedElements.map((el) => el.id),
        };
    });
}

/**
 * Duplicate selected elements (clone with new IDs, offset +5mm).
 * Selects the duplicates.
 * @param {string[]} elementIds
 */
export function duplicateElements(elementIds) {
    pushHistory();
    setState((s) => {
        const elementsToDuplicate = s.masterLabel.elements.filter((el) =>
            elementIds.includes(el.id)
        );
        if (elementsToDuplicate.length === 0) return {};

        const maxZIndex =
            s.masterLabel.elements.length > 0
                ? Math.max(...s.masterLabel.elements.map((el) => el.zIndex), -1)
                : -1;

        const offsetX = 5;
        const offsetY = 5;

        const duplicatedElements = elementsToDuplicate.map((el, index) => ({
            ...el,
            id: generateElementId(),
            zIndex: maxZIndex + 1 + index,
            transform: {
                ...el.transform,
                x: el.transform.x + offsetX,
                y: el.transform.y + offsetY,
            },
        }));

        return {
            masterLabel: {
                ...s.masterLabel,
                elements: [...s.masterLabel.elements, ...duplicatedElements],
            },
            selectedElementIds: duplicatedElements.map((el) => el.id),
        };
    });
}

// --- Align / Distribute ---

/**
 * Align selected elements relative to each other.
 * @param {string[]} elementIds
 * @param {'left'|'right'|'center'|'top'|'bottom'|'middle'} alignment
 */
export function alignElements(elementIds, alignment) {
    if (elementIds.length < 2) return;
    pushHistory();
    setState((s) => {
        const elementsToAlign = s.masterLabel.elements.filter((el) =>
            elementIds.includes(el.id)
        );
        if (elementsToAlign.length < 2) return {};

        let referenceValue;
        if (alignment === 'left') {
            referenceValue = Math.min(...elementsToAlign.map((el) => el.transform.x));
        } else if (alignment === 'right') {
            referenceValue = Math.max(
                ...elementsToAlign.map((el) => el.transform.x + el.transform.width)
            );
        } else if (alignment === 'center') {
            const centers = elementsToAlign.map(
                (el) => el.transform.x + el.transform.width / 2
            );
            referenceValue = (Math.min(...centers) + Math.max(...centers)) / 2;
        } else if (alignment === 'top') {
            referenceValue = Math.min(...elementsToAlign.map((el) => el.transform.y));
        } else if (alignment === 'bottom') {
            referenceValue = Math.max(
                ...elementsToAlign.map((el) => el.transform.y + el.transform.height)
            );
        } else if (alignment === 'middle') {
            const middles = elementsToAlign.map(
                (el) => el.transform.y + el.transform.height / 2
            );
            referenceValue = (Math.min(...middles) + Math.max(...middles)) / 2;
        } else {
            return {};
        }

        const updatedElements = [...s.masterLabel.elements];
        for (const element of elementsToAlign) {
            const index = updatedElements.findIndex((el) => el.id === element.id);
            if (index === -1) continue;

            const newTransform = { ...element.transform };
            if (alignment === 'left') {
                newTransform.x = referenceValue;
            } else if (alignment === 'right') {
                newTransform.x = referenceValue - element.transform.width;
            } else if (alignment === 'center') {
                newTransform.x = referenceValue - element.transform.width / 2;
            } else if (alignment === 'top') {
                newTransform.y = referenceValue;
            } else if (alignment === 'bottom') {
                newTransform.y = referenceValue - element.transform.height;
            } else if (alignment === 'middle') {
                newTransform.y = referenceValue - element.transform.height / 2;
            }
            updatedElements[index] = { ...element, transform: newTransform };
        }

        return {
            masterLabel: { ...s.masterLabel, elements: updatedElements },
        };
    });
}

/**
 * Distribute selected elements evenly along an axis.
 * @param {string[]} elementIds
 * @param {'horizontal'|'vertical'} direction
 */
export function distributeElements(elementIds, direction) {
    if (elementIds.length < 3) return;
    pushHistory();
    setState((s) => {
        const elementsToDistribute = s.masterLabel.elements
            .filter((el) => elementIds.includes(el.id))
            .sort((a, b) =>
                direction === 'horizontal'
                    ? a.transform.x - b.transform.x
                    : a.transform.y - b.transform.y
            );

        if (elementsToDistribute.length < 3) return {};

        const updatedElements = [...s.masterLabel.elements];

        if (direction === 'horizontal') {
            const firstX = elementsToDistribute[0].transform.x;
            const lastX =
                elementsToDistribute[elementsToDistribute.length - 1].transform.x;
            const totalWidth = elementsToDistribute.reduce(
                (sum, el) => sum + el.transform.width,
                0
            );
            const gap =
                (lastX - firstX - totalWidth) / (elementsToDistribute.length - 1);

            let currentX = firstX;
            elementsToDistribute.forEach((element, index) => {
                if (index > 0) {
                    currentX +=
                        elementsToDistribute[index - 1].transform.width + gap;
                }
                const elementIndex = updatedElements.findIndex(
                    (el) => el.id === element.id
                );
                if (elementIndex !== -1) {
                    updatedElements[elementIndex] = {
                        ...element,
                        transform: { ...element.transform, x: currentX },
                    };
                }
            });
        } else {
            const firstY = elementsToDistribute[0].transform.y;
            const lastY =
                elementsToDistribute[elementsToDistribute.length - 1].transform.y;
            const totalHeight = elementsToDistribute.reduce(
                (sum, el) => sum + el.transform.height,
                0
            );
            const gap =
                (lastY - firstY - totalHeight) / (elementsToDistribute.length - 1);

            let currentY = firstY;
            elementsToDistribute.forEach((element, index) => {
                if (index > 0) {
                    currentY +=
                        elementsToDistribute[index - 1].transform.height + gap;
                }
                const elementIndex = updatedElements.findIndex(
                    (el) => el.id === element.id
                );
                if (elementIndex !== -1) {
                    updatedElements[elementIndex] = {
                        ...element,
                        transform: { ...element.transform, y: currentY },
                    };
                }
            });
        }

        return {
            masterLabel: { ...s.masterLabel, elements: updatedElements },
        };
    });
}

/**
 * Align selected elements to the label boundaries.
 * @param {string[]} elementIds
 * @param {'left'|'right'|'centerH'|'top'|'bottom'|'centerV'} alignment
 */
export function alignElementsToLabel(elementIds, alignment) {
    if (elementIds.length === 0) return;
    pushHistory();
    setState((s) => {
        const elementsToAlign = s.masterLabel.elements.filter((el) =>
            elementIds.includes(el.id)
        );
        if (elementsToAlign.length === 0) return {};

        const labelWidth = s.template.labelWidth;
        const labelHeight = s.template.labelHeight;

        const updatedElements = [...s.masterLabel.elements];
        for (const element of elementsToAlign) {
            const index = updatedElements.findIndex((el) => el.id === element.id);
            if (index === -1) continue;

            const newTransform = { ...element.transform };
            if (alignment === 'left') {
                newTransform.x = 0;
            } else if (alignment === 'right') {
                newTransform.x = labelWidth - element.transform.width;
            } else if (alignment === 'centerH') {
                newTransform.x = (labelWidth - element.transform.width) / 2;
            } else if (alignment === 'top') {
                newTransform.y = 0;
            } else if (alignment === 'bottom') {
                newTransform.y = labelHeight - element.transform.height;
            } else if (alignment === 'centerV') {
                newTransform.y = (labelHeight - element.transform.height) / 2;
            }
            updatedElements[index] = { ...element, transform: newTransform };
        }

        return {
            masterLabel: { ...s.masterLabel, elements: updatedElements },
        };
    });
}

// --- Undo / Redo ---

/**
 * Whether undo is available.
 * @returns {boolean}
 */
export function getCanUndo() {
    return undoStack.length > 0;
}

/**
 * Whether redo is available.
 * @returns {boolean}
 */
export function getCanRedo() {
    return redoStack.length > 0;
}

/**
 * Undo the last template/masterLabel/labelOverrides mutation.
 */
export function undo() {
    if (undoStack.length === 0) return;
    const snapshot = undoStack.pop();
    redoStack.push({
        template: state.template,
        masterLabel: state.masterLabel,
        labelOverrides: state.labelOverrides,
    });
    restoreSnapshot(snapshot);
    notifyHistory();
}

/**
 * Redo the last undone mutation.
 */
export function redo() {
    if (redoStack.length === 0) return;
    const snapshot = redoStack.pop();
    undoStack.push({
        template: state.template,
        masterLabel: state.masterLabel,
        labelOverrides: state.labelOverrides,
    });
    restoreSnapshot(snapshot);
    notifyHistory();
}
