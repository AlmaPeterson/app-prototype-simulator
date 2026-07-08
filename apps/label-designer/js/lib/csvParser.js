/**
 * CSV Parser
 *
 * Handles CSV parsing with support for quoted fields, escaped commas, and edge cases
 */

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Remove UTF-8 BOM (Byte Order Mark) from text
 */
export function removeBOM(text) {
  if (text.charCodeAt(0) === 0xFEFF) {
    return text.slice(1);
  }
  return text;
}

/**
 * Detect CSV delimiter by analyzing the first few lines
 * Returns comma, tab, or semicolon based on most common occurrence
 */
export function detectDelimiter(text, sampleLines = 5) {
  const lines = text.split(/\r?\n/).slice(0, sampleLines).filter(l => l.trim());
  if (lines.length === 0) return ',';

  const delimiters = [',', '\t', ';'];
  const counts = { ',': 0, '\t': 0, ';': 0 };

  for (const line of lines) {
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && delimiters.includes(char)) {
        counts[char]++;
      }
    }
  }

  // Return delimiter with highest count, default to comma
  const maxCount = Math.max(...Object.values(counts));
  if (maxCount === 0) return ',';

  for (const delim of delimiters) {
    if (counts[delim] === maxCount) {
      return delim;
    }
  }

  return ',';
}

/**
 * Sanitize column name: remove invalid characters, ensure it's not empty
 */
export function sanitizeColumnName(name, existingNames = new Set()) {
  // Trim and remove invalid characters (keep alphanumeric, spaces, underscores, hyphens)
  let sanitized = name.trim().replace(/[^\w\s-]/g, '_');

  // Replace multiple spaces/underscores with single underscore
  sanitized = sanitized.replace(/[\s_]+/g, '_');

  // Remove leading/trailing underscores and hyphens
  sanitized = sanitized.replace(/^[_-]+|[_-]+$/g, '');

  // Ensure not empty
  if (!sanitized) {
    sanitized = 'Column';
  }

  // Ensure uniqueness
  let finalName = sanitized;
  let counter = 1;
  while (existingNames.has(finalName)) {
    finalName = `${sanitized} (${counter})`;
    counter++;
  }

  return finalName;
}

/**
 * Remove surrounding quotes from a field value while preserving escaped quotes inside
 */
function removeQuotes(field) {
  const trimmed = field.trim();

  // Check if field is quoted (starts and ends with quote)
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
    // Remove surrounding quotes
    const unquoted = trimmed.slice(1, -1);
    // Replace escaped quotes (double quotes) with single quotes
    return unquoted.replace(/""/g, '"');
  }

  return trimmed;
}

/**
 * Validate row data against column types
 */
export function validateRowData(row, headers, columns) {
  const errors = [];
  const warnings = [];

  // Find column by header name
  const findColumn = (header) => {
    return columns.find(col =>
      col.name.toLowerCase() === header.toLowerCase() ||
      col.id.toLowerCase() === header.toLowerCase()
    );
  };

  headers.forEach((header, index) => {
    const column = findColumn(header);
    if (!column) return; // Skip if column not found

    const value = row[index];
    if (value === undefined || value === null) {
      if (column.type === 'number' && value === '') {
        warnings.push(`Column "${header}": Empty value in number column`);
      }
      return;
    }

    const trimmedValue = value.trim();
    if (trimmedValue === '') return;

    // Type validation
    if (column.type === 'number') {
      const numValue = Number(trimmedValue);
      if (isNaN(numValue)) {
        warnings.push(`Column "${header}": Value "${trimmedValue}" cannot be converted to number`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse CSV string with proper handling of quoted fields and escaped characters
 * Supports BOM removal, delimiter detection, quote removal, and header validation
 */
export function parseCSV(csvText, options) {
  const errors = [];
  const lines = [];
  const rows = [];

  // Check file size limit (default 10MB)
  const maxSize = (options && options.maxFileSize) || 10 * 1024 * 1024;
  if (csvText.length > maxSize) {
    errors.push(`File size (${(csvText.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxSize / 1024 / 1024}MB)`);
    return { headers: [], rows: [], errors };
  }

  // Remove BOM
  let processedText = removeBOM(csvText);

  // Detect delimiter if not provided
  const delimiter = (options && options.delimiter) || detectDelimiter(processedText);

  // Split by newlines, preserving quoted newlines
  // A newline always means a new row, unless it's inside a properly quoted field
  let currentLine = '';
  let inQuotes = false;
  let fieldStart = true; // Track if we're at the start of a field

  for (let i = 0; i < processedText.length; i++) {
    const char = processedText[i];
    const nextChar = processedText[i + 1];
    const prevChar = i > 0 ? processedText[i - 1] : null;

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote (double quote) inside quoted field
        currentLine += '"';
        i++; // Skip next quote
        fieldStart = false;
      } else if (inQuotes && (nextChar === delimiter || nextChar === '\n' || nextChar === '\r' || nextChar === undefined)) {
        // End of quoted field - quote followed by delimiter, newline, or end
        inQuotes = false;
        fieldStart = false;
        // Don't add quote to currentLine
      } else if (!inQuotes && fieldStart) {
        // Start of quoted field - quote at start of field (beginning of line or after delimiter)
        inQuotes = true;
        fieldStart = false;
        // Don't add quote to currentLine
      } else {
        // Quote in middle of unquoted field - treat as regular character
        currentLine += char;
        fieldStart = false;
      }
    } else if (char === delimiter && !inQuotes) {
      // Field separator - next character starts a new field
      currentLine += char;
      fieldStart = true;
    } else if (char === '\n' || char === '\r') {
      if (inQuotes) {
        // Newline inside quoted field - keep it as part of the field content
        currentLine += char;
      } else {
        // End of row - newline always means new row when not in quotes
        if (currentLine.trim() || lines.length === 0) {
          lines.push(currentLine);
        }
        currentLine = '';
        fieldStart = true; // Next line starts a new field
        // Skip \r\n combination
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      }
    } else {
      currentLine += char;
      fieldStart = false;
    }
  }

  // Add last line if not empty
  if (currentLine.trim() || lines.length === 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    errors.push('No data found in CSV');
    return { headers: [], rows: [], errors };
  }

  // Parse headers
  const headerResult = parseCSVLine(lines[0], 0, delimiter);
  if (headerResult.errors.length > 0) {
    errors.push(...headerResult.errors.map(e => `Header row (line 1): ${e}`));
  }

  // Remove quotes from headers and validate
  let headers = headerResult.fields.map(f => removeQuotes(f));

  // Validate headers
  const headerValidation = validateHeaders(headers);
  if (headerValidation.errors.length > 0) {
    errors.push(...headerValidation.errors);
  }
  if (headerValidation.warnings.length > 0) {
    errors.push(...headerValidation.warnings.map(w => `Warning: ${w}`));
  }

  // Apply header fixes (sanitize empty/duplicate names)
  headers = fixHeaders(headers);

  if (headers.length === 0) {
    errors.push('No valid headers found after processing');
    return { headers: [], rows: [], errors };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const lineResult = parseCSVLine(lines[i], i, delimiter);
    if (lineResult.errors.length > 0) {
      errors.push(...lineResult.errors.map(e => `Row ${i + 1} (line ${i + 2}): ${e}`));
    }

    // Remove quotes from fields
    const cleanedFields = lineResult.fields.map(f => removeQuotes(f));

    // Pad or truncate to match header count
    const row = headers.map((_, index) =>
      cleanedFields[index] || ''
    );
    rows.push(row);
  }

  return { headers, rows, errors };
}

/**
 * Validate CSV headers for empty names and duplicates
 */
function validateHeaders(headers) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const seenLower = new Set();

  headers.forEach((header, index) => {
    const trimmed = header.trim();

    if (!trimmed) {
      errors.push(`Header at column ${index + 1} is empty`);
    } else {
      const lower = trimmed.toLowerCase();
      if (seenLower.has(lower)) {
        warnings.push(`Duplicate header "${trimmed}" at column ${index + 1}`);
      } else {
        seen.add(trimmed);
        seenLower.add(lower);
      }
    }
  });

  return { errors, warnings };
}

/**
 * Fix headers by sanitizing empty and duplicate names
 */
function fixHeaders(headers) {
  const fixed = [];
  const seen = new Set();
  const seenLower = new Set();

  headers.forEach((header, index) => {
    let fixedHeader = header.trim();

    if (!fixedHeader) {
      fixedHeader = `Column_${index + 1}`;
    }

    // Ensure uniqueness
    let finalHeader = fixedHeader;
    let counter = 1;
    const lower = finalHeader.toLowerCase();
    while (seenLower.has(lower) || (counter > 1 && seenLower.has(finalHeader.toLowerCase()))) {
      finalHeader = `${fixedHeader} (${counter})`;
      counter++;
    }

    fixed.push(finalHeader);
    seen.add(finalHeader);
    seenLower.add(finalHeader.toLowerCase());
  });

  return fixed;
}

/**
 * Parse a single CSV line into fields
 */
function parseCSVLine(line, lineNumber, delimiter = ',') {
  const fields = [];
  const errors = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    const prevChar = i > 0 ? line[i - 1] : null;

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote (double quote) inside quoted field
        currentField += '"';
        i++;
      } else if (inQuotes && (nextChar === delimiter || nextChar === '\n' || nextChar === '\r' || nextChar === undefined)) {
        // End of quoted field - quote followed by delimiter, newline, or end of line
        inQuotes = false;
        // Don't add quote to field
      } else if (!inQuotes && (currentField === '' || prevChar === delimiter || i === 0)) {
        // Start of quoted field - quote at start of field (after delimiter or at line start)
        inQuotes = true;
        // Don't add quote to field
      } else {
        // Quote in the middle of an unquoted field - treat as regular character
        currentField += char;
      }
    } else if (char === delimiter && !inQuotes) {
      // Field separator (only when not in quotes)
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Add last field
  fields.push(currentField);

  // Check for unclosed quotes
  if (inQuotes) {
    errors.push('Unclosed quotes detected. The field may be missing a closing quote or span multiple lines.');
  }

  return { fields, errors };
}

/**
 * Simple CSV parser for basic cases (fallback)
 */
export function parseCSVSimple(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [], errors: ['No data found'] };
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    rows.push(values);
  }

  return { headers, rows, errors: [] };
}
