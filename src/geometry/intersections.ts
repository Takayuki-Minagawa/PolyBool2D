import type { Point } from './types';
import { EPS } from './types';

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
  const denom = dxA * dyB - dyA * dxB;

  if (Math.abs(denom) < EPS) {
    const cross = (b1.x - a1.x) * dyA - (b1.y - a1.y) * dxA;
    if (Math.abs(cross) > EPS) return { type: 'none' };
    const lenA2 = dxA * dxA + dyA * dyA;
    if (lenA2 < EPS) return { type: 'none' };
    const tB1 = ((b1.x - a1.x) * dxA + (b1.y - a1.y) * dyA) / lenA2;
    const tB2 = ((b2.x - a1.x) * dxA + (b2.y - a1.y) * dyA) / lenA2;
    const t0 = Math.max(0, Math.min(tB1, tB2));
    const t1 = Math.min(1, Math.max(tB1, tB2));
    if (t0 > t1 + EPS) return { type: 'none' };
    if (Math.abs(t0 - t1) < EPS) {
      return {
        type: 'point',
        point: { x: a1.x + t0 * dxA, y: a1.y + t0 * dyA },
        tA: t0,
        tB: tB1 <= tB2 ? 0 : 1,
      };
    }
    return {
      type: 'overlap',
      points: [
        { x: a1.x + t0 * dxA, y: a1.y + t0 * dyA },
        { x: a1.x + t1 * dxA, y: a1.y + t1 * dyA },
      ],
    };
  }

  const tA = ((b1.x - a1.x) * dyB - (b1.y - a1.y) * dxB) / denom;
  const tB = ((b1.x - a1.x) * dyA - (b1.y - a1.y) * dxA) / denom;

  if (tA < -EPS || tA > 1 + EPS || tB < -EPS || tB > 1 + EPS) {
    return { type: 'none' };
  }
  const tAc = Math.max(0, Math.min(1, tA));
  return {
    type: 'point',
    point: { x: a1.x + tAc * dxA, y: a1.y + tAc * dyA },
    tA: tAc,
    tB: Math.max(0, Math.min(1, tB)),
  };
}

export function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-30) + xi;
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
