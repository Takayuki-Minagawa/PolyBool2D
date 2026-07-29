import { circleToRing } from './circle';
import { getEngine } from './geometryEngine';
import {
  cross,
  DIRECTION_TOLERANCE,
  isFinitePoint,
} from './numeric';
import { repairMultiPolygonResult } from './repair';
import type {
  GeometryOperationResult,
  MultiPolygonGeometry,
  Point,
  PolygonGeometry,
  Ring,
} from './types';

export type BufferOptions = {
  /** Number of sides used for each circular join. */
  arcSegments?: number;
};

export type OffsetFailureReason =
  | 'invalid-input'
  | 'repair-failed'
  | 'engine-error';

export type OffsetDiagnostic = {
  code:
    | 'arc-segments-reduced'
    | 'balanced-union-failed'
    | 'miter-offset-fallback'
    | 'native-offset';
  message: string;
};

export type OffsetResult = GeometryOperationResult<
  MultiPolygonGeometry,
  OffsetFailureReason,
  OffsetDiagnostic
>;

const DEFAULT_ARC_SEGMENTS = 32;
const MIN_ARC_SEGMENTS = 8;
const MAX_ARC_SEGMENTS = 4096;
const UNION_BATCH_SIZE = 32;
/** Prevent one buffer request from creating millions of circular vertices. */
const MAX_TOTAL_ARC_VERTICES = 4096;

function successful(
  value: MultiPolygonGeometry,
  diagnostics: OffsetDiagnostic[],
): OffsetResult {
  return { ok: true, value, diagnostics };
}

function failed(
  reason: OffsetFailureReason,
  message: string,
  diagnostics: OffsetDiagnostic[],
): OffsetResult {
  return { ok: false, value: [], reason, message, diagnostics };
}

function caughtMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizedArcSegments(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_ARC_SEGMENTS;
  }
  return Math.max(
    MIN_ARC_SEGMENTS,
    Math.min(MAX_ARC_SEGMENTS, Math.floor(value)),
  );
}

function effectiveArcSegments(
  value: number | undefined,
  boundaryVertexCount: number,
  diagnostics: OffsetDiagnostic[],
): number {
  const requested = sanitizedArcSegments(value);
  if (boundaryVertexCount <= 0) return requested;
  const budgeted = Math.max(
    MIN_ARC_SEGMENTS,
    Math.floor(MAX_TOTAL_ARC_VERTICES / boundaryVertexCount),
  );
  const effective = Math.min(requested, budgeted);
  if (effective < requested) {
    diagnostics.push({
      code: 'arc-segments-reduced',
      message:
        `Arc segments were reduced from ${requested} to ${effective} ` +
        `for ${boundaryVertexCount} boundary vertices.`,
    });
  }
  return effective;
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
  return outer.every(isFinitePoint) ? { outer, holes: [] } : null;
}

function boundaryBands(
  polygons: MultiPolygonGeometry,
  radius: number,
  arcSegments: number,
): MultiPolygonGeometry {
  const bands: MultiPolygonGeometry = [];
  for (const polygon of polygons) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let index = 0; index < ring.length; index++) {
        const point = ring[index];
        if (!isFinitePoint(point)) continue;
        bands.push({
          outer: circleToRing(point, radius, arcSegments),
          holes: [],
        });
        const band = edgeBand(
          point,
          ring[(index + 1) % ring.length],
          radius,
        );
        if (band) bands.push(band);
      }
    }
  }
  return bands;
}

/**
 * Merge leaves in fixed-size batches, then merge batch results pairwise.
 * The tree keeps intermediate sweep complexity balanced instead of growing a
 * single accumulator once for every boundary piece.
 */
function unionBalanced(
  polygons: MultiPolygonGeometry,
): MultiPolygonGeometry {
  if (polygons.length === 0) return [];
  const engine = getEngine();
  let level: MultiPolygonGeometry[] = [];
  for (let index = 0; index < polygons.length; index += UNION_BATCH_SIZE) {
    level.push(engine.union(polygons.slice(index, index + UNION_BATCH_SIZE)));
  }
  while (level.length > 1) {
    const next: MultiPolygonGeometry[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const right = level[index + 1];
      next.push(
        right === undefined
          ? level[index]
          : engine.union([...level[index], ...right]),
      );
    }
    level = next;
  }
  return level[0] ?? [];
}

function unionSequentially(
  polygons: MultiPolygonGeometry,
): MultiPolygonGeometry {
  const engine = getEngine();
  let merged: MultiPolygonGeometry = [];
  for (const polygon of polygons) {
    merged =
      merged.length === 0
        ? engine.union([polygon])
        : engine.union([...merged, polygon]);
  }
  return merged;
}

function unionWithFallback(
  polygons: MultiPolygonGeometry,
  diagnostics: OffsetDiagnostic[],
): OffsetResult {
  try {
    return successful(unionBalanced(polygons), diagnostics);
  } catch (balancedError) {
    diagnostics.push({
      code: 'balanced-union-failed',
      message:
        'Balanced union failed; retrying one polygon at a time: ' +
        caughtMessage(balancedError),
    });
    try {
      return successful(unionSequentially(polygons), diagnostics);
    } catch (sequentialError) {
      return failed(
        'engine-error',
        'Both balanced and sequential union failed: ' +
          caughtMessage(sequentialError),
        diagnostics,
      );
    }
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
    const nextDirection = {
      x: nextDx / nextLength,
      y: nextDy / nextLength,
    };
    const previousNormal = {
      x: -previousDirection.y,
      y: previousDirection.x,
    };
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
    if (Math.abs(denominator) < DIRECTION_TOLERANCE) {
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
    if (!isFinitePoint(point)) return null;
    result.push(point);
  }
  for (let index = 0; index < ring.length; index++) {
    const originalDx = ring[(index + 1) % ring.length].x - ring[index].x;
    const originalDy = ring[(index + 1) % ring.length].y - ring[index].y;
    const insetDx =
      result[(index + 1) % result.length].x - result[index].x;
    const insetDy =
      result[(index + 1) % result.length].y - result[index].y;
    if (
      originalDx * insetDx + originalDy * insetDy <=
      DIRECTION_TOLERANCE
    ) {
      return null;
    }
  }
  return result;
}

function mapRepairResult(
  result: ReturnType<typeof repairMultiPolygonResult>,
  diagnostics: OffsetDiagnostic[],
): OffsetResult {
  return result.ok
    ? successful(result.value, diagnostics)
    : failed(
        result.reason === 'engine-error' ? 'engine-error' : 'repair-failed',
        result.message,
        diagnostics,
      );
}

function fallbackMiterOffset(
  source: MultiPolygonGeometry,
  leftOffset: number,
  diagnostics: OffsetDiagnostic[],
  cause: string,
): OffsetResult {
  diagnostics.push({
    code: 'miter-offset-fallback',
    message: cause,
  });
  const candidates = source.flatMap((polygon) => {
    const outer = miterOffsetRing(polygon.outer, leftOffset);
    return outer ? [{ outer, holes: [] }] : [];
  });
  return mapRepairResult(repairMultiPolygonResult(candidates), diagnostics);
}

function bufferSimplePolygonResult(
  polygon: PolygonGeometry,
  distance: number,
  arcSegments: number,
  diagnostics: OffsetDiagnostic[],
): OffsetResult {
  const repaired = mapRepairResult(
    repairMultiPolygonResult([{ outer: polygon.outer, holes: [] }]),
    diagnostics,
  );
  if (!repaired.ok || repaired.value.length === 0 || distance === 0) {
    return repaired;
  }
  const source = repaired.value;
  const bands = boundaryBands(source, Math.abs(distance), arcSegments);
  if (bands.length === 0) return successful(source, diagnostics);

  if (distance > 0) {
    const dilated = unionWithFallback([...source, ...bands], diagnostics);
    if (dilated.ok && dilated.value.length > 0) return dilated;
    return fallbackMiterOffset(
      source,
      -Math.abs(distance),
      diagnostics,
      dilated.ok
        ? 'Round union produced no polygons; using a miter offset.'
        : dilated.message,
    );
  }

  const mergedBands = unionWithFallback(bands, diagnostics);
  if (mergedBands.ok) {
    try {
      return successful(
        getEngine().difference(source, mergedBands.value),
        diagnostics,
      );
    } catch (error) {
      return fallbackMiterOffset(
        source,
        Math.abs(distance),
        diagnostics,
        'Round inset failed; using a miter inset: ' + caughtMessage(error),
      );
    }
  }
  return fallbackMiterOffset(
    source,
    Math.abs(distance),
    diagnostics,
    mergedBands.message,
  );
}

/**
 * Diagnostic form of bufferMultiPolygon. It distinguishes invalid input and
 * engine failures while retaining warnings when a safe fallback was used.
 */
export function bufferMultiPolygonResult(
  polygons: MultiPolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): OffsetResult {
  const diagnostics: OffsetDiagnostic[] = [];
  if (!Number.isFinite(distance)) {
    return failed(
      'invalid-input',
      'Offset distance must be finite.',
      diagnostics,
    );
  }
  if (polygons.length === 0) return successful([], diagnostics);

  const repaired = mapRepairResult(
    repairMultiPolygonResult(polygons),
    diagnostics,
  );
  if (!repaired.ok || repaired.value.length === 0 || distance === 0) {
    return repaired;
  }
  const source = repaired.value;
  const radius = Math.abs(distance);
  if (!Number.isFinite(radius) || radius === 0) {
    return successful(source, diagnostics);
  }

  const boundaryVertexCount = source.reduce(
    (total, polygon) =>
      total +
      polygon.outer.length +
      polygon.holes.reduce((sum, hole) => sum + hole.length, 0),
    0,
  );
  const arcSegments = effectiveArcSegments(
    options.arcSegments,
    boundaryVertexCount,
    diagnostics,
  );

  const activeEngine = getEngine() as ReturnType<typeof getEngine> & {
    offset?: (
      input: MultiPolygonGeometry,
      offsetDistance: number,
      nativeOptions?: {
        join?: 'round' | 'miter' | 'square';
        arcTolerance?: number;
      },
    ) => MultiPolygonGeometry;
  };
  if (typeof activeEngine.offset === 'function') {
    try {
      const arcTolerance =
        radius * (1 - Math.cos(Math.PI / Math.max(MIN_ARC_SEGMENTS, arcSegments)));
      const value = activeEngine.offset(source, distance, {
        join: 'round',
        arcTolerance,
      });
      diagnostics.push({
        code: 'native-offset',
        message: 'Offset was evaluated by the active geometry engine.',
      });
      return successful(value, diagnostics);
    } catch (error) {
      diagnostics.push({
        code: 'miter-offset-fallback',
        message: 'Native offset failed; using the portable buffer fallback: ' +
          caughtMessage(error),
      });
    }
  }

  const buffered: MultiPolygonGeometry = [];
  for (const polygon of source) {
    const outer = bufferSimplePolygonResult(
      polygon,
      distance,
      arcSegments,
      diagnostics,
    );
    if (!outer.ok) return outer;
    let material = outer.value;
    if (material.length > 0 && polygon.holes.length > 0) {
      const bufferedHoles: MultiPolygonGeometry = [];
      for (const hole of polygon.holes) {
        const bufferedHole = bufferSimplePolygonResult(
          { outer: hole, holes: [] },
          -distance,
          arcSegments,
          diagnostics,
        );
        if (!bufferedHole.ok) return bufferedHole;
        bufferedHoles.push(...bufferedHole.value);
      }
      if (bufferedHoles.length > 0) {
        try {
          material = getEngine().difference(material, bufferedHoles);
        } catch (error) {
          return failed(
            'engine-error',
            'Subtracting buffered holes failed: ' + caughtMessage(error),
            diagnostics,
          );
        }
      }
    }
    buffered.push(...material);
  }
  return buffered.length > 1
    ? unionWithFallback(buffered, diagnostics)
    : successful(buffered, diagnostics);
}

/**
 * Apply a round-join Euclidean-style buffer. The compatibility API returns an
 * empty result on failure; use bufferMultiPolygonResult for the reason.
 */
export function bufferMultiPolygon(
  polygons: MultiPolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return bufferMultiPolygonResult(polygons, distance, options).value;
}

export function bufferPolygonResult(
  polygon: PolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): OffsetResult {
  return bufferMultiPolygonResult([polygon], distance, options);
}

export function bufferPolygon(
  polygon: PolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return bufferPolygonResult(polygon, distance, options).value;
}

/** CAD-friendly alias for bufferPolygonResult. */
export function offsetPolygonResult(
  polygon: PolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): OffsetResult {
  return bufferPolygonResult(polygon, distance, options);
}

/** CAD-friendly alias for bufferPolygon. */
export function offsetPolygon(
  polygon: PolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return offsetPolygonResult(polygon, distance, options).value;
}

/** CAD-friendly alias for bufferMultiPolygonResult. */
export function offsetMultiPolygonResult(
  polygons: MultiPolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): OffsetResult {
  return bufferMultiPolygonResult(polygons, distance, options);
}

/** CAD-friendly alias for bufferMultiPolygon. */
export function offsetMultiPolygon(
  polygons: MultiPolygonGeometry,
  distance: number,
  options: BufferOptions = {},
): MultiPolygonGeometry {
  return offsetMultiPolygonResult(polygons, distance, options).value;
}
