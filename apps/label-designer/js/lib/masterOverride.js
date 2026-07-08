/**
 * Master/Override System
 *
 * Handles the logic for master label propagation and per-label overrides
 */

// ============================================================================
// Master Label Operations
// ============================================================================

export function getEffectiveElements(masterLabel, override) {
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

export function hasOverrides(override) {
  if (!override) {
    return false;
  }

  return (
    override.elementOverrides.length > 0 ||
    override.hiddenElementIds.length > 0 ||
    override.additionalElements.length > 0
  );
}

export function isElementOverridden(elementId, override) {
  if (!override) {
    return false;
  }

  return (
    override.elementOverrides.some((eo) => eo.elementId === elementId) ||
    override.hiddenElementIds.includes(elementId)
  );
}

// ============================================================================
// Override Management
// ============================================================================

export function createElementOverride(labelIndex, elementId, overrides, existingOverride) {
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
    base.elementOverrides.push({
      elementId,
      overrides,
    });
  }

  return base;
}

export function removeElementOverride(elementId, override) {
  return {
    ...override,
    elementOverrides: override.elementOverrides.filter(
      (eo) => eo.elementId !== elementId
    ),
    hiddenElementIds: override.hiddenElementIds.filter((id) => id !== elementId),
  };
}

export function hideElement(labelIndex, elementId, existingOverride) {
  const base = existingOverride || {
    labelIndex,
    elementOverrides: [],
    hiddenElementIds: [],
    additionalElements: [],
  };

  if (!base.hiddenElementIds.includes(elementId)) {
    base.hiddenElementIds.push(elementId);
  }

  return base;
}

export function showElement(elementId, override) {
  return {
    ...override,
    hiddenElementIds: override.hiddenElementIds.filter((id) => id !== elementId),
  };
}

export function addLabelSpecificElement(labelIndex, element, existingOverride) {
  const base = existingOverride || {
    labelIndex,
    elementOverrides: [],
    hiddenElementIds: [],
    additionalElements: [],
  };

  base.additionalElements.push(element);

  return base;
}

export function removeLabelSpecificElement(elementId, override) {
  return {
    ...override,
    additionalElements: override.additionalElements.filter(
      (e) => e.id !== elementId
    ),
  };
}

export function resetLabelOverrides(labelIndex) {
  return {
    labelIndex,
    elementOverrides: [],
    hiddenElementIds: [],
    additionalElements: [],
  };
}

export function resetElementOverride(elementId, override) {
  return {
    ...override,
    elementOverrides: override.elementOverrides.filter(
      (eo) => eo.elementId !== elementId
    ),
    hiddenElementIds: override.hiddenElementIds.filter((id) => id !== elementId),
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

export function applyOverrideToLabels(labelIndices, elementId, overrides, existingOverrides) {
  const result = new Map(existingOverrides);

  for (const labelIndex of labelIndices) {
    const existing = result.get(labelIndex);
    const updated = createElementOverride(labelIndex, elementId, overrides, existing);
    result.set(labelIndex, updated);
  }

  return result;
}

export function resetMultipleLabels(labelIndices) {
  const result = new Map();

  for (const labelIndex of labelIndices) {
    result.set(labelIndex, resetLabelOverrides(labelIndex));
  }

  return result;
}

// ============================================================================
// Propagation Utilities
// ============================================================================

export function getAffectedLabels(elementId, totalLabels, overrides) {
  const affected = [];

  for (let i = 0; i < totalLabels; i++) {
    const override = overrides.get(i);
    if (!isElementOverridden(elementId, override)) {
      affected.push(i);
    }
  }

  return affected;
}

export function willMasterChangeAffectLabel(elementId, labelIndex, overrides) {
  const override = overrides.get(labelIndex);
  return !isElementOverridden(elementId, override);
}
