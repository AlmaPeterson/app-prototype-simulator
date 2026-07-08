/**
 * Inline data-binding placeholder syntax shared by canvas rendering, PDF
 * export, and the missing-reference checker.
 *
 * Supports both {ColumnName} and <ColumnName> — users kept reaching for
 * angle brackets out of habit (mail-merge / templating muscle memory), so
 * both are treated as the same placeholder rather than only documenting
 * the "correct" one.
 *
 * @module variables
 */

/**
 * Global regex matching either form. Capture group 1 is the curly-brace
 * key, group 2 the angle-bracket key — exactly one will be set per match.
 * @type {RegExp}
 */
export const VARIABLE_REGEX = /\{([^{}]+)\}|<([^<>]+)>/g;
