/**
 * Physical Dimension Conversion Utilities
 *
 * All internal measurements are stored in millimeters (mm).
 * This module handles conversion between mm, inches, and pixels.
 */

// ============================================================================
// Constants
// ============================================================================

export const MM_PER_INCH = 25.4;
export const SCREEN_DPI = 96;
export const PRINT_DPI = 300;

export const PAGE_SIZES = {
  Letter: { width: 215.9, height: 279.4 },
  A4: { width: 210, height: 297 },
  Legal: { width: 215.9, height: 355.6 },
};

// ============================================================================
// Conversion Functions
// ============================================================================

export function mmToInch(mm) {
  return mm / MM_PER_INCH;
}

export function inchToMm(inch) {
  return inch * MM_PER_INCH;
}

export function mmToPx(mm, dpi = SCREEN_DPI) {
  return (mm / MM_PER_INCH) * dpi;
}

export function pxToMm(px, dpi = SCREEN_DPI) {
  return (px / dpi) * MM_PER_INCH;
}

export function ptToMm(pt) {
  return (pt / 72) * MM_PER_INCH;
}

export function mmToPt(mm) {
  return (mm / MM_PER_INCH) * 72;
}

export function toMm(dimension) {
  switch (dimension.unit) {
    case 'mm':
      return dimension.value;
    case 'inch':
      return inchToMm(dimension.value);
    case 'px':
      return pxToMm(dimension.value, SCREEN_DPI);
    default:
      return dimension.value;
  }
}

export function fromMm(mm, unit, dpi = SCREEN_DPI) {
  switch (unit) {
    case 'mm':
      return mm;
    case 'inch':
      return mmToInch(mm);
    case 'px':
      return mmToPx(mm, dpi);
    default:
      return mm;
  }
}

// ============================================================================
// Coordinate System Utilities
// ============================================================================

export function canvasToPhysical(canvasX, canvasY, zoom, panX, panY, dpi = SCREEN_DPI) {
  const x = (canvasX - panX) / zoom;
  const y = (canvasY - panY) / zoom;
  return {
    x: pxToMm(x, dpi),
    y: pxToMm(y, dpi),
  };
}

export function physicalToCanvas(physicalX, physicalY, zoom, panX, panY, dpi = SCREEN_DPI) {
  const x = mmToPx(physicalX, dpi);
  const y = mmToPx(physicalY, dpi);
  return {
    x: x * zoom + panX,
    y: y * zoom + panY,
  };
}

export function getScaleFactor(zoom, dpi = SCREEN_DPI) {
  return zoom * (dpi / SCREEN_DPI);
}

// ============================================================================
// DPI Quality Checks
// ============================================================================

export function calculateImageDPI(originalWidthPx, originalHeightPx, displayWidthMm, displayHeightMm) {
  const displayWidthInch = mmToInch(displayWidthMm);
  const displayHeightInch = mmToInch(displayHeightMm);

  const widthDPI = originalWidthPx / displayWidthInch;
  const heightDPI = originalHeightPx / displayHeightInch;

  const minDPI = Math.min(widthDPI, heightDPI);

  return {
    widthDPI,
    heightDPI,
    sufficient: minDPI >= 200,
  };
}

export function getImageQualityWarning(originalWidthPx, originalHeightPx, displayWidthMm, displayHeightMm) {
  const { widthDPI, heightDPI, sufficient } = calculateImageDPI(
    originalWidthPx,
    originalHeightPx,
    displayWidthMm,
    displayHeightMm
  );

  if (sufficient) {
    return null;
  }

  const minDPI = Math.min(widthDPI, heightDPI);

  if (minDPI < 150) {
    return `Low quality: ${Math.round(minDPI)} DPI (recommended: 200+ DPI)`;
  } else if (minDPI < 200) {
    return `Moderate quality: ${Math.round(minDPI)} DPI (recommended: 200+ DPI)`;
  }

  return null;
}

// ============================================================================
// Rounding and Precision
// ============================================================================

export function roundTo(value, decimals = 2) {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

export function snapToGrid(value, gridSize) {
  return Math.round(value / gridSize) * gridSize;
}
