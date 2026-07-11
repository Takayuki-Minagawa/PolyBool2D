import { circleToRing } from './circle';
import { defaultEngine } from './polygonClippingEngine';
import { repairMultiPolygon } from './repair';
import { cross } from './numeric';
import type {
  MultiPolygonGeometry,
  Point,
  PolygonGeometry,
  Ring,
} from './types';

export type BufferOptions = {
  /** Number of sides used for each circular join. */
  arcSegments?: number;
};

const DEFAULT_ARC_SEGMENTS = 32;
const MAX_ARC_SEGMENTS = 4096;
const UNION_BATCH_SIZE = 32;

function sanitizedArcSegments(value: number | undefined): number {
  if (value === undefined) return DEFAULT_ARC_SEGMENTS;
  if (!Number.isFinite(value)) return DEFAULT_ARC_SEGMENTS;
  return Math.max(8, Math.min(MAX_ARC_SEGMENTS, Math.floor(value)));
}

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function edgeBand(a: Point, b: Point, radius: number): PolygonGeometry | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const nx = (-dy / length) * radius;
  const ny = (dx / length) * radius;
  const outer: Ring = [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
  return outer.every(finitePoint) ? { outer, holes: [] } : null;
}

function boundaryBands(
  polygons: MultiPolygonGeometry,
  radius: number,
  arcSegments: number,
): MultiPolygonGeometry {
  const bands: MultiPolygonGeometry = [];
  for (const polygon of polygons) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const point = ring[i];
        if (!finitePoint(point)) continue;
        bands.push({
          outer: circleToRing(point, radius, arcSegments),
          holes: [],
        });
        const band = edgeBand(point, ring[(i + 1) % ring.length], radius);
        if (band) bands.push(band);
      }
    }
  }
  return bands;
}

/** Merge many overlapping buffer pieces without overloading one sweep pass. */
function unionSequentially(
  polygons: MultiPolygonGeometry,
): MultiPolygonGeometry {
  let merged: MultiPolygonGeometry = [];
  for (const polygon of polygons) {
    merged = merged.length === 0
      ? defaultEngine.union([polygon])
      : defaultEngine.union([...merged, polygon]);
  }
  return merged;
}

function unionInBatches(polygons: MultiPolygonGeometry): MultiPolygonGeometry {
  try {
    let merged: MultiPolygonGeometry = [];
    for (let index = 0; index < polygons.length; index += UNION_BATCH_SIZE) {
      const batch = polygons.slice(index, index + UNION_BATCH_SIZE);
      const batchResult = defaultEngine.union(batch);
      merged = merged.length === 0
        ? batchResult
        : defaultEngine.union([...merged, ...batchResult]);
    }
    return merged;
  } catch {
    // polygon-clipping can fail when many circular pieces share almost the
    // same event coordinate. Adding one piece at a time avoids that sweep-line
    // ambiguity while preserving the requested round buffer.
    return unionSequentially(polygons);
  }
}

function miterOffsetRing(ring: Ring, leftOffset: number): Ring | null {
  if (
    ring.length < 3 ||
    leftOffset === 0 ||
    !Number.isFinite(leftOffset)
  ) {
    return null;
  }
  const result: Ring = [];
  for (let index = 0; index < ring.length; index++) {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const previousDx = current.x - previous.x;
    const previousDy = current.y - previous.y;
    const nextDx = next.x - current.x;
    const nextDy = next.y - current.y;
    const previousLength = Math.hypot(previousDx, previousDy);
    const nextLength = Math.hypot(nextDx, nextDy);
    if (!(previousLength > 0) || !(nextLength > 0)) return null;
    const previousDirection = {
      x: previousDx / previousLength,
      y: previousDy / previousLength,
    };
    const nextDirection = { x: nextDx / nextLength, y: nextDy / nextLength };
    const previousNormal = { x: -previousDirection.y, y: previousDirection.x };
    const nextNormal = { x: -nextDirection.y, y: nextDirection.x };
    const previousLinePoint = {
      x: current.x + previousNormal.x * leftOffset,
      y: current.y + previousNormal.y * leftOffset,
    };
    const nextLinePoint = {
      x: current.x + nextNormal.x * leftOffset,
      y: current.y + nextNormal.y * leftOffset,
    };
    const denominator = cross(
      previousDirection.x,
      previousDirection.y,
      nextDirection.x,
      nextDirection.y,
    );
    if (Math.abs(denominator) < 1e-12) {
      result.push({
        x: (previousLinePoint.x + nextLinePoint.x) / 2,
        y: (previousLinePoint.y + nextLinePoint.y) / 2,
      });
      continue;
    }
    const deltaX = nextLinePoint.x - previousLinePoint.x;
    const deltaY = nextLinePoint.y - previousLinePoint.y;
    const parameter =
      cross(deltaX, deltaY, nextDirection.x, nextDirection.y) / denominator;
    const point = {
      x: previousLinePoint.x + previousDirection.x * parameter,
      y: previousLinePoint.y + previousDirection.y * parameter,
    };
    if (!finitePoint(point)) return null;
    result.push(point);
  }
  for (let index = 0; index < ring.length; index++) {
    const originalDx = ring[(index + 1) % ring.length].x - ring[index].x;
    const originalDy = ring[(index + 1) % ring.length].y - ring[index].y;
    const insetDx = result[(index + 1) % result.length].x - result[index].x;
    const insetDy = result[(index + 1) % result.length].y - result[index].y;
    if (originalDx * insetDx + originalDy * insetDy <= 1e-12) return null;
  }
  return result;
}

function fallbackMiterOffset(
  source: MultiPolygonGeometry,
  leftOffset: number,
): MultiPolygonGeometry {
  return repairMultiPolygon(
    source.flatMap((polygon) => {
      const outer = miterOffsetRing(polygon.outer, leftOffset);
      return outer ? [{ outer, holes: [] }] : [];
    }),
  );
}

function bufferSimplePolygon(
  polygon: PolygonGeometry,
  distance: number,
  arcSegments: number,
): MultiPolygonGeometry {
  const source = repairMultiPolygon([{ outer: polygon.outer, holes: [] }]);
  if (source.length === 0 || distance === 0) return source;
  const bands = boundaryBands(source, Math.abs(distance), arcSegments);
  if (bands.length === 0) return source;
  if (distance > 0) {
    try {
      const dilated = unionInBatches([...source, ...bands]);
      if (dilated.length > 0) return dilated;
    } catch {
      // Fall through to the shifted-line offset below.
    }
    return fallbackMiterOffset(source, -Math.abs(distance));
  }
  try {
    const eroded = defaultEngine.difference(source, unionInBatches(bands));
    if (eroded.length > 0) return eroded;
  } catch {
    // Fall through to the shifted-line inset below.
  }
  return fallbackMiterOffset(source, Math.abs(distance));
}

/**
 * Apply a round-join Euclidean-style buffer to a MultiPolygon.
 *
 * Positive distances dilate the filled region and negative distances erode
 * it. Holes therefore shrink for positive values and grow for negative ones.
 * A buffer can split into several polygons or disappear, so the result is
 * always a MultiPolygonGeometry.
 */
export function bufferMultiPolygon(
  polygons: MultiPolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  if (!Number.isFinite(distance) || polygons.length === 0) return [];

  // Repair first so boundary bands are built from unambiguous material
  // boundaries rather than from self-crossing input paths.
  const source = repairMultiPolygon(polygons);
  if (source.length === 0 || distance === 0) return source;

  const radius = Math.abs(distance);
  if (!Number.isFinite(radius) || radius === 0) return source;
  const arcSegments = sanitizedArcSegments(options.arcSegments);

  try {
    const buffered = source.flatMap((polygon) => {
      const outer = bufferSimplePolygon(polygon, distance, arcSegments);
      if (outer.length === 0 || polygon.holes.length === 0) return outer;

      // A positive material offset shrinks voids; a negative offset grows
      // them. Buffer each void independently, then subtract it from the
      // already-buffered outer boundary. This avoids sweep-line ambiguity
      // when hundreds of outer and hole boundary bands meet in one union.
      const bufferedHoles = polygon.holes.flatMap((hole) =>
        bufferSimplePolygon({ outer: hole, holes: [] }, -distance, arcSegments),
      );
      return bufferedHoles.length > 0
        ? defaultEngine.difference(outer, bufferedHoles)
        : outer;
    });
    return buffered.length > 1 ? unionInBatches(buffered) : buffered;
  } catch {
    return [];
  }
}

export function bufferPolygon(
  polygon: PolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return bufferMultiPolygon([polygon], distance, options);
}

/** CAD-friendly alias for bufferPolygon. */
export function offsetPolygon(
  polygon: PolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return bufferPolygon(polygon, distance, options);
}

/** CAD-friendly alias for bufferMultiPolygon. */
export function offsetMultiPolygon(
  polygons: MultiPolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return bufferMultiPolygon(polygons, distance, options);
}
