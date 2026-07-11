import { polygonArea, signedRingArea } from './area';
import { segmentIntersection } from './intersections';
import { defaultEngine } from './polygonClippingEngine';
import type { Point, PolygonGeometry, Ring } from './types';
import {
  pointsAlmostEqual,
  ringAreaTolerance,
  ringCoordinateTolerance,
} from './numeric';

export type KnifeSplitResult =
  | { ok: true; polygons: PolygonGeometry[] }
  | {
      ok: false;
      reason: 'no-intersection' | 'not-two-intersections' | 'has-holes';
    };

type BoundaryIntersections = {
  points: Point[];
  outerPoints: Point[];
  hasOverlap: boolean;
};

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function boundaryIntersections(
  polygon: PolygonGeometry,
  knifeStart: Point,
  knifeEnd: Point,
): BoundaryIntersections {
  const tolerance = ringCoordinateTolerance([
    ...polygon.outer,
    ...polygon.holes.flat(),
  ]);
  const points: Point[] = [];
  const outerPoints: Point[] = [];
  let hasOverlap = false;

  for (const [ringIndex, ring] of [polygon.outer, ...polygon.holes].entries()) {
    for (let index = 0; index < ring.length; index++) {
      const result = segmentIntersection(
        knifeStart,
        knifeEnd,
        ring[index],
        ring[(index + 1) % ring.length],
      );
      if (result.type === 'overlap') {
        hasOverlap = true;
      } else if (result.type === 'point') {
        if (
          !points.some((point) =>
            pointsAlmostEqual(point, result.point, tolerance),
          )
        ) {
          points.push(result.point);
        }
        if (
          ringIndex === 0 &&
          !outerPoints.some((point) =>
            pointsAlmostEqual(point, result.point, tolerance),
          )
        ) {
          outerPoints.push(result.point);
        }
      }
    }
  }
  return { points, outerPoints, hasOverlap };
}

function extendKnifeAcrossPolygon(
  polygon: PolygonGeometry,
  knifeStart: Point,
  knifeEnd: Point,
): [Point, Point] | null {
  const dx = knifeEnd.x - knifeStart.x;
  const dy = knifeEnd.y - knifeStart.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const direction = { x: dx / length, y: dy / length };
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  for (const point of [polygon.outer, ...polygon.holes].flat()) {
    const along =
      (point.x - knifeStart.x) * direction.x +
      (point.y - knifeStart.y) * direction.y;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
  }
  const span = Math.max(1, length, maxAlong - minAlong);
  const padding = span * 4;
  const low = minAlong - padding;
  const high = maxAlong + padding;
  const extendedStart = {
    x: knifeStart.x + direction.x * low,
    y: knifeStart.y + direction.y * low,
  };
  const extendedEnd = {
    x: knifeStart.x + direction.x * high,
    y: knifeStart.y + direction.y * high,
  };
  return finitePoint(extendedStart) && finitePoint(extendedEnd)
    ? [extendedStart, extendedEnd]
    : null;
}

function sameContacts(
  polygon: PolygonGeometry,
  finite: Point[],
  extended: Point[],
): boolean {
  if (finite.length !== extended.length) return false;
  const tolerance = ringCoordinateTolerance([
    ...polygon.outer,
    ...polygon.holes.flat(),
  ]);
  return extended.every((contact) =>
    finite.some((point) => pointsAlmostEqual(point, contact, tolerance)),
  );
}

type KnifeBasis = {
  origin: Point;
  direction: Point;
  normal: Point;
};

function worldPoint(basis: KnifeBasis, along: number, side: number): Point {
  return {
    x:
      basis.origin.x +
      basis.direction.x * along +
      basis.normal.x * side,
    y:
      basis.origin.y +
      basis.direction.y * along +
      basis.normal.y * side,
  };
}

function makeHalfPlanes(
  polygon: PolygonGeometry,
  knifeStart: Point,
  knifeEnd: Point,
): [PolygonGeometry, PolygonGeometry] | null {
  const dx = knifeEnd.x - knifeStart.x;
  const dy = knifeEnd.y - knifeStart.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const basis: KnifeBasis = {
    origin: knifeStart,
    direction: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
  };

  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minSide = Infinity;
  let maxSide = -Infinity;
  for (const point of [polygon.outer, ...polygon.holes].flat()) {
    const px = point.x - basis.origin.x;
    const py = point.y - basis.origin.y;
    const along = px * basis.direction.x + py * basis.direction.y;
    const side = px * basis.normal.x + py * basis.normal.y;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minSide = Math.min(minSide, side);
    maxSide = Math.max(maxSide, side);
  }
  const span = Math.max(
    1,
    length,
    maxAlong - minAlong,
    maxSide - minSide,
  );
  const padding = span * 4;
  const alongLow = minAlong - padding;
  const alongHigh = maxAlong + padding;
  const sideLow = Math.min(minSide, 0) - padding;
  const sideHigh = Math.max(maxSide, 0) + padding;
  if (
    ![
      alongLow,
      alongHigh,
      sideLow,
      sideHigh,
      padding,
    ].every(Number.isFinite)
  ) {
    return null;
  }

  const negative: PolygonGeometry = {
    outer: [
      worldPoint(basis, alongLow, sideLow),
      worldPoint(basis, alongHigh, sideLow),
      worldPoint(basis, alongHigh, 0),
      worldPoint(basis, alongLow, 0),
    ],
    holes: [],
  };
  const positive: PolygonGeometry = {
    outer: [
      worldPoint(basis, alongLow, 0),
      worldPoint(basis, alongHigh, 0),
      worldPoint(basis, alongHigh, sideHigh),
      worldPoint(basis, alongLow, sideHigh),
    ],
    holes: [],
  };
  if (
    !negative.outer.every(finitePoint) ||
    !positive.outer.every(finitePoint)
  ) {
    return null;
  }
  return [negative, positive];
}

/**
 * Split a polygon by the line defined by a finite knife stroke.
 *
 * The stroke must meet the boundary at least twice. Unlike the original path
 * splice implementation, clipping against the two line half-planes supports
 * any even/multiple crossing pattern and polygons with holes. The cut has
 * zero width, so total material area is preserved.
 */
export function knifeSplitPolygon(
  polygon: PolygonGeometry,
  knifeStart: Point,
  knifeEnd: Point,
): KnifeSplitResult {
  if (
    !finitePoint(knifeStart) ||
    !finitePoint(knifeEnd) ||
    polygon.outer.length < 3 ||
    ![polygon.outer, ...polygon.holes]
      .flat()
      .every(finitePoint)
  ) {
    return { ok: false, reason: 'no-intersection' };
  }

  const contacts = boundaryIntersections(polygon, knifeStart, knifeEnd);
  if (contacts.hasOverlap) {
    return { ok: false, reason: 'not-two-intersections' };
  }
  if (contacts.points.length === 0) {
    return { ok: false, reason: 'no-intersection' };
  }
  // Preserve the old behaviour for a stroke that starts or ends inside and
  // therefore reaches only one boundary point.
  if (contacts.points.length < 2) {
    return { ok: false, reason: 'not-two-intersections' };
  }
  // Hole-boundary contacts alone do not cut the material from one outer side
  // to the other. Requiring two outer-boundary contacts prevents an internal
  // stroke across a void from invoking the infinite half-plane clip below.
  if (contacts.outerPoints.length < 2) {
    return { ok: false, reason: 'not-two-intersections' };
  }

  // Half-plane clipping represents an infinite line. It is valid for a finite
  // stroke only when that stroke covers every boundary contact made by the
  // line; otherwise remote portions of a concave polygon would be cut too.
  const extendedKnife = extendKnifeAcrossPolygon(polygon, knifeStart, knifeEnd);
  if (!extendedKnife) {
    return { ok: false, reason: 'not-two-intersections' };
  }
  const lineContacts = boundaryIntersections(
    polygon,
    extendedKnife[0],
    extendedKnife[1],
  );
  if (
    lineContacts.hasOverlap ||
    !sameContacts(polygon, contacts.points, lineContacts.points)
  ) {
    return { ok: false, reason: 'not-two-intersections' };
  }

  const halfPlanes = makeHalfPlanes(polygon, knifeStart, knifeEnd);
  if (!halfPlanes) return { ok: false, reason: 'not-two-intersections' };

  try {
    const negative = defaultEngine.intersection([polygon, halfPlanes[0]]);
    const positive = defaultEngine.intersection([polygon, halfPlanes[1]]);
    const minimumArea = ringAreaTolerance(polygon.outer);
    const negativePieces = negative.filter(
      (piece) => polygonArea(piece) > minimumArea,
    );
    const positivePieces = positive.filter(
      (piece) => polygonArea(piece) > minimumArea,
    );
    if (negativePieces.length === 0 || positivePieces.length === 0) {
      return { ok: false, reason: 'not-two-intersections' };
    }

    const polygons = [...negativePieces, ...positivePieces];
    if (polygons.length < 2) {
      return { ok: false, reason: 'not-two-intersections' };
    }
    const before = polygonArea(polygon);
    const after = polygons.reduce(
      (total, piece) => total + polygonArea(piece),
      0,
    );
    const areaTolerance = Math.max(
      minimumArea * 10,
      Math.abs(before) * 1e-8,
      1e-9,
    );
    if (
      !(before > minimumArea) ||
      !Number.isFinite(after) ||
      Math.abs(before - after) > areaTolerance
    ) {
      return { ok: false, reason: 'not-two-intersections' };
    }
    return { ok: true, polygons };
  } catch {
    return { ok: false, reason: 'not-two-intersections' };
  }
}

export function ringWindingMatches(a: Ring, b: Ring): boolean {
  return Math.sign(signedRingArea(a)) === Math.sign(signedRingArea(b));
}
