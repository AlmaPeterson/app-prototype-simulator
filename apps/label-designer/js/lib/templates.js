/**
 * Label Template Library
 *
 * Predefined templates for common label formats (Avery and custom)
 */

// ============================================================================
// Standard Sheet Configurations
// ============================================================================

export const SHEET_LETTER_PORTRAIT = {
  pageSize: 'Letter',
  orientation: 'portrait',
  width: 215.9,
  height: 279.4,
  marginTop: 12.7,
  marginRight: 12.7,
  marginBottom: 12.7,
  marginLeft: 12.7,
};

export const SHEET_LETTER_LANDSCAPE = {
  pageSize: 'Letter',
  orientation: 'landscape',
  width: 279.4,
  height: 215.9,
  marginTop: 12.7,
  marginRight: 12.7,
  marginBottom: 12.7,
  marginLeft: 12.7,
};

export const SHEET_A4_PORTRAIT = {
  pageSize: 'A4',
  orientation: 'portrait',
  width: 210,
  height: 297,
  marginTop: 12.7,
  marginRight: 12.7,
  marginBottom: 12.7,
  marginLeft: 12.7,
};

// ============================================================================
// Avery Templates
// ============================================================================

export const AVERY_5160 = {
  id: 'avery-5160',
  name: 'Avery 5160',
  description: 'Address Labels (1" × 2-5/8")',
  rows: 10,
  columns: 3,
  labelWidth: 66.675,
  labelHeight: 25.4,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_5161 = {
  id: 'avery-5161',
  name: 'Avery 5161',
  description: 'Address Labels (1" × 4")',
  rows: 10,
  columns: 2,
  labelWidth: 101.6,
  labelHeight: 25.4,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_5163 = {
  id: 'avery-5163',
  name: 'Avery 5163',
  description: 'Shipping Labels (2" × 4")',
  rows: 5,
  columns: 2,
  labelWidth: 101.6,
  labelHeight: 50.8,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_5164 = {
  id: 'avery-5164',
  name: 'Avery 5164',
  description: 'Shipping Labels (3-1/3" × 4")',
  rows: 3,
  columns: 2,
  labelWidth: 101.6,
  labelHeight: 84.667,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_5167 = {
  id: 'avery-5167',
  name: 'Avery 5167',
  description: 'Return Address Labels (1/2" × 1-3/4")',
  rows: 20,
  columns: 4,
  labelWidth: 44.45,
  labelHeight: 12.7,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_8160 = {
  id: 'avery-8160',
  name: 'Avery 8160',
  description: 'Address Labels (1" × 2-5/8") - Same as 5160',
  rows: 10,
  columns: 3,
  labelWidth: 66.675,
  labelHeight: 25.4,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_8163 = {
  id: 'avery-8163',
  name: 'Avery 8163',
  description: 'Shipping Labels (2" × 4") - Same as 5163',
  rows: 5,
  columns: 2,
  labelWidth: 101.6,
  labelHeight: 50.8,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

export const AVERY_8460 = {
  id: 'avery-8460',
  name: 'Avery 8460',
  description: 'Address Labels (1" × 2-5/8") - Inkjet',
  rows: 10,
  columns: 3,
  labelWidth: 66.675,
  labelHeight: 25.4,
  horizontalSpacing: 3.175,
  verticalSpacing: 0,
  offsetTop: 12.7,
  offsetLeft: 4.7625,
  sheetConfig: SHEET_LETTER_PORTRAIT,
};

// ============================================================================
// Template Registry
// ============================================================================

export const PREDEFINED_TEMPLATES = [
  AVERY_5160,
  AVERY_5161,
  AVERY_5163,
  AVERY_5164,
  AVERY_5167,
  AVERY_8160,
  AVERY_8163,
  AVERY_8460,
];

export const TEMPLATE_MAP = new Map(
  PREDEFINED_TEMPLATES.map((t) => [t.id, t])
);

// ============================================================================
// Template Utilities
// ============================================================================

export function getTemplate(id) {
  return TEMPLATE_MAP.get(id);
}

export function getAllTemplates() {
  return PREDEFINED_TEMPLATES;
}

export function searchTemplates(query) {
  const lowerQuery = query.toLowerCase();
  return PREDEFINED_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      (t.description && t.description.toLowerCase().includes(lowerQuery))
  );
}

export function createCustomTemplate(
  name,
  rows,
  columns,
  labelWidth,
  labelHeight,
  horizontalSpacing = 0,
  verticalSpacing = 0,
  sheetConfig = SHEET_LETTER_PORTRAIT
) {
  return {
    id: `custom-${Date.now()}`,
    name,
    description: 'Custom template',
    rows,
    columns,
    labelWidth,
    labelHeight,
    horizontalSpacing,
    verticalSpacing,
    offsetTop: sheetConfig.marginTop,
    offsetLeft: sheetConfig.marginLeft,
    sheetConfig,
  };
}

export function validateTemplate(template) {
  const errors = [];

  const totalWidth =
    template.offsetLeft +
    template.columns * template.labelWidth +
    (template.columns - 1) * template.horizontalSpacing;

  const totalHeight =
    template.offsetTop +
    template.rows * template.labelHeight +
    (template.rows - 1) * template.verticalSpacing;

  const printableWidth =
    template.sheetConfig.width -
    template.sheetConfig.marginLeft -
    template.sheetConfig.marginRight;

  const printableHeight =
    template.sheetConfig.height -
    template.sheetConfig.marginTop -
    template.sheetConfig.marginBottom;

  if (totalWidth > printableWidth) {
    errors.push(
      `Template width (${totalWidth.toFixed(1)}mm) exceeds printable width (${printableWidth.toFixed(1)}mm)`
    );
  }

  if (totalHeight > printableHeight) {
    errors.push(
      `Template height (${totalHeight.toFixed(1)}mm) exceeds printable height (${printableHeight.toFixed(1)}mm)`
    );
  }

  if (template.labelWidth <= 0 || template.labelHeight <= 0) {
    errors.push('Label dimensions must be positive');
  }

  if (template.rows <= 0 || template.columns <= 0) {
    errors.push('Rows and columns must be positive');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Grid Math
// ============================================================================

export function getLabelPosition(template, labelIndex) {
  const totalLabels = template.rows * template.columns;

  if (labelIndex < 0 || labelIndex >= totalLabels) {
    return null;
  }

  const row = Math.floor(labelIndex / template.columns);
  const col = labelIndex % template.columns;

  const x =
    template.offsetLeft +
    col * (template.labelWidth + template.horizontalSpacing);

  const y =
    template.offsetTop +
    row * (template.labelHeight + template.verticalSpacing);

  return { x, y, row, col };
}

export function getTotalLabels(template) {
  return template.rows * template.columns;
}

export function hasAdjacentLabel(template, labelIndex, side) {
  const position = getLabelPosition(template, labelIndex);
  if (!position) return false;

  const { row, col } = position;

  switch (side) {
    case 'left':
      return col > 0;
    case 'right':
      return col < template.columns - 1;
    case 'top':
      return row > 0;
    case 'bottom':
      return row < template.rows - 1;
    default:
      return false;
  }
}

// ============================================================================
// Smart Clipping
// ============================================================================

export function getLabelClipRect(template, labelIndex) {
  const position = getLabelPosition(template, labelIndex);
  if (!position) return null;

  const hasLeft = hasAdjacentLabel(template, labelIndex, 'left');
  const hasRight = hasAdjacentLabel(template, labelIndex, 'right');
  const hasTop = hasAdjacentLabel(template, labelIndex, 'top');
  const hasBottom = hasAdjacentLabel(template, labelIndex, 'bottom');

  if (!hasLeft && !hasRight && !hasTop && !hasBottom) {
    return null;
  }

  const sheetWidth = template.sheetConfig.width;
  const sheetHeight = template.sheetConfig.height;

  const overflowExtension = 1000;

  const labelLeft = position.x;
  const clipX = hasLeft ? labelLeft : Math.max(0, labelLeft - overflowExtension);

  const labelTop = position.y;
  const clipY = hasTop ? labelTop : Math.max(0, labelTop - overflowExtension);

  const labelRight = labelLeft + template.labelWidth;
  const clipRight = hasRight ? labelRight : sheetWidth + overflowExtension;

  const labelBottom = labelTop + template.labelHeight;
  const clipBottom = hasBottom ? labelBottom : sheetHeight + overflowExtension;

  const clipWidth = clipRight - clipX;
  const clipHeight = clipBottom - clipY;

  return {
    x: clipX,
    y: clipY,
    width: clipWidth,
    height: clipHeight,
  };
}
