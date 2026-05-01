import type { Point } from './types';
import {
  EPS_SQ,
  clamp01,
  cross,
  distanceSq,
  linePointTolerance,
  lerpPoint,
  orientationTolerance,
  parameterTolerance,
  pointOnSegment,
  pointsAlmostEqual,
  segmentParameter,
} from './numeric';

export type SegmentIntersectionResult =
  | { type: 'none' }
  | { type: 'point'; point: Point; tA: number; tB: number }
  | { type: 'overlap'; points: [Point, Point] };

export function segmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): SegmentIntersectionResult {
  const dxA = a2.x - a1.x;
  const dyA = a2.y - a1.y;
  const dxB = b2.x - b1.x;
  const dyB = b2.y - b1.y;
  const lenA2 = distanceSq(a1, a2);
  const lenB2 = distanceSq(b1, b2);

  if (lenA2 <= EPS_SQ && lenB2 <= EPS_SQ) {
    return pointsAlmostEqual(a1, b1)
      ? { type: 'point', point: a1, tA: 0, tB: 0 }
      : { type: 'none' };
  }

  if (lenA2 <= EPS_SQ) {
    if (!pointOnSegment(a1, b1, b2)) return { type: 'none' };
    return {
      type: 'point',
      point: a1,
      tA: 0,
      tB: clamp01(segmentParameter(a1, b1, b2)),
    };
  }

  if (lenB2 <= EPS_SQ) {
    if (!pointOnSegment(b1, a1, a2)) return { type: 'none' };
    return {
      type: 'point',
      point: b1,
      tA: clamp01(segmentParameter(b1, a1, a2)),
      tB: 0,
    };
  }

  const lenA = Math.sqrt(lenA2);
  const lenB = Math.sqrt(lenB2);
  const denom = cross(dxA, dyA, dxB, dyB);
  const denomTol = orientationTolerance(dxA, dyA, dxB, dyB);

  if (Math.abs(denom) <= denomTol) {
    const b1x = b1.x - a1.x;
    const b1y = b1.y - a1.y;
    const b2x = b2.x - a1.x;
    const b2y = b2.y - a1.y;
    const lineTol = linePointTolerance(dxA, dyA);
    if (
      Math.abs(cross(b1x, b1y, dxA, dyA)) > lineTol ||
      Math.abs(cross(b2x, b2y, dxA, dyA)) > lineTol
    ) {
      return { type: 'none' };
    }

    const tB1 = segmentParameter(b1, a1, a2);
    const tB2 = segmentParameter(b2, a1, a2);
    const t0 = Math.max(0, Math.min(tB1, tB2));
    const t1 = Math.min(1, Math.max(tB1, tB2));
    const tEps = parameterTolerance(lenA);
    if (t0 > t1 + tEps) return { type: 'none' };
    if (Math.abs(t0 - t1) <= tEps) {
      const t = clamp01((t0 + t1) / 2);
      const point = lerpPoint(a1, a2, t);
      return {
        type: 'point',
        point,
        tA: t,
        tB: clamp01(segmentParameter(point, b1, b2)),
      };
    }
    const start = clamp01(t0);
    const end = clamp01(t1);
    return {
      type: 'overlap',
      points: [
        lerpPoint(a1, a2, start),
        lerpPoint(a1, a2, end),
      ],
    };
  }

  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const tA = cross(qx, qy, dxB, dyB) / denom;
  const tB = cross(qx, qy, dxA, dyA) / denom;
  const tAEps = parameterTolerance(lenA);
  const tBEps = parameterTolerance(lenB);

  if (tA < -tAEps || tA > 1 + tAEps || tB < -tBEps || tB > 1 + tBEps) {
    return { type: 'none' };
  }
  const tAc = clamp01(tA);
  return {
    type: 'point',
    point: lerpPoint(a1, a2, tAc),
    tA: tAc,
    tB: clamp01(tB),
  };
}

export function pointInRing(point: Point, ring: Point[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    if (pointOnSegment(point, ring[j], ring[i])) return true;
    const straddlesY = (yi > point.y) !== (yj > point.y);
    // When the edge straddles point.y, yj - yi is non-zero.
    const intersect =
      straddlesY &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(
  point: Point,
  polygon: { outer: Point[]; holes: Point[][] },
): boolean {
  if (!pointInRing(point, polygon.outer)) return false;
  for (const h of polygon.holes) {
    if (pointInRing(point, h)) return false;
  }
  return true;
}
