import type { Point, Ring } from './types';
import { EPS } from './types';

export const EPS_SQ = EPS * EPS;

const MIN_PARAMETER_TOLERANCE = 1e-12;

export type CompensatedSum = {
  sum: number;
  correction: number;
};

export function createCompensatedSum(): CompensatedSum {
  return { sum: 0, correction: 0 };
}

export function addCompensated(acc: CompensatedSum, value: number): void {
  const next = acc.sum + value;
  if (Math.abs(acc.sum) >= Math.abs(value)) {
    acc.correction += acc.sum - next + value;
  } else {
    acc.correction += value - next + acc.sum;
  }
  acc.sum = next;
}

export function compensatedTotal(acc: CompensatedSum): number {
  return acc.sum + acc.correction;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function distanceSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a: Point, b: Point): number {
  return Math.sqrt(distanceSq(a, b));
}

export function pointsAlmostEqual(a: Point, b: Point, eps = EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function segmentLength(a: Point, b: Point): number {
  return Math.sqrt(distanceSq(a, b));
}

export function segmentParameter(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPS_SQ) return 0;
  return dot(point.x - a.x, point.y - a.y, dx, dy) / len2;
}

export function orientationTolerance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  eps = EPS,
): number {
  return eps * Math.max(1, Math.hypot(ax, ay) * Math.hypot(bx, by));
}

export function linePointTolerance(ax: number, ay: number, eps = EPS): number {
  return eps * Math.max(1, Math.hypot(ax, ay));
}

export function parameterTolerance(segmentLen: number, eps = EPS): number {
  return Math.max(MIN_PARAMETER_TOLERANCE, eps / Math.max(1, segmentLen));
}

export function pointOnSegment(
  point: Point,
  a: Point,
  b: Point,
  eps = EPS,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= eps * eps) return pointsAlmostEqual(point, a, eps);

  const apx = point.x - a.x;
  const apy = point.y - a.y;
  if (Math.abs(cross(dx, dy, apx, apy)) > linePointTolerance(dx, dy, eps)) {
    return false;
  }

  const len = Math.sqrt(len2);
  const t = dot(apx, apy, dx, dy) / len2;
  const tEps = parameterTolerance(len, eps);
  return t >= -tEps && t <= 1 + tEps;
}

export function ringCoordinateTolerance(ring: Ring, eps = EPS): number {
  if (ring.length === 0) return eps;
  let minX = ring[0].x;
  let maxX = ring[0].x;
  let minY = ring[0].y;
  let maxY = ring[0].y;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return eps * Math.max(1, maxX - minX, maxY - minY);
}

export function ringAreaTolerance(ring: Ring, eps = EPS): number {
  return ringCoordinateTolerance(ring, eps) * Math.max(1, ring.length);
}
