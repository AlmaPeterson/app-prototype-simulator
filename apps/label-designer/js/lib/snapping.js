/**
 * Snapping and Alignment Utilities
 *
 * Provides snapping logic for aligning elements to edges, centers, and other elements
 */

// ============================================================================
// Constants
// ============================================================================

export const SNAP_THRESHOLD = 2;

// ============================================================================
// Snapping Logic
// ============================================================================

export function snapValue(value, snapPoints, threshold = SNAP_THRESHOLD) {
  for (const point of snapPoints) {
    if (Math.abs(value - point) <= threshold) {
      return { snapped: point, didSnap: true };
    }
  }
  return { snapped: value, didSnap: false };
}

export function getLabelSnapPoints(labelWidth, labelHeight) {
  return {
    vertical: [0, labelWidth / 2, labelWidth],
    horizontal: [0, labelHeight / 2, labelHeight],
  };
}

export function getElementSnapPoints(elements) {
  const vertical = [];
  const horizontal = [];

  for (const element of elements) {
    vertical.push(element.x);
    vertical.push(element.x + element.width / 2);
    vertical.push(element.x + element.width);

    horizontal.push(element.y);
    horizontal.push(element.y + element.height / 2);
    horizontal.push(element.y + element.height);
  }

  return { vertical, horizontal };
}

export function snapElementPosition(
  transform,
  labelWidth,
  labelHeight,
  otherElements = []
) {
  const guides = [];

  const labelSnaps = getLabelSnapPoints(labelWidth, labelHeight);
  const elementSnaps = getElementSnapPoints(otherElements);

  const verticalSnaps = [...labelSnaps.vertical, ...elementSnaps.vertical];
  const horizontalSnaps = [...labelSnaps.horizontal, ...elementSnaps.horizontal];

  const left = transform.x;
  const right = transform.x + transform.width;
  const centerX = transform.x + transform.width / 2;

  const top = transform.y;
  const bottom = transform.y + transform.height;
  const centerY = transform.y + transform.height / 2;

  const result = { ...transform };

  const leftSnap = snapValue(left, verticalSnaps);
  if (leftSnap.didSnap) {
    result.x = leftSnap.snapped;
    guides.push({ type: 'vertical', position: leftSnap.snapped, label: 'Left' });
  }

  const rightSnap = snapValue(right, verticalSnaps);
  if (rightSnap.didSnap && !leftSnap.didSnap) {
    result.x = rightSnap.snapped - result.width;
    guides.push({ type: 'vertical', position: rightSnap.snapped, label: 'Right' });
  }

  const centerXSnap = snapValue(centerX, verticalSnaps);
  if (centerXSnap.didSnap && !leftSnap.didSnap && !rightSnap.didSnap) {
    result.x = centerXSnap.snapped - result.width / 2;
    guides.push({ type: 'vertical', position: centerXSnap.snapped, label: 'Center' });
  }

  const topSnap = snapValue(top, horizontalSnaps);
  if (topSnap.didSnap) {
    result.y = topSnap.snapped;
    guides.push({ type: 'horizontal', position: topSnap.snapped, label: 'Top' });
  }

  const bottomSnap = snapValue(bottom, horizontalSnaps);
  if (bottomSnap.didSnap && !topSnap.didSnap) {
    result.y = bottomSnap.snapped - result.height;
    guides.push({ type: 'horizontal', position: bottomSnap.snapped, label: 'Bottom' });
  }

  const centerYSnap = snapValue(centerY, horizontalSnaps);
  if (centerYSnap.didSnap && !topSnap.didSnap && !bottomSnap.didSnap) {
    result.y = centerYSnap.snapped - result.height / 2;
    guides.push({ type: 'horizontal', position: centerYSnap.snapped, label: 'Center' });
  }

  return { transform: result, guides };
}

export function constrainToBounds(transform, labelWidth, labelHeight) {
  const result = { ...transform };

  if (result.x < 0) {
    result.x = 0;
  }
  if (result.x + result.width > labelWidth) {
    result.x = labelWidth - result.width;
  }

  if (result.y < 0) {
    result.y = 0;
  }
  if (result.y + result.height > labelHeight) {
    result.y = labelHeight - result.height;
  }

  return result;
}

// ============================================================================
// Distribution
// ============================================================================

export function distributeHorizontally(elements, labelWidth) {
  if (elements.length < 2) {
    return elements;
  }

  const sorted = [...elements].sort((a, b) => a.x - b.x);

  const totalElementWidth = sorted.reduce((sum, el) => sum + el.width, 0);

  const availableSpace = labelWidth - totalElementWidth;
  const spacing = availableSpace / (sorted.length + 1);

  const result = [];
  let currentX = spacing;

  for (const el of sorted) {
    result.push({ ...el, x: currentX, y: el.y });
    currentX += el.width + spacing;
  }

  return result;
}

export function distributeVertically(elements, labelHeight) {
  if (elements.length < 2) {
    return elements;
  }

  const sorted = [...elements].sort((a, b) => a.y - b.y);

  const totalElementHeight = sorted.reduce((sum, el) => sum + el.height, 0);

  const availableSpace = labelHeight - totalElementHeight;
  const spacing = availableSpace / (sorted.length + 1);

  const result = [];
  let currentY = spacing;

  for (const el of sorted) {
    result.push({ ...el, x: el.x, y: currentY });
    currentY += el.height + spacing;
  }

  return result;
}

// ============================================================================
// Alignment
// ============================================================================

export function alignElements(elements, alignment) {
  if (elements.length < 2) {
    return elements;
  }

  switch (alignment) {
    case 'left': {
      const minX = Math.min(...elements.map((el) => el.x));
      return elements.map((el) => ({ ...el, x: minX }));
    }

    case 'center': {
      const avgCenterX =
        elements.reduce((sum, el) => sum + el.x + el.width / 2, 0) /
        elements.length;
      return elements.map((el) => ({
        ...el,
        x: avgCenterX - el.width / 2,
      }));
    }

    case 'right': {
      const maxRight = Math.max(...elements.map((el) => el.x + el.width));
      return elements.map((el) => ({ ...el, x: maxRight - el.width }));
    }

    case 'top': {
      const minY = Math.min(...elements.map((el) => el.y));
      return elements.map((el) => ({ ...el, y: minY }));
    }

    case 'middle': {
      const avgCenterY =
        elements.reduce((sum, el) => sum + el.y + el.height / 2, 0) /
        elements.length;
      return elements.map((el) => ({
        ...el,
        y: avgCenterY - el.height / 2,
      }));
    }

    case 'bottom': {
      const maxBottom = Math.max(...elements.map((el) => el.y + el.height));
      return elements.map((el) => ({ ...el, y: maxBottom - el.height }));
    }

    default:
      return elements;
  }
}

// ============================================================================
// Geometry Helpers
// ============================================================================

export function rectsOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function getBoundingBox(transforms) {
  if (transforms.length === 0) {
    return null;
  }

  const minX = Math.min(...transforms.map((t) => t.x));
  const minY = Math.min(...transforms.map((t) => t.y));
  const maxX = Math.max(...transforms.map((t) => t.x + t.width));
  const maxY = Math.max(...transforms.map((t) => t.y + t.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
