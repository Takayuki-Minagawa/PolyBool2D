import {
  ARC_SWEEP_TOLERANCE,
  distance,
  isFinitePoint,
  pointsAlmostEqual,
} from './numeric';
import { ensureOuterCCW } from './normalize';
import type { Point, Ring } from './types';

const TAU = Math.PI * 2;

function normalizedSegments(segments: number, minimum: number): number {
  if (!Number.isFinite(segments)) return minimum;
  return Math.max(minimum, Math.min(4096, Math.round(segments)));
}

/** Approximate a rotated ellipse as a counter-clockwise polygon ring. */
export function ellipseToRing(
  center: Point,
  radiusX: number,
  radiusY: number,
  segments = 64,
  rotationRad = 0,
): Ring {
  if (
    !isFinitePoint(center) ||
    !Number.isFinite(radiusX) ||
    !Number.isFinite(radiusY) ||
    !Number.isFinite(rotationRad) ||
    radiusX <= 0 ||
    radiusY <= 0
  ) {
    return [];
  }
  const count = normalizedSegments(segments, 8);
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);
  const ring: Ring = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const localX = Math.cos(angle) * radiusX;
    const localY = Math.sin(angle) * radiusY;
    ring.push({
      x: center.x + localX * cosR - localY * sinR,
      y: center.y + localX * sinR + localY * cosR,
    });
  }
  return ensureOuterCCW(ring);
}

export type ArcDirection = 'clockwise' | 'counter-clockwise' | 'shortest';

function positiveAngle(angle: number): number {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

/**
 * Approximate a circular arc. The returned polyline includes both endpoints.
 * `segmentsPerCircle` controls the maximum angular step.
 */
export function arcToPolyline(
  center: Point,
  start: Point,
  end: Point,
  segmentsPerCircle = 64,
  direction: ArcDirection = 'shortest',
): Point[] {
  if (
    !isFinitePoint(center) ||
    !isFinitePoint(start) ||
    !isFinitePoint(end)
  ) {
    return [];
  }
  const radius = distance(center, start);
  if (!(radius > 0) || !Number.isFinite(radius)) return [];

  const endRadius = distance(center, end);
  if (!(endRadius > 0) || !Number.isFinite(endRadius)) return [];
  const endOnCircle = {
    x: center.x + ((end.x - center.x) / endRadius) * radius,
    y: center.y + ((end.y - center.y) / endRadius) * radius,
  };

  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(endOnCircle.y - center.y, endOnCircle.x - center.x);
  const ccwSweep = positiveAngle(endAngle - startAngle);
  const clockwiseSweep = ccwSweep - TAU;
  let sweep: number;
  if (direction === 'counter-clockwise') sweep = ccwSweep;
  else if (direction === 'clockwise') sweep = clockwiseSweep;
  else sweep = ccwSweep <= Math.PI ? ccwSweep : clockwiseSweep;

  if (
    pointsAlmostEqual(start, endOnCircle) &&
    Math.abs(sweep) < ARC_SWEEP_TOLERANCE
  ) {
    return [{ ...start }];
  }

  const perCircle = normalizedSegments(segmentsPerCircle, 8);
  const segmentCount = Math.max(1, Math.ceil((Math.abs(sweep) / TAU) * perCircle));
  const points: Point[] = [];
  for (let i = 0; i <= segmentCount; i++) {
    const angle = startAngle + sweep * (i / segmentCount);
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  points[0] = { ...start };
  points[points.length - 1] = endOnCircle;
  return points;
}

/** Return the angle ABC in radians in the inclusive range [0, PI]. */
export function angleAtPoint(a: Point, b: Point, c: Point): number | null {
  if (!isFinitePoint(a) || !isFinitePoint(b) || !isFinitePoint(c)) return null;
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const leftLength = Math.hypot(bax, bay);
  const rightLength = Math.hypot(bcx, bcy);
  if (!(leftLength > 0) || !(rightLength > 0)) return null;
  const cosine = Math.max(
    -1,
    Math.min(1, (bax * bcx + bay * bcy) / (leftLength * rightLength)),
  );
  return Math.acos(cosine);
}

/** Sum the length of an open polyline. */
export function polylineLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i - 1], points[i]);
  }
  return length;
}
