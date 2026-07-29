import { signedRingArea } from './area';
import { normalizePolygon, normalizeRing } from './normalize';
import {
  clamp,
  CORNER_ANGLE_TOLERANCE,
  cross,
  DIRECTION_TOLERANCE,
  distance,
  dot,
  isFinitePoint,
  isFiniteRing,
  pointsAlmostEqual,
} from './numeric';
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
const SINGLE_CORNER_EDGE_LIMIT = 0.999999;

function edgeConsumptionLimit(edgeLength: number, adjacentSelected: boolean): number {
  return edgeLength * (adjacentSelected ? EDGE_FRACTION_LIMIT : SINGLE_CORNER_EDGE_LIMIT);
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

type SelectedCorner = {
  vertex: Point;
  previous: Point;
  next: Point;
  previousLength: number;
  nextLength: number;
  previousSelected: boolean;
  nextSelected: boolean;
};

/**
 * Shared corner-edit skeleton. Invalid rings fail once, while unselected and
 * locally degenerate corners pass through unchanged for both edit strategies.
 */
function mapSelectedCorners(
  ring: Ring,
  selection: RingVertexSelection | undefined,
  mapper: (corner: SelectedCorner) => readonly Point[] | null,
): Ring | null {
  if (ring.length < 3 || !isFiniteRing(ring)) return null;
  const selected = selectedVertices(ring.length, selection);
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
    const mapped = mapper({
      vertex,
      previous,
      next,
      previousLength,
      nextLength,
      previousSelected: selected.has(
        (index - 1 + ring.length) % ring.length,
      ),
      nextSelected: selected.has((index + 1) % ring.length),
    });
    if (mapped === null || !mapped.every(isFinitePoint)) return null;
    for (const point of mapped) appendPoint(result, point);
  }
  return normalizeRing(result);
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
  if (!Number.isFinite(distanceAlongEdge)) return null;
  if (distanceAlongEdge < 0) return null;
  if (distanceAlongEdge === 0) return normalizeRing([...ring]);
  return mapSelectedCorners(ring, options.vertices, ({
    vertex,
    previous,
    next,
    previousLength,
    nextLength,
    previousSelected,
    nextSelected,
  }) => {
    // Split an edge only when both of its endpoint corners are edited. A
    // single selected corner may consume almost the full adjacent edge.
    const cut = Math.min(
      distanceAlongEdge,
      edgeConsumptionLimit(previousLength, previousSelected),
      edgeConsumptionLimit(nextLength, nextSelected),
    );
    if (!(cut > 0)) return [vertex];
    return [
      {
        x: vertex.x + ((previous.x - vertex.x) * cut) / previousLength,
        y: vertex.y + ((previous.y - vertex.y) * cut) / previousLength,
      },
      {
        x: vertex.x + ((next.x - vertex.x) * cut) / nextLength,
        y: vertex.y + ((next.y - vertex.y) * cut) / nextLength,
      },
    ];
  });
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
  if (
    ring.length < 3 ||
    !isFiniteRing(ring) ||
    !Number.isFinite(radius)
  ) {
    return null;
  }
  if (radius < 0) return null;
  if (radius === 0) return normalizeRing([...ring]);
  const winding = Math.sign(signedRingArea(ring));
  if (winding === 0) return null;

  const perQuarter = segmentCount(options.segmentsPerQuarter);
  return mapSelectedCorners(ring, options.vertices, ({
    vertex,
    previous,
    next,
    previousLength,
    nextLength,
    previousSelected,
    nextSelected,
  }) => {
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
      Math.abs(turn) <= DIRECTION_TOLERANCE ||
      !(angle > CORNER_ANGLE_TOLERANCE) ||
      !(Math.PI - angle > CORNER_ANGLE_TOLERANCE) ||
      !(bisectorLength > EPS) ||
      !(tangentFactor > 0) ||
      !Number.isFinite(tangentFactor) ||
      !(sineHalf > 0)
    ) {
      return [vertex];
    }

    const requestedTangent = radius / tangentFactor;
    const tangent = Math.min(
      requestedTangent,
      edgeConsumptionLimit(previousLength, previousSelected),
      edgeConsumptionLimit(nextLength, nextSelected),
    );
    if (!(tangent > 0) || !Number.isFinite(tangent)) {
      return [vertex];
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
    if (![center, start, end].every(isFinitePoint)) return null;

    // The angle between the two edge rays is supplementary to the circular
    // arc's central angle. previousUnit x nextUnit has the opposite sign to
    // the path's incoming x outgoing turn, so concave vertices sweep in the
    // opposite direction while using the same tangent construction.
    const convex = turn * winding < 0;
    const sweep = (convex ? winding : -winding) * (Math.PI - angle);
    const steps = Math.max(
      1,
      Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * perQuarter),
    );
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const points: Ring = [];
    for (let step = 0; step <= steps; step++) {
      if (step === steps) {
        points.push(end);
      } else {
        const theta = startAngle + (sweep * step) / steps;
        points.push({
          x: center.x + Math.cos(theta) * effectiveRadius,
          y: center.y + Math.sin(theta) * effectiveRadius,
        });
      }
    }
    return points;
  });
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
