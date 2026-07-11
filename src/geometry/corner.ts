import { signedRingArea } from './area';
import { normalizePolygon, normalizeRing } from './normalize';
import { clamp, cross, distance, dot, pointsAlmostEqual } from './numeric';
import type { Point, PolygonGeometry, Ring } from './types';
import { EPS } from './types';

export type RingVertexSelection = 'all' | readonly number[];

export type RingCornerOptions = {
  /** Omit (or use "all") to process every vertex. */
  vertices?: RingVertexSelection;
};

export type FilletOptions = RingCornerOptions & {
  /** Number of line segments used for a 90-degree arc. */
  segmentsPerQuarter?: number;
};

export type PolygonCornerSelection = {
  outer?: RingVertexSelection;
  holes?: Readonly<Partial<Record<number, RingVertexSelection>>>;
};

export type PolygonCornerOptions = {
  /** Omit to process every vertex of the outer ring and every hole. */
  selection?: PolygonCornerSelection;
};

export type PolygonFilletOptions = PolygonCornerOptions & {
  segmentsPerQuarter?: number;
};

const MAX_SEGMENTS_PER_QUARTER = 256;
const DEFAULT_SEGMENTS_PER_QUARTER = 4;
const EDGE_FRACTION_LIMIT = 0.499;

function finiteRing(ring: Ring): boolean {
  return (
    ring.length >= 3 &&
    ring.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}
function selectedVertices(
  length: number,
  selection: RingVertexSelection | undefined,
): Set<number> {
  if (selection === undefined || selection === 'all') {
    return new Set(Array.from({ length }, (_, index) => index));
  }
  return new Set(
    selection.filter(
      (index) => Number.isInteger(index) && index >= 0 && index < length,
    ),
  );
}

function appendPoint(points: Ring, point: Point): void {
  const last = points[points.length - 1];
  if (!last || !pointsAlmostEqual(last, point)) points.push(point);
}

function selectionForOuter(
  selection: PolygonCornerSelection | undefined,
): RingVertexSelection {
  return selection === undefined ? 'all' : selection.outer ?? [];
}

function selectionForHole(
  selection: PolygonCornerSelection | undefined,
  index: number,
): RingVertexSelection {
  return selection === undefined ? 'all' : selection.holes?.[index] ?? [];
}

/** Replace selected vertices with straight cuts at `distance` along each edge. */
export function chamferRing(
  ring: Ring,
  distanceAlongEdge: number,
  options: RingCornerOptions = {},
): Ring | null {
  if (!finiteRing(ring) || !Number.isFinite(distanceAlongEdge)) return null;
  if (distanceAlongEdge < 0) return null;
  if (distanceAlongEdge === 0) return normalizeRing([...ring]);

  const selected = selectedVertices(ring.length, options.vertices);
  const result: Ring = [];
  for (let index = 0; index < ring.length; index++) {
    const vertex = ring[index];
    if (!selected.has(index)) {
      appendPoint(result, vertex);
      continue;
    }

    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const previousLength = distance(vertex, previous);
    const nextLength = distance(vertex, next);
    if (!(previousLength > EPS) || !(nextLength > EPS)) {
      appendPoint(result, vertex);
      continue;
    }

    // Limiting each end to just under half an edge prevents adjacent corner
    // edits from crossing when all vertices are processed together.
    const cut = Math.min(
      distanceAlongEdge,
      previousLength * EDGE_FRACTION_LIMIT,
      nextLength * EDGE_FRACTION_LIMIT,
    );
    if (!(cut > 0)) {
      appendPoint(result, vertex);
      continue;
    }
    appendPoint(result, {
      x: vertex.x + ((previous.x - vertex.x) * cut) / previousLength,
      y: vertex.y + ((previous.y - vertex.y) * cut) / previousLength,
    });
    appendPoint(result, {
      x: vertex.x + ((next.x - vertex.x) * cut) / nextLength,
      y: vertex.y + ((next.y - vertex.y) * cut) / nextLength,
    });
  }
  return normalizeRing(result);
}

function segmentCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SEGMENTS_PER_QUARTER;
  }
  return Math.max(1, Math.min(MAX_SEGMENTS_PER_QUARTER, Math.floor(value)));
}

/**
 * Replace selected vertices with tangent circular arcs.
 *
 * `radius` is honoured when adjacent edges are long enough; otherwise it is
 * reduced locally so neighbouring corner edits cannot cross on an edge.
 */
export function filletRing(
  ring: Ring,
  radius: number,
  options: FilletOptions = {},
): Ring | null {
  if (!finiteRing(ring) || !Number.isFinite(radius)) return null;
  if (radius < 0) return null;
  if (radius === 0) return normalizeRing([...ring]);
  const winding = Math.sign(signedRingArea(ring));
  if (winding === 0) return null;

  const selected = selectedVertices(ring.length, options.vertices);
  const perQuarter = segmentCount(options.segmentsPerQuarter);
  const result: Ring = [];

  for (let index = 0; index < ring.length; index++) {
    const vertex = ring[index];
    if (!selected.has(index)) {
      appendPoint(result, vertex);
      continue;
    }

    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const previousLength = distance(vertex, previous);
    const nextLength = distance(vertex, next);
    if (!(previousLength > EPS) || !(nextLength > EPS)) {
      appendPoint(result, vertex);
      continue;
    }

    const previousUnit = {
      x: (previous.x - vertex.x) / previousLength,
      y: (previous.y - vertex.y) / previousLength,
    };
    const nextUnit = {
      x: (next.x - vertex.x) / nextLength,
      y: (next.y - vertex.y) / nextLength,
    };
    const cosine = clamp(
      dot(previousUnit.x, previousUnit.y, nextUnit.x, nextUnit.y),
      -1,
      1,
    );
    const angle = Math.acos(cosine);
    const turn = cross(
      previousUnit.x,
      previousUnit.y,
      nextUnit.x,
      nextUnit.y,
    );
    const bisectorX = previousUnit.x + nextUnit.x;
    const bisectorY = previousUnit.y + nextUnit.y;
    const bisectorLength = Math.hypot(bisectorX, bisectorY);
    const tangentFactor = Math.tan(angle / 2);
    const sineHalf = Math.sin(angle / 2);
    if (
      Math.abs(turn) <= 1e-12 ||
      !(angle > 1e-8) ||
      !(Math.PI - angle > 1e-8) ||
      !(bisectorLength > EPS) ||
      !(tangentFactor > 0) ||
      !Number.isFinite(tangentFactor) ||
      !(sineHalf > 0)
    ) {
      appendPoint(result, vertex);
      continue;
    }

    const requestedTangent = radius / tangentFactor;
    const tangent = Math.min(
      requestedTangent,
      previousLength * EDGE_FRACTION_LIMIT,
      nextLength * EDGE_FRACTION_LIMIT,
    );
    if (!(tangent > 0) || !Number.isFinite(tangent)) {
      appendPoint(result, vertex);
      continue;
    }

    const effectiveRadius = tangent * tangentFactor;
    const centerDistance = effectiveRadius / sineHalf;
    const center = {
      x: vertex.x + (bisectorX / bisectorLength) * centerDistance,
      y: vertex.y + (bisectorY / bisectorLength) * centerDistance,
    };
    const start = {
      x: vertex.x + previousUnit.x * tangent,
      y: vertex.y + previousUnit.y * tangent,
    };
    const end = {
      x: vertex.x + nextUnit.x * tangent,
      y: vertex.y + nextUnit.y * tangent,
    };
    if (![center, start, end].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
      return null;
    }

    // previousUnit x nextUnit has the opposite sign to the path's ordinary
    // incoming x outgoing turn. Concave vertices take the opposite sweep.
    const convex = turn * winding < 0;
    const sweep = (convex ? winding : -winding) * angle;
    const steps = Math.max(
      1,
      Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * perQuarter),
    );
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    for (let step = 0; step <= steps; step++) {
      if (step === steps) {
        appendPoint(result, end);
      } else {
        const theta = startAngle + (sweep * step) / steps;
        appendPoint(result, {
          x: center.x + Math.cos(theta) * effectiveRadius,
          y: center.y + Math.sin(theta) * effectiveRadius,
        });
      }
    }
  }

  return normalizeRing(result);
}

export function chamferPolygon(
  polygon: PolygonGeometry,
  distanceAlongEdge: number,
  options: PolygonCornerOptions = {},
): PolygonGeometry | null {
  const outer = chamferRing(polygon.outer, distanceAlongEdge, {
    vertices: selectionForOuter(options.selection),
  });
  if (!outer) return null;
  const holes: Ring[] = [];
  for (let index = 0; index < polygon.holes.length; index++) {
    const hole = chamferRing(polygon.holes[index], distanceAlongEdge, {
      vertices: selectionForHole(options.selection, index),
    });
    if (!hole) return null;
    holes.push(hole);
  }
  return normalizePolygon({ outer, holes });
}

export function filletPolygon(
  polygon: PolygonGeometry,
  radius: number,
  options: PolygonFilletOptions = {},
): PolygonGeometry | null {
  const outer = filletRing(polygon.outer, radius, {
    vertices: selectionForOuter(options.selection),
    segmentsPerQuarter: options.segmentsPerQuarter,
  });
  if (!outer) return null;
  const holes: Ring[] = [];
  for (let index = 0; index < polygon.holes.length; index++) {
    const hole = filletRing(polygon.holes[index], radius, {
      vertices: selectionForHole(options.selection, index),
      segmentsPerQuarter: options.segmentsPerQuarter,
    });
    if (!hole) return null;
    holes.push(hole);
  }
  return normalizePolygon({ outer, holes });
}
