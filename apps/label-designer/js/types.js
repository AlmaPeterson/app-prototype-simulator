// ============================================================================
// Types and Constants for Label Designer
// ============================================================================
// Convert all TypeScript interfaces to JSDoc comments and define
// default values / factory functions for vanilla JS usage.

// ============================================================================
// Enums / Constant Objects
// ============================================================================

/**
 * @readonly
 * @enum {string}
 */
export const ElementType = Object.freeze({
    TEXT: 'text',
    IMAGE: 'image',
    SHAPE: 'shape',
    PLACEHOLDER: 'placeholder',
});

/**
 * @readonly
 * @enum {string}
 */
export const ShapeType = Object.freeze({
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle',
    LINE: 'line',
});

/**
 * @readonly
 * @enum {string}
 */
export const TextAlign = Object.freeze({
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
    JUSTIFY: 'justify',
});

/**
 * @readonly
 * @enum {string}
 */
export const FontWeight = Object.freeze({
    NORMAL: 'normal',
    BOLD: 'bold',
});

/**
 * @readonly
 * @enum {string}
 */
export const FontStyle = Object.freeze({
    NORMAL: 'normal',
    ITALIC: 'italic',
});

/**
 * @readonly
 * @enum {string}
 */
export const Unit = Object.freeze({
    MM: 'mm',
    INCH: 'inch',
    PX: 'px',
});

/**
 * @readonly
 * @enum {string}
 */
export const PageSize = Object.freeze({
    LETTER: 'Letter',
    A4: 'A4',
    LEGAL: 'Legal',
    CUSTOM: 'Custom',
});

/**
 * @readonly
 * @enum {string}
 */
export const Orientation = Object.freeze({
    PORTRAIT: 'portrait',
    LANDSCAPE: 'landscape',
});

/**
 * @readonly
 * @enum {string}
 */
export const ViewMode = Object.freeze({
    TEMPLATE: 'TEMPLATE',
    PREVIEW: 'PREVIEW',
});

/**
 * @readonly
 * @enum {string}
 */
export const ColumnType = Object.freeze({
    TEXT: 'text',
    IMAGE: 'image',
    QR: 'qr',
    BARCODE: 'barcode',
    NUMBER: 'number',
});

// ============================================================================
// Standard Sheet Configurations
// ============================================================================

/** @type {SheetConfig} */
export const SHEET_LETTER_PORTRAIT = Object.freeze({
    pageSize: PageSize.LETTER,
    orientation: Orientation.PORTRAIT,
    width: 215.9,
    height: 279.4,
    marginTop: 12.7,
    marginRight: 12.7,
    marginBottom: 12.7,
    marginLeft: 12.7,
});

/** @type {SheetConfig} */
export const SHEET_LETTER_LANDSCAPE = Object.freeze({
    pageSize: PageSize.LETTER,
    orientation: Orientation.LANDSCAPE,
    width: 279.4,
    height: 215.9,
    marginTop: 12.7,
    marginRight: 12.7,
    marginBottom: 12.7,
    marginLeft: 12.7,
});

/** @type {SheetConfig} */
export const SHEET_A4_PORTRAIT = Object.freeze({
    pageSize: PageSize.A4,
    orientation: Orientation.PORTRAIT,
    width: 210,
    height: 297,
    marginTop: 12.7,
    marginRight: 12.7,
    marginBottom: 12.7,
    marginLeft: 12.7,
});

// ============================================================================
// Physical Dimension Types
// ============================================================================

/**
 * @typedef {Object} PhysicalDimension
 * @property {number} value
 * @property {string} unit - One of Unit values ('mm' | 'inch' | 'px')
 */

// ============================================================================
// Sheet Configuration
// ============================================================================

/**
 * @typedef {Object} SheetConfig
 * @property {string} pageSize - One of PageSize values
 * @property {string} orientation - One of Orientation values ('portrait' | 'landscape')
 * @property {number} width - in mm
 * @property {number} height - in mm
 * @property {number} marginTop - in mm
 * @property {number} marginRight - in mm
 * @property {number} marginBottom - in mm
 * @property {number} marginLeft - in mm
 */

// ============================================================================
// Label Template
// ============================================================================

/**
 * @typedef {Object} LabelTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {number} rows
 * @property {number} columns
 * @property {number} labelWidth - in mm
 * @property {number} labelHeight - in mm
 * @property {number} horizontalSpacing - in mm
 * @property {number} verticalSpacing - in mm
 * @property {number} offsetTop - in mm
 * @property {number} offsetLeft - in mm
 * @property {SheetConfig} sheetConfig
 */

// ============================================================================
// Design Elements
// ============================================================================

/**
 * @typedef {Object} Transform
 * @property {number} x - in mm
 * @property {number} y - in mm
 * @property {number} width - in mm
 * @property {number} height - in mm
 * @property {number} rotation - in degrees
 */

/**
 * @typedef {Object} ElementBinding
 * @property {string} property - e.g. 'content', 'color'
 * @property {string|null} columnId
 */

/**
 * @typedef {Object} BaseElement
 * @property {string} id
 * @property {string} type - One of ElementType values
 * @property {Transform} transform
 * @property {number} zIndex
 * @property {boolean} visible
 * @property {boolean} locked
 */

/**
 * @typedef {Object} TextElement
 * @property {string} id
 * @property {'text'} type
 * @property {Transform} transform
 * @property {number} zIndex
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {string} content
 * @property {string} fontFamily
 * @property {number} fontSize - in pt
 * @property {string} fontWeight
 * @property {string} fontStyle
 * @property {string} textAlign
 * @property {string} color - hex color
 * @property {number} lineHeight - multiplier
 * @property {number} letterSpacing - in em
 * @property {ElementBinding[]} [bindings]
 */

/**
 * @typedef {Object} ImageElement
 * @property {string} id
 * @property {'image'} type
 * @property {Transform} transform
 * @property {number} zIndex
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {string} src - data URL or URL
 * @property {number} originalWidth - in px
 * @property {number} originalHeight - in px
 * @property {number} cropX - 0-1
 * @property {number} cropY - 0-1
 * @property {number} cropWidth - 0-1
 * @property {number} cropHeight - 0-1
 * @property {boolean} maintainAspectRatio
 */

/**
 * @typedef {Object} ShapeElement
 * @property {string} id
 * @property {'shape'} type
 * @property {Transform} transform
 * @property {number} zIndex
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {string} shapeType - One of ShapeType values
 * @property {string} fillColor - hex color
 * @property {string} strokeColor - hex color
 * @property {number} strokeWidth - in mm
 * @property {number} [cornerRadius] - in mm, for rectangles
 * @property {number} opacity - 0-1
 */

/**
 * @typedef {Object} PlaceholderElement
 * @property {string} id
 * @property {'placeholder'} type
 * @property {Transform} transform
 * @property {number} zIndex
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {string} placeholderType - 'image' | 'qrCode'
 * @property {string} [imageName]
 * @property {ElementBinding} [imageNameBinding]
 * @property {string} [imageFit] - 'fitVertical' | 'fitHorizontal' | 'stretch'
 * @property {ElementBinding} [qrValueBinding]
 * @property {string} displayText
 * @property {string} fillColor
 * @property {string} strokeColor
 * @property {number} strokeWidth
 * @property {number} opacity
 */

/**
 * @typedef {TextElement|ImageElement|ShapeElement|PlaceholderElement} DesignElement
 */

// ============================================================================
// Master Label & Overrides
// ============================================================================

/**
 * @typedef {Object} MasterLabel
 * @property {DesignElement[]} elements
 * @property {string} [backgroundColor]
 */

/**
 * @typedef {Object} ElementOverride
 * @property {string} elementId
 * @property {Partial<DesignElement>} overrides
 */

/**
 * @typedef {Object} LabelOverride
 * @property {number} labelIndex - row * columns + col
 * @property {ElementOverride[]} elementOverrides
 * @property {string[]} hiddenElementIds
 * @property {DesignElement[]} additionalElements
 */

// ============================================================================
// Data Store Types
// ============================================================================

/**
 * @typedef {Object} DataColumn
 * @property {string} id
 * @property {string} name
 * @property {string} type - One of ColumnType values
 * @property {boolean} required
 */

/**
 * @typedef {string|number|null} DataValue
 */

/**
 * @typedef {Object} DataRow
 * @property {string} id
 * @property {Object<string, DataValue|undefined>} [columnId]
 */

// ============================================================================
// Utility Types
// ============================================================================

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} SnapGuide
 * @property {string} type - 'vertical' | 'horizontal'
 * @property {number} position - in mm
 * @property {string} [label]
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a default Transform object.
 * @param {number} [x=0]
 * @param {number} [y=0]
 * @param {number} [width=50]
 * @param {number} [height=10]
 * @returns {Transform}
 */
export function createTransform(x = 0, y = 0, width = 50, height = 10) {
    return { x, y, width, height, rotation: 0 };
}

/**
 * Create a default empty MasterLabel.
 * @returns {MasterLabel}
 */
export function createEmptyMasterLabel() {
    return {
        elements: [],
        backgroundColor: '#ffffff',
    };
}

/**
 * Create a default empty LabelOverride.
 * @param {number} labelIndex
 * @returns {LabelOverride}
 */
export function createEmptyLabelOverride(labelIndex) {
    return {
        labelIndex,
        elementOverrides: [],
        hiddenElementIds: [],
        additionalElements: [],
    };
}

/**
 * Create a default SheetConfig.
 * @param {Partial<SheetConfig>} [overrides]
 * @returns {SheetConfig}
 */
export function createSheetConfig(overrides = {}) {
    return {
        ...SHEET_LETTER_PORTRAIT,
        ...overrides,
    };
}

/**
 * Create a default LabelTemplate.
 * @param {Partial<LabelTemplate>} [overrides]
 * @returns {LabelTemplate}
 */
export function createLabelTemplate(overrides = {}) {
    return {
        id: `custom-${Date.now()}`,
        name: 'Custom Template',
        description: 'Custom template',
        rows: 1,
        columns: 1,
        labelWidth: 101.6,
        labelHeight: 50.8,
        horizontalSpacing: 0,
        verticalSpacing: 0,
        offsetTop: 12.7,
        offsetLeft: 4.7625,
        sheetConfig: SHEET_LETTER_PORTRAIT,
        ...overrides,
    };
}

/**
 * Create a default DataColumn.
 * @param {Partial<DataColumn>} [overrides]
 * @returns {DataColumn}
 */
export function createDataColumn(overrides = {}) {
    return {
        id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'New Column',
        type: ColumnType.TEXT,
        required: false,
        ...overrides,
    };
}

/**
 * Create a default DataRow.
 * @param {string} [id]
 * @returns {DataRow}
 */
export function createDataRow(id) {
    return {
        id: id || `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
}
