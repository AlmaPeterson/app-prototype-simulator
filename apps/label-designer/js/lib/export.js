/**
 * PDF Export Utilities
 *
 * Generates PDF labels using jsPDF and canvas rendering
 */

import { PRINT_DPI } from './dimensions.js';
import { getLabelPosition, getLabelClipRect } from './templates.js';
import { getAllAssets, getAssetDataUrl, initializeAssets } from './assets.js';
import { getEffectiveElements } from './masterOverride.js';
import { VARIABLE_REGEX } from './variables.js';
import { getQRCodeToDataURL } from './qrcode-loader.js';

// Dynamic script loading cache
let jsPDFLoaded = false;

/**
 * Dynamically load a script from URL
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Ensure jsPDF is loaded from CDN
 */
async function ensureJsPDF() {
  if (jsPDFLoaded && window.jspdf) return;
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
  jsPDFLoaded = true;
  if (!window.jspdf) {
    throw new Error('jsPDF failed to load');
  }
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Generate a bulk PDF with labels
 * @param {Object} options
 * @param {Object} options.template - LabelTemplate
 * @param {Object} options.masterLabel - MasterLabel
 * @param {Array} options.rows - DataRow[]
 * @param {Map} options.labelOverrides - Map<number, LabelOverride>
 * @param {string} options.filename - output filename
 * @param {Set} options.selectedRowIds - filter to only selected rows
 * @param {Function} options.onProgress - progress callback
 * @param {Array} options.columns - DataColumn[] for variable substitution
 */
export const generateBulkPDF = async ({
  template,
  masterLabel,
  rows,
  labelOverrides = new Map(),
  filename = 'labels.pdf',
  selectedRowIds,
  onProgress,
  columns = [],
}) => {
  // Load jsPDF dynamically
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;

  // Initialize assets database
  await initializeAssets();

  // 1. Create PDF
  const sheetWidth = template.sheetConfig.width;
  const sheetHeight = template.sheetConfig.height;

  const pdf = new jsPDF({
    orientation: sheetWidth > sheetHeight ? 'l' : 'p',
    unit: 'mm',
    format: [sheetWidth, sheetHeight],
  });

  const labelsPerSheet = template.rows * template.columns;

  // Filter rows if selection is provided
  let effectiveRows = rows;
  if (selectedRowIds && selectedRowIds.size > 0) {
    effectiveRows = rows.filter(row => selectedRowIds.has(row.id));
  }

  const totalLabels = effectiveRows.length;

  // If no rows, print one sheet with master design (template mode)
  if (totalLabels === 0) {
    effectiveRows = [{ id: 'demo' }];
  }

  // Helper canvas for rendering individual labels at high DPI
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context for PDF export. Your browser may not support canvas rendering.');
  }

  // Canvas size needs to match the sheet size at PRINT_DPI
  const scaleFactor = PRINT_DPI / 25.4; // px per mm
  canvas.width = Math.ceil(sheetWidth * scaleFactor);
  canvas.height = Math.ceil(sheetHeight * scaleFactor);

  // Iterate through data
  let currentSheetIndex = 0;

  const totalSheets = Math.ceil(effectiveRows.length / labelsPerSheet);
  let processedLabels = 0;

  // We process sheet by sheet
  for (let i = 0; i < effectiveRows.length; i += labelsPerSheet) {
    if (i > 0) {
      pdf.addPage([sheetWidth, sheetHeight], sheetWidth > sheetHeight ? 'l' : 'p');
    }

    // Clear canvas for new sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw sheet labels
    const sheetRows = effectiveRows.slice(i, i + labelsPerSheet);

    for (let j = 0; j < sheetRows.length; j++) {
      const rowData = sheetRows[j];
      const position = getLabelPosition(template, j);
      if (!position) continue;

      // Calculate absolute label index across all pages
      const absoluteLabelIndex = i + j;

      // Render single label at position
      await renderLabelToContext(ctx, template, masterLabel, rowData, position, scaleFactor, j, absoluteLabelIndex, labelOverrides, columns);

      processedLabels++;
      // Report progress (by labels, not sheets)
      if (onProgress) {
        onProgress(processedLabels, effectiveRows.length);
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Add full sheet canvas to PDF
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, sheetWidth, sheetHeight);
  }

  pdf.save(filename);

  // Final progress update
  if (onProgress) {
    onProgress(effectiveRows.length, effectiveRows.length);
  }
};

// ============================================================================
// Label Rendering
// ============================================================================

const renderLabelToContext = async (
  ctx,
  template,
  masterLabel,
  rowData,
  position,
  scale,
  labelIndex,
  absoluteLabelIndex,
  labelOverrides,
  columns
) => {
  const labelX = position.x * scale;
  const labelY = position.y * scale;
  const labelW = template.labelWidth * scale;
  const labelH = template.labelHeight * scale;

  // Smart clipping: clip only when there's an adjacent label
  ctx.save();

  // Apply smart clipping based on adjacent labels
  const clipRect = getLabelClipRect(template, labelIndex);
  if (clipRect) {
    // Convert clip rect from mm to pixels (already scaled)
    const clipX = clipRect.x * scale;
    const clipY = clipRect.y * scale;
    const clipWidth = clipRect.width * scale;
    const clipHeight = clipRect.height * scale;

    // Set clipping path
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipWidth, clipHeight);
    ctx.clip();
  }

  // Draw background (if any in master, or white default)
  if (masterLabel.backgroundColor) {
    ctx.fillStyle = masterLabel.backgroundColor;
    ctx.fillRect(labelX, labelY, labelW, labelH);
  }

  // Get effective elements with overrides applied
  const override = labelOverrides.get(absoluteLabelIndex);
  const effectiveElements = getEffectiveElements(masterLabel, override);

  // Render elements - IMPORTANT: Sort by zIndex (ascending - lower zIndex renders first/behind)
  const sortedElements = [...effectiveElements].sort((a, b) => a.zIndex - b.zIndex);

  for (const element of sortedElements) {
    if (!element.visible) continue;

    // Transform to label local coords -> canvas coords
    const elX = labelX + (element.transform.x * scale);
    const elY = labelY + (element.transform.y * scale);
    const elW = element.transform.width * scale;
    const elH = element.transform.height * scale;

    ctx.save();

    // Rotation
    if (element.transform.rotation !== 0) {
      ctx.translate(elX + elW / 2, elY + elH / 2);
      ctx.rotate((element.transform.rotation * Math.PI) / 180);
      ctx.translate(-(elX + elW / 2), -(elY + elH / 2));
    }

    switch (element.type) {
      case 'text':
        renderText(ctx, element, elX, elY, elW, elH, rowData, scale, columns);
        break;
      case 'shape':
        renderShape(ctx, element, elX, elY, elW, elH, scale);
        break;
      case 'image':
        // renderImage not implemented in original
        break;
      case 'placeholder':
        await renderPlaceholder(ctx, element, elX, elY, elW, elH, rowData, scale);
        break;
    }

    ctx.restore();
  }

  ctx.restore();
};

// ============================================================================
// Text Rendering
// ============================================================================

const renderText = (
  ctx,
  element,
  x,
  y,
  w,
  h,
  rowData,
  scale,
  columns
) => {
  // Variable substitution
  let content = element.content;
  if (rowData) {
    // Explicit column binding (set via the "Data Bindings" link button in the
    // property panel) takes priority over the row's raw value; falls back to
    // {ColumnName} placeholder substitution for elements without a binding.
    const contentBinding = element.bindings?.find(b => b.property === 'content');
    if (contentBinding && contentBinding.columnId) {
      const boundValue = rowData[contentBinding.columnId];
      content = (boundValue !== undefined && boundValue !== null && boundValue !== '')
        ? String(boundValue)
        : '';
    } else {
      content = content.replace(VARIABLE_REGEX, (match, curlyKey, angleKey) => {
        const cleanKey = (curlyKey ?? angleKey).trim();

        // First, try to find column by name (case-insensitive)
        const column = columns.find(c => c.name.toLowerCase() === cleanKey.toLowerCase());
        if (column) {
          // Use column ID to access row data
          const value = rowData[column.id];
          if (value !== undefined && value !== null && value !== '') {
            return String(value);
          }
        }

        // Fall back to direct key matching for backward compatibility
        const rowKey = Object.keys(rowData).find(k => k.toLowerCase() === cleanKey.toLowerCase());
        if (rowKey && rowData[rowKey] !== undefined && rowData[rowKey] !== null && rowData[rowKey] !== '') {
          return String(rowData[rowKey]);
        }

        // Replace with empty string if not found
        return '';
      });
    }
  }

  ctx.fillStyle = element.color;
  // Scale font size: pt -> px (at 300 DPI)
  // 1 pt = 1/72 inch. pt / 72 * PRINT_DPI = px
  const fontSizePx = (element.fontSize / 72) * PRINT_DPI;

  ctx.font = `${element.fontStyle} ${element.fontWeight} ${fontSizePx}px ${element.fontFamily}`;
  ctx.textBaseline = 'top';

  // Helper function to wrap text to fit within width
  const wrapText = (text, maxWidth) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && currentLine) {
        // Current line is full, start a new line
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  };

  // Split by manual newlines first, then wrap each line
  const manualLines = content.split('\n');
  const allLines = [];

  manualLines.forEach(line => {
    const wrapped = wrapText(line, w);
    allLines.push(...wrapped);
  });

  const lineHeight = fontSizePx * element.lineHeight;

  allLines.forEach((line, index) => {
    let textX = x;
    if (element.textAlign === 'center') {
      ctx.textAlign = 'center';
      textX = x + w / 2;
    } else if (element.textAlign === 'right') {
      ctx.textAlign = 'right';
      textX = x + w;
    } else {
      ctx.textAlign = 'left';
    }
    ctx.fillText(line, textX, y + index * lineHeight);
  });
};

// ============================================================================
// Shape Rendering
// ============================================================================

/**
 * Helper function to draw rounded rectangle
 */
function roundRect(ctx, x, y, width, height, radius) {
  if (radius <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }

  const minRadius = Math.min(width, height) / 2;
  const actualRadius = Math.min(radius, minRadius);

  ctx.beginPath();
  ctx.moveTo(x + actualRadius, y);
  ctx.lineTo(x + width - actualRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + actualRadius);
  ctx.lineTo(x + width, y + height - actualRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - actualRadius, y + height);
  ctx.lineTo(x + actualRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - actualRadius);
  ctx.lineTo(x, y + actualRadius);
  ctx.quadraticCurveTo(x, y, x + actualRadius, y);
  ctx.closePath();
}

const renderShape = (
  ctx,
  element,
  x,
  y,
  w,
  h,
  scale
) => {
  ctx.globalAlpha = element.opacity;

  if (element.shapeType === 'rectangle') {
    ctx.fillStyle = element.fillColor;

    // Handle rounded corners
    const cornerRadius = element.cornerRadius ? element.cornerRadius * scale : 0;

    if (cornerRadius > 0) {
      const strokeWidth = element.strokeWidth * scale;

      // Use native roundRect if available (handles stroke correctly)
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, cornerRadius);

        // Fill
        if (element.fillColor !== 'transparent') {
          ctx.fill();
        }

        // Stroke
        if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
          ctx.strokeStyle = element.strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }
      } else {
        // Custom implementation: use separate paths for fill and stroke
        // Fill path: full size with specified radius
        if (element.fillColor !== 'transparent') {
          roundRect(ctx, x, y, w, h, cornerRadius);
          ctx.fill();
        }

        // Stroke path: offset inward by half stroke width, with adjusted radius
        if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
          const halfStroke = strokeWidth / 2;
          const strokeX = x + halfStroke;
          const strokeY = y + halfStroke;
          const strokeW = w - strokeWidth;
          const strokeH = h - strokeWidth;
          const strokeRadius = Math.max(0, cornerRadius - halfStroke);

          ctx.strokeStyle = element.strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.lineJoin = 'round';
          roundRect(ctx, strokeX, strokeY, strokeW, strokeH, strokeRadius);
          ctx.stroke();
        }
      }
    } else {
      // Regular rectangle
      if (element.fillColor !== 'transparent') ctx.fillRect(x, y, w, h);

      if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
        ctx.strokeStyle = element.strokeColor;
        ctx.lineWidth = element.strokeWidth * scale;
        ctx.strokeRect(x, y, w, h);
      }
    }
  } else if (element.shapeType === 'circle') {
    ctx.beginPath();
    const startAngle = 0;
    const endAngle = 2 * Math.PI;
    const radiusX = w / 2;
    const radiusY = h / 2;
    const centerX = x + radiusX;
    const centerY = y + radiusY;

    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, startAngle, endAngle);

    if (element.fillColor !== 'transparent') {
      ctx.fillStyle = element.fillColor;
      ctx.fill();
    }

    if (element.strokeWidth > 0 && element.strokeColor !== 'transparent') {
      ctx.strokeStyle = element.strokeColor;
      ctx.lineWidth = element.strokeWidth * scale;
      ctx.stroke();
    }
  } else if (element.shapeType === 'line') {
    ctx.strokeStyle = element.strokeColor;
    ctx.lineWidth = element.strokeWidth * scale;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
};

// ============================================================================
// Placeholder Rendering
// ============================================================================

const renderPlaceholder = async (
  ctx,
  element,
  x,
  y,
  w,
  h,
  rowData,
  scale
) => {
  ctx.globalAlpha = element.opacity;

  if (element.placeholderType === 'image') {
    // Determine image name: use data binding if available, otherwise use static imageName
    let imageNameToUse = element.imageName;

    if (element.imageNameBinding && element.imageNameBinding.columnId && rowData) {
      const columnValue = rowData[element.imageNameBinding.columnId];
      if (columnValue !== undefined && columnValue !== null) {
        imageNameToUse = String(columnValue);
      }
    }

    // If no image name, don't render anything
    if (!imageNameToUse || imageNameToUse.trim() === '') {
      ctx.globalAlpha = 1;
      return;
    }

    // Look up image by name
    const assets = await getAllAssets();
    const asset = assets.find(a => a.name === imageNameToUse);

    if (asset) {
      // Load and render the image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = asset.dataUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Calculate image dimensions based on fit mode
      const imgAspect = img.width / img.height;
      const fitMode = element.imageFit || 'fitHorizontal';

      let drawWidth = w;
      let drawHeight = h;
      let drawX = x;
      let drawY = y;

      switch (fitMode) {
        case 'fitVertical':
          // Fit to height, maintain aspect ratio, center horizontally
          drawWidth = h * imgAspect;
          drawHeight = h;
          drawX = x + (w - drawWidth) / 2;
          drawY = y;
          break;
        case 'fitHorizontal':
          // Fit to width, maintain aspect ratio, center vertically (default)
          drawWidth = w;
          drawHeight = w / imgAspect;
          drawX = x;
          drawY = y + (h - drawHeight) / 2;
          break;
        case 'stretch':
          // Fill placeholder exactly, may distort aspect ratio
          drawWidth = w;
          drawHeight = h;
          drawX = x;
          drawY = y;
          break;
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    } else {
      // Asset not found - don't render anything
      ctx.globalAlpha = 1;
      return;
    }
  } else if (element.placeholderType === 'qrCode') {
    // Get QR value from data binding
    let qrValue = element.displayText;

    if (element.qrValueBinding && element.qrValueBinding.columnId && rowData) {
      const columnValue = rowData[element.qrValueBinding.columnId];
      if (columnValue !== undefined && columnValue !== null && columnValue !== '') {
        qrValue = String(columnValue);
      } else {
        // No value in data - don't render QR code
        ctx.globalAlpha = 1;
        return;
      }
    }

    if (qrValue && qrValue.trim() !== '') {
      try {
        // Same library + CDN path as the live canvas preview (qrcode-loader.js)
        const toDataURL = await getQRCodeToDataURL();
        const qrSize = Math.min(w, h);
        const dataUrl = await toDataURL(qrValue, {
          width: qrSize * 2, // Higher resolution for print
          margin: 1,
        });
        const qrImg = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = dataUrl;
        });

        // Center QR code in placeholder
        const qrX = x + (w - qrSize) / 2;
        const qrY = y + (h - qrSize) / 2;
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      } catch (error) {
        console.error('Failed to generate QR code:', error);
        ctx.globalAlpha = 1;
        return;
      }
    } else {
      // No QR value - don't render anything
      ctx.globalAlpha = 1;
      return;
    }
  }

  ctx.globalAlpha = 1;
};
