import { pointInPolygon } from '../geometry/intersections';
import type { BBox } from '../geometry/measure';
import { isFinitePoint } from '../geometry/numeric';
import { normalizeBBox } from '../geometry/spatialIndex';
import type { Point } from '../geometry/types';
import {
  resolveAngularDimension,
  resolveLinearDimension,
} from '../persistence/dimensionExport';
import type { Entity, LinearEntity } from './projectTypes';

export type SelectionMode = 'window' | 'crossing';

function containsPoint(bounds: BBox, point: Point): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX &&
    point.y >= bounds.minY && point.y <= bounds.maxY;
}

/** Slab clipping also handles horizontal/vertical lines and boundary contact. */
function lineIntersectsBox(
  start: Point,
  end: Point,
  bounds: BBox,
  infinite = false,
): boolean {
  let first = infinite ? -Infinity : 0;
  let last = infinite ? Infinity : 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = end[axis] - start[axis];
    if (!Number.isFinite(delta)) return false;
    const min = axis === 'x' ? bounds.minX : bounds.minY;
    const max = axis === 'x' ? bounds.maxX : bounds.maxY;
    if (delta === 0) {
      if (start[axis] < min || start[axis] > max) return false;
      continue;
    }
    const entry = (min - start[axis]) / delta;
    const exit = (max - start[axis]) / delta;
    first = Math.max(first, Math.min(entry, exit));
    last = Math.min(last, Math.max(entry, exit));
    if (first > last) return false;
  }
  return true;
}

function pathIntersectsBox(points: readonly Point[], bounds: BBox, closed = false): boolean {
  if (points.some((point) => containsPoint(bounds, point))) return true;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    if (lineIntersectsBox(points[index], points[(index + 1) % points.length], bounds)) {
      return true;
    }
  }
  return false;
}

function linearPaths(entity: LinearEntity): Point[][] {
  if (entity.kind === 'annotation') return entity.points[0] ? [[entity.points[0]]] : [];
  if (entity.kind === 'linear-dimension') {
    const dimension = resolveLinearDimension(entity);
    return dimension ? [
      dimension.extensionStart,
      dimension.extensionEnd,
      [dimension.dimensionStart, dimension.dimensionEnd],
    ] : [];
  }
  if (entity.kind === 'angular-dimension') {
    const dimension = resolveAngularDimension(entity);
    return dimension ? [
      [dimension.center, dimension.arcPoints[0]],
      [dimension.center, dimension.arcPoints.at(-1)!],
      dimension.arcPoints,
    ] : [];
  }
  return entity.points.length >= 2 ? [entity.points] : [];
}

/**
 * Test world geometry against a CAD selection rectangle, including edge contact.
 * Window selection contains every rendered path; crossing selection touches a
 * path or polygon material. Dimension paths match the viewport; annotation text
 * uses its insertion point. Stroke width, arrowheads and text glyph extents are
 * view-dependent and excluded. Guides are infinite: only crossing selects them.
 * Visibility, locks and group selection are handled by the caller.
 */
export function entityIntersectsSelection(
  entity: Entity,
  bounds: BBox,
  mode: SelectionMode,
): boolean {
  const box = normalizeBBox(bounds);
  if (!box) return false;

  if (entity.type === 'polygon') {
    const { outer, holes } = entity.geometry;
    if (outer.length < 3) return false;
    const rings = [outer, ...holes];
    if (!rings.every((ring) => ring.every(isFinitePoint))) return false;
    if (mode === 'window') {
      return rings.every((ring) => ring.every((point) => containsPoint(box, point)));
    }
    if (rings.some((ring) => pathIntersectsBox(ring, box, true))) return true;
    // If no boundaries meet, overlap is possible only when the rectangle lies
    // inside material. A rectangle entirely inside a hole must remain a miss.
    return pointInPolygon({ x: box.minX, y: box.minY }, entity.geometry);
  }

  if (entity.kind === 'guide') {
    const [start, end] = entity.points;
    return mode === 'crossing' && start !== undefined && end !== undefined &&
      isFinitePoint(start) && isFinitePoint(end) &&
      (start.x !== end.x || start.y !== end.y) &&
      lineIntersectsBox(start, end, box, true);
  }

  const paths = linearPaths(entity);
  if (paths.length === 0 || !paths.every((path) => path.every(isFinitePoint))) return false;
  return mode === 'window'
    ? paths.every((path) => path.every((point) => containsPoint(box, point)))
    : paths.some((path) => pathIntersectsBox(path, box));
}
