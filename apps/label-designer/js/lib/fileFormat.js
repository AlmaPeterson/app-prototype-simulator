/**
 * File Format Utilities
 *
 * Handles serialization and deserialization of design files
 */

// ============================================================================
// Serialization
// ============================================================================

export function serializeDesign(designStore, dataStore) {
  const now = new Date().toISOString();

  // Convert labelOverrides Map to array
  const labelOverridesArray = Array.from(designStore.labelOverrides.entries()).map(
    ([labelIndex, override]) => ({
      labelIndex,
      override,
    })
  );

  return {
    version: '1.0',
    metadata: {
      createdAt: now,
      updatedAt: now,
      appName: 'Label Designer',
      appVersion: '0.1.0',
    },
    design: {
      template: designStore.template,
      masterLabel: designStore.masterLabel,
      labelOverrides: labelOverridesArray,
    },
    data: {
      columns: dataStore.columns,
      rows: dataStore.rows,
    },
  };
}

// ============================================================================
// Deserialization
// ============================================================================

export function deserializeDesign(file) {
  const validationErrors = [];
  const validationWarnings = [];

  // Convert labelOverrides array back to Map
  const labelOverridesMap = new Map(
    file.design.labelOverrides.map(({ labelIndex, override }) => [labelIndex, override])
  );

  // Validate data integrity
  if (file.data && Array.isArray(file.data.columns) && Array.isArray(file.data.rows)) {
    const columnIds = new Set(file.data.columns.map(col => col.id));

    // Validate rows reference valid columns
    file.data.rows.forEach((row, index) => {
      if (!row || typeof row !== 'object') {
        validationErrors.push(`Row ${index + 1}: Invalid row structure`);
        return;
      }

      if (!row.id || typeof row.id !== 'string') {
        validationErrors.push(`Row ${index + 1}: Missing or invalid row ID`);
      }

      // Check all row keys (except 'id') reference valid columns
      Object.keys(row).forEach(key => {
        if (key !== 'id' && !columnIds.has(key)) {
          validationWarnings.push(`Row ${index + 1}: References non-existent column "${key}". This data will be ignored.`);
        }
      });
    });

    // Validate column structure
    file.data.columns.forEach((col, index) => {
      if (!col || typeof col !== 'object') {
        validationErrors.push(`Column ${index + 1}: Invalid column structure`);
        return;
      }

      if (!col.id || typeof col.id !== 'string') {
        validationErrors.push(`Column ${index + 1}: Missing or invalid column ID`);
      }

      if (!col.name || typeof col.name !== 'string') {
        validationErrors.push(`Column ${index + 1}: Missing or invalid column name`);
      }
    });
  }

  return {
    design: {
      template: file.design.template,
      masterLabel: file.design.masterLabel,
      labelOverrides: labelOverridesMap,
    },
    data: {
      columns: file.data.columns,
      rows: file.data.rows,
    },
    validationErrors,
    validationWarnings,
  };
}

// ============================================================================
// Validation
// ============================================================================

export function validateDesignFile(file) {
  if (!file || typeof file !== 'object') {
    return false;
  }

  // Check version
  if (typeof file.version !== 'string') {
    return false;
  }

  // Check metadata
  if (!file.metadata || typeof file.metadata !== 'object') {
    return false;
  }
  if (typeof file.metadata.createdAt !== 'string' ||
    typeof file.metadata.updatedAt !== 'string' ||
    typeof file.metadata.appName !== 'string' ||
    typeof file.metadata.appVersion !== 'string') {
    return false;
  }

  // Check design
  if (!file.design || typeof file.design !== 'object') {
    return false;
  }
  if (!file.design.template || typeof file.design.template !== 'object') {
    return false;
  }
  if (!file.design.masterLabel || typeof file.design.masterLabel !== 'object') {
    return false;
  }
  if (!Array.isArray(file.design.labelOverrides)) {
    return false;
  }

  // Check data
  if (!file.data || typeof file.data !== 'object') {
    return false;
  }
  if (!Array.isArray(file.data.columns)) {
    return false;
  }
  if (!Array.isArray(file.data.rows)) {
    return false;
  }

  return true;
}

export function validateDesignOnlyFile(file) {
  if (!file || typeof file !== 'object') {
    return false;
  }

  // Check version
  if (typeof file.version !== 'string') {
    return false;
  }

  // Check metadata
  if (!file.metadata || typeof file.metadata !== 'object') {
    return false;
  }
  if (typeof file.metadata.createdAt !== 'string' ||
    typeof file.metadata.updatedAt !== 'string' ||
    typeof file.metadata.appName !== 'string' ||
    typeof file.metadata.appVersion !== 'string') {
    return false;
  }

  // Check design
  if (!file.design || typeof file.design !== 'object') {
    return false;
  }
  if (!file.design.template || typeof file.design.template !== 'object') {
    return false;
  }
  if (!file.design.masterLabel || typeof file.design.masterLabel !== 'object') {
    return false;
  }
  if (!Array.isArray(file.design.labelOverrides)) {
    return false;
  }

  // Design-only files should NOT have data field
  // But we allow it to be missing (not an error)

  return true;
}

export function getFileVersion(file) {
  if (file && typeof file === 'object' && typeof file.version === 'string') {
    return file.version;
  }
  return null;
}

// ============================================================================
// File Operations
// ============================================================================

export function saveDesignFile(designStore, dataStore, filename) {
  try {
    // Serialize design
    const designFile = serializeDesign(designStore, dataStore);

    // Convert to JSON string
    const jsonString = JSON.stringify(designFile, null, 2);

    // Create blob
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Generate filename if not provided
    const defaultFilename = filename || generateDefaultFilename('full');

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to save design file:', error);
    throw new Error('Failed to save design file. See console for details.');
  }
}

export async function loadDesignFile(file) {
  try {
    // Read file as text with UTF-8 encoding
    const text = await readFileAsText(file, 'UTF-8');

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      const errorDetails = parseError instanceof Error ? parseError.message : 'Unknown error';
      throw new Error(`Invalid JSON format. The file may be corrupted or is not a valid Label Designer file. Error: ${errorDetails}`);
    }

    // Validate file structure
    if (!validateDesignFile(parsed)) {
      // Provide more specific error messages
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid file: File is empty or not a valid JSON object.');
      }
      if (!parsed.version) {
        throw new Error('Invalid file format: Missing version information. This may not be a Label Designer file.');
      }
      if (!parsed.design) {
        throw new Error('Invalid file format: Missing design data. The file may be corrupted or incomplete.');
      }
      if (!parsed.data) {
        throw new Error('Invalid file format: Missing data section. The file may be corrupted or incomplete.');
      }
      throw new Error('Invalid file format. The file may be corrupted, incomplete, or from an incompatible version. Please ensure you are loading a valid .labeldesign file.');
    }

    // Check version compatibility
    const version = getFileVersion(parsed);
    if (version && version !== '1.0') {
      console.warn(`File version ${version} may not be fully compatible with current version 1.0`);
    }

    // Deserialize with validation
    const result = deserializeDesign(parsed);

    // If there are critical validation errors, throw them
    if (result.validationErrors.length > 0) {
      const errorMessage = `Data integrity errors found:\n${result.validationErrors.join('\n')}`;
      throw new Error(errorMessage);
    }

    return result;
  } catch (error) {
    console.error('Failed to load design file:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to load design file. See console for details.');
  }
}

// ============================================================================
// Design-Only File Operations
// ============================================================================

export function serializeDesignOnly(designStore) {
  const now = new Date().toISOString();

  // Convert labelOverrides Map to array
  const labelOverridesArray = Array.from(designStore.labelOverrides.entries()).map(
    ([labelIndex, override]) => ({
      labelIndex,
      override,
    })
  );

  return {
    version: '1.0',
    metadata: {
      createdAt: now,
      updatedAt: now,
      appName: 'Label Designer',
      appVersion: '0.1.0',
    },
    design: {
      template: designStore.template,
      masterLabel: designStore.masterLabel,
      labelOverrides: labelOverridesArray,
    },
  };
}

export function deserializeDesignOnly(file) {
  // Convert labelOverrides array back to Map
  const labelOverridesMap = new Map(
    file.design.labelOverrides.map(({ labelIndex, override }) => [labelIndex, override])
  );

  return {
    template: file.design.template,
    masterLabel: file.design.masterLabel,
    labelOverrides: labelOverridesMap,
  };
}

export function saveDesignOnlyFile(designStore, filename) {
  try {
    // Serialize design only
    const designFile = serializeDesignOnly(designStore);

    // Convert to JSON string
    const jsonString = JSON.stringify(designFile, null, 2);

    // Create blob
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Generate filename if not provided
    const defaultFilename = filename || generateDefaultFilename('design-only');

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to save design-only file:', error);
    throw new Error('Failed to save design-only file. See console for details.');
  }
}

export async function loadDesignOnlyFile(file) {
  try {
    // Read file as text with UTF-8 encoding
    const text = await readFileAsText(file, 'UTF-8');

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      const errorDetails = parseError instanceof Error ? parseError.message : 'Unknown error';
      throw new Error(`Invalid JSON format. The file may be corrupted or is not a valid Label Designer file. Error: ${errorDetails}`);
    }

    // Check if it's a full design file or design-only file
    const isFullFile = validateDesignFile(parsed);
    const isDesignOnlyFile = validateDesignOnlyFile(parsed);

    if (!isFullFile && !isDesignOnlyFile) {
      // Provide more specific error messages
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid file: File is empty or not a valid JSON object.');
      }
      if (!parsed.version) {
        throw new Error('Invalid file format: Missing version information. This may not be a Label Designer file.');
      }
      if (!parsed.design) {
        throw new Error('Invalid file format: Missing design data. The file may be corrupted or incomplete.');
      }
      throw new Error('Invalid file format. The file may be corrupted, incomplete, or from an incompatible version. Please ensure you are loading a valid .labeltemplate or .labeldesign file.');
    }

    // Check version compatibility
    const version = getFileVersion(parsed);
    if (version && version !== '1.0') {
      console.warn(`File version ${version} may not be fully compatible with current version 1.0`);
    }

    // If it's a full file, extract only the design portion
    if (isFullFile) {
      const fullFile = parsed;
      const designOnlyFile = {
        version: fullFile.version,
        metadata: fullFile.metadata,
        design: fullFile.design,
      };
      return deserializeDesignOnly(designOnlyFile);
    }

    // Otherwise, deserialize as design-only file
    return deserializeDesignOnly(parsed);
  } catch (error) {
    console.error('Failed to load design-only file:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to load design-only file. See console for details.');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateDefaultFilename(type = 'full') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  if (type === 'design-only') {
    return `label-template-${year}-${month}-${day}-${hours}${minutes}${seconds}.labeltemplate`;
  }

  return `label-design-${year}-${month}-${day}-${hours}${minutes}${seconds}.labeldesign`;
}

function readFileAsText(file, encoding = 'UTF-8') {
  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return Promise.reject(new Error(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxSize / 1024 / 1024}MB)`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file as text. The file may be corrupted or in an unsupported format.'));
      }
    };

    reader.onerror = (error) => {
      reject(new Error(`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`));
    };

    // Explicitly specify UTF-8 encoding
    reader.readAsText(file, encoding);
  });
}
