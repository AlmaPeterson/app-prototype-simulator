/**
 * Transform Controls Component
 *
 * Vanilla JS port of the React TransformControls.
 * Renders interactive resize/rotate handles around a selected element.
 *
 * @param {HTMLElement} containerEl - DOM element to append controls into
 * @param {object} element - The design element to control
 * @param {number} zoom - Current zoom level
 * @param {number} panX - Current pan X offset (px)
 * @param {number} panY - Current pan Y offset (px)
 * @param {{ x: number, y: number }} containerOffset - Label position in mm
 * @param {function} onUpdate - Callback with Partial<DesignElement> updates
 * @returns {function} Cleanup function
 */

import { mmToPx, SCREEN_DPI } from '../../lib/dimensions.js';

const DPI = SCREEN_DPI;

function pxToMm(px) {
    return (px * 25.4) / DPI;
}

/**
 * Create transform controls for a single element.
 */
export function createTransformControls(containerEl, element, zoom, panX, panY, containerOffset, onUpdate) {
    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    let isDragging = false;
    /** @type {'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'rotate'|null} */
    let dragType = null;
    let startPos = { x: 0, y: 0 };
    let startTransform = { ...element.transform };

    // ------------------------------------------------------------------
    // Compute screen-space bounding box
    // ------------------------------------------------------------------

    const x = mmToPx(containerOffset.x + element.transform.x, DPI) * zoom + panX;
    const y = mmToPx(containerOffset.y + element.transform.y, DPI) * zoom + panY;
    const width = mmToPx(element.transform.width, DPI) * zoom;
    const height = mmToPx(element.transform.height, DPI) * zoom;
    const rotation = element.transform.rotation;

    // ------------------------------------------------------------------
    // Create overlay DOM
    // ------------------------------------------------------------------

    const root = document.createElement('div');
    root.style.cssText = `
        position:absolute;
        left:${x}px;
        top:${y}px;
        width:${width}px;
        height:${height}px;
        transform:rotate(${rotation}deg);
        transform-origin:center center;
        pointer-events:none;
        z-index:9999;
    `;

    // Selection border
    const border = document.createElement('div');
    border.style.cssText = `
        position:absolute;
        top:-2px; left:-2px; right:-2px; bottom:-2px;
        border:2px solid #2563eb;
        pointer-events:none;
    `;
    root.appendChild(border);

    // ------------------------------------------------------------------
    // Handle positions and cursor mappings
    // ------------------------------------------------------------------

    const handleDefs = [
        { type: 'nw', cursor: 'nw-resize', x: -5, y: -5 },
        { type: 'n',  cursor: 'n-resize',  x: width / 2 - 5, y: -5 },
        { type: 'ne', cursor: 'ne-resize', x: width - 5, y: -5 },
        { type: 'e',  cursor: 'e-resize',  x: width - 5, y: height / 2 - 5 },
        { type: 'se', cursor: 'se-resize', x: width - 5, y: height - 5 },
        { type: 's',  cursor: 's-resize',  x: width / 2 - 5, y: height - 5 },
        { type: 'sw', cursor: 'sw-resize', x: -5, y: height - 5 },
        { type: 'w',  cursor: 'w-resize',  x: -5, y: height / 2 - 5 },
    ];

    const handles = [];
    for (const def of handleDefs) {
        const h = document.createElement('div');
        h.style.cssText = `
            position:absolute;
            left:${def.x}px;
            top:${def.y}px;
            width:10px;
            height:10px;
            background:#fff;
            border:2px solid #2563eb;
            border-radius:2px;
            cursor:${def.cursor};
            pointer-events:auto;
            box-sizing:border-box;
        `;
        h.dataset.handle = def.type;
        root.appendChild(h);
        handles.push({ el: h, type: def.type });
    }

    // Rotate handle (above the element)
    const rotateEl = document.createElement('div');
    rotateEl.style.cssText = `
        position:absolute;
        left:${width / 2 - 7}px;
        top:-30px;
        width:14px;
        height:14px;
        background:#2563eb;
        border:2px solid #fff;
        border-radius:50%;
        cursor:grab;
        pointer-events:auto;
    `;
    rotateEl.dataset.handle = 'rotate';

    // Rotate handle connector line
    const rotateLine = document.createElement('div');
    rotateLine.style.cssText = `
        position:absolute;
        left:${width / 2 - 0.5}px;
        top:-20px;
        width:1px;
        height:20px;
        background:#2563eb;
        pointer-events:none;
    `;
    root.appendChild(rotateLine);
    root.appendChild(rotateEl);

    containerEl.appendChild(root);

    // ------------------------------------------------------------------
    // Mouse interaction
    // ------------------------------------------------------------------

    function onMouseDown(e, type) {
        e.stopPropagation();
        e.preventDefault();
        isDragging = true;
        dragType = type;
        startPos = { x: e.clientX, y: e.clientY };
        startTransform = { ...element.transform };
    }

    // Attach listeners to handles
    for (const handle of handles) {
        handle.el.addEventListener('mousedown', (e) => onMouseDown(e, handle.type));
    }
    rotateEl.addEventListener('mousedown', (e) => onMouseDown(e, 'rotate'));

    function onMouseMove(e) {
        if (!isDragging || !dragType) return;

        const deltaX = (e.clientX - startPos.x) / zoom;
        const deltaY = (e.clientY - startPos.y) / zoom;

        // Convert pixel deltas to mm
        const dxMmScreen = pxToMm(deltaX);
        const dyMmScreen = pxToMm(deltaY);

        // Project onto element's local coordinate system
        const angleRad = (rotation * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        const dxMm = dxMmScreen * cos + dyMmScreen * sin;
        const dyMm = -dxMmScreen * sin + dyMmScreen * cos;

        const newTransform = { ...startTransform };

        if (dragType === 'rotate') {
            // Rotation: compute angle relative to element center in screen space
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            const startAngle = Math.atan2(startPos.y - centerY, startPos.x - centerX);

            let angleDiff = (currentAngle - startAngle) * (180 / Math.PI);
            let newRotation = (startTransform.rotation + angleDiff) % 360;

            // Snap to 15° when Shift is held
            if (e.shiftKey) {
                newRotation = Math.round(newRotation / 15) * 15;
            }

            // Keep in 0–360 range
            if (newRotation < 0) newRotation += 360;
            if (newRotation >= 360) newRotation -= 360;

            newTransform.rotation = Math.round(newRotation);
        } else {
            // Resize
            let dW = 0, dH = 0, dXLocal = 0, dYLocal = 0;

            switch (dragType) {
                case 'e':  dW = dxMm; break;
                case 'w':  dW = -dxMm; dXLocal = dxMm; break;
                case 's':  dH = dyMm; break;
                case 'n':  dH = -dyMm; dYLocal = dyMm; break;
                case 'se': dW = dxMm; dH = dyMm; break;
                case 'sw': dW = -dxMm; dH = dyMm; dXLocal = dxMm; break;
                case 'ne': dW = dxMm; dH = -dyMm; dYLocal = dyMm; break;
                case 'nw': dW = -dxMm; dH = -dyMm; dXLocal = dxMm; dYLocal = dyMm; break;
            }

            const isCorner = dragType === 'nw' || dragType === 'ne' || dragType === 'sw' || dragType === 'se';

            if (e.shiftKey && isCorner) {
                // Maintain aspect ratio on corner resize
                const aspectRatio = startTransform.width / startTransform.height;
                const newWidth = Math.max(5, startTransform.width + dW);
                const newHeight = Math.max(5, startTransform.height + dH);

                if (Math.abs(dW) > Math.abs(dH)) {
                    newTransform.width = newWidth;
                    newTransform.height = newWidth / aspectRatio;
                } else {
                    newTransform.height = newHeight;
                    newTransform.width = newHeight * aspectRatio;
                }

                // Recalculate dXLocal / dYLocal for corner handles
                const widthDelta = newTransform.width - startTransform.width;
                const heightDelta = newTransform.height - startTransform.height;

                if (dragType === 'nw') {
                    dXLocal = -widthDelta;
                    dYLocal = -heightDelta;
                } else if (dragType === 'ne') {
                    dXLocal = 0;
                    dYLocal = -heightDelta;
                } else if (dragType === 'sw') {
                    dXLocal = -widthDelta;
                    dYLocal = 0;
                } else if (dragType === 'se') {
                    dXLocal = 0;
                    dYLocal = 0;
                }
            } else {
                newTransform.width = Math.max(5, startTransform.width + dW);
                newTransform.height = Math.max(5, startTransform.height + dH);
            }

            // Rotate local position delta back to world space
            const dXWorld = dXLocal * cos - dYLocal * sin;
            const dYWorld = dXLocal * sin + dYLocal * cos;

            newTransform.x = startTransform.x + dXWorld;
            newTransform.y = startTransform.y + dYWorld;
        }

        onUpdate({ transform: newTransform });
    }

    function onMouseUp() {
        isDragging = false;
        dragType = null;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------

    const cleanup = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (root.parentNode) {
            root.parentNode.removeChild(root);
        }
    };
    cleanup.isDragging = () => isDragging;
    return cleanup;
}
