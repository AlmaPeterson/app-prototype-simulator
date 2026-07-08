/**
 * Reference Checker
 *
 * Checks for missing references in design elements (images, columns, data)
 */

import { getAllAssets } from './assets.js';
import { getEffectiveElements } from './masterOverride.js';
import { VARIABLE_REGEX } from './variables.js';

/**
 * Check for missing references in the design
 */
export async function checkMissingReferences(
  template,
  masterLabel,
  labelOverrides,
  rows,
  columns
) {
  const missingImages = [];
  const missingColumns = [];
  const missingData = [];

  // Get all assets
  const assets = await getAllAssets();
  const assetNames = new Set(assets.map(a => a.name));

  // Get column IDs and names
  const columnIds = new Set(columns.map(c => c.id));
  const columnNames = new Map(); // name -> id
  columns.forEach(c => {
    columnNames.set(c.name.toLowerCase(), c.id);
  });

  // Calculate labels per page
  const labelsPerPage = template.rows * template.columns;
  const totalLabels = labelsPerPage;

  // Check each label
  for (let labelIndex = 0; labelIndex < totalLabels; labelIndex++) {
    const override = labelOverrides.get(labelIndex);
    const elements = getEffectiveElements(masterLabel, override);

    // Determine which row this label uses (for preview, assume page 0 for checking)
    const rowIndex = labelIndex;
    const rowData = rowIndex < rows.length ? rows[rowIndex] : undefined;

    for (const element of elements) {
      // Check text elements for column references
      if (element.type === 'text') {
        const textElement = element;

        // Check bindings
        if (textElement.bindings) {
          for (const binding of textElement.bindings) {
            if (binding.columnId && !columnIds.has(binding.columnId)) {
              missingColumns.push({
                elementId: element.id,
                columnName: binding.columnId,
                labelIndex,
              });
            }
          }
        }

        // Check {ColumnName} / <ColumnName> syntax
        const columnMatches = textElement.content.match(VARIABLE_REGEX);
        if (columnMatches) {
          for (const match of columnMatches) {
            const columnName = match.slice(1, -1).trim();
            const columnId = columnNames.get(columnName.toLowerCase());

            if (!columnId && !columnIds.has(columnName)) {
              // Check if it's a direct key in row data
              if (rowData && !(columnName in rowData)) {
                missingColumns.push({
                  elementId: element.id,
                  columnName,
                  labelIndex,
                });
              } else if (!rowData) {
                missingColumns.push({
                  elementId: element.id,
                  columnName,
                  labelIndex,
                });
              }
            }
          }
        }
      }

      // Check placeholder elements
      if (element.type === 'placeholder') {
        const placeholderElement = element;

        if (placeholderElement.placeholderType === 'image') {
          // Check static image name
          if (placeholderElement.imageName && !assetNames.has(placeholderElement.imageName)) {
            missingImages.push({
              elementId: element.id,
              imageName: placeholderElement.imageName,
              labelIndex,
            });
          }

          // Check data-bound image names
          if (placeholderElement.imageNameBinding && placeholderElement.imageNameBinding.columnId) {
            const columnId = placeholderElement.imageNameBinding.columnId;

            // Check if column exists
            if (!columnIds.has(columnId)) {
              missingColumns.push({
                elementId: element.id,
                columnName: columnId,
                labelIndex,
              });
            } else {
              // Check each row for missing images
              rows.forEach((row, idx) => {
                const imageName = row[columnId];
                if (imageName && typeof imageName === 'string' && !assetNames.has(imageName)) {
                  missingImages.push({
                    elementId: element.id,
                    imageName: String(imageName),
                    labelIndex: Math.floor(idx / labelsPerPage) === Math.floor(labelIndex / labelsPerPage) ? labelIndex : undefined,
                    rowIndex: idx,
                  });
                }
              });
            }
          }
        }

        if (placeholderElement.placeholderType === 'qrCode') {
          // Check QR value binding
          if (placeholderElement.qrValueBinding && placeholderElement.qrValueBinding.columnId) {
            const columnId = placeholderElement.qrValueBinding.columnId;

            // Check if column exists
            if (!columnIds.has(columnId)) {
              missingColumns.push({
                elementId: element.id,
                columnName: columnId,
                labelIndex,
              });
            } else {
              // Check if data exists for this column in rows
              if (rowData && (rowData[columnId] === undefined || rowData[columnId] === null || rowData[columnId] === '')) {
                missingData.push({
                  elementId: element.id,
                  columnName: columns.find(c => c.id === columnId)?.name || columnId,
                  rowIndex,
                  labelIndex,
                });
              }
            }
          }
        }
      }
    }
  }

  // Remove duplicates (same element, same issue)
  const uniqueMissingImages = Array.from(
    new Map(missingImages.map(m => [`${m.elementId}-${m.imageName}-${m.labelIndex}`, m])).values()
  );
  const uniqueMissingColumns = Array.from(
    new Map(missingColumns.map(m => [`${m.elementId}-${m.columnName}-${m.labelIndex}`, m])).values()
  );
  const uniqueMissingData = Array.from(
    new Map(missingData.map(m => [`${m.elementId}-${m.columnName}-${m.rowIndex}`, m])).values()
  );

  return {
    missingImages: uniqueMissingImages,
    missingColumns: uniqueMissingColumns,
    missingData: uniqueMissingData,
    totalCount: uniqueMissingImages.length + uniqueMissingColumns.length + uniqueMissingData.length,
  };
}
