import { convexHull } from './convexHull';
import { dot } from './numeric';
import type {
  MultiPolygonGeometry,
  Point,
  PolygonGeometry,
  Ring,
} from './types';

export type MinimumAreaBoundingRectangle = {
  /** CCW corners without a repeated closing point. */
  corners: Ring;
  center: Point;
  /** Length along angleRad (canonicalized as the longer side). */
  width: number;
  height: number;
  area: number;
  /** Long-side angle in the half-open range [-PI/2, PI/2). */
  angleRad: number;
};

type Axes = {
  u: Point;
  v: Point;
};

function projections(points: Ring, axes: Axes) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const point of points) {
    const pu = dot(point.x, point.y, axes.u.x, axes.u.y);
    const pv = dot(point.x, point.y, axes.v.x, axes.v.y);
    minU = Math.min(minU, pu);
    maxU = Math.max(maxU, pu);
    minV = Math.min(minV, pv);
    maxV = Math.max(maxV, pv);
  }
  return { minU, maxU, minV, maxV };
}
function canonicalAxes(points: Ring, u: Point): Axes {
  let axes: Axes = { u, v: { x: -u.y, y: u.x } };
  const first = projections(points, axes);
  if (first.maxV - first.minV > first.maxU - first.minU) {
    axes = {
      u: axes.v,
      v: { x: -axes.u.x, y: -axes.u.y },
    };
  }

  let angle = Math.atan2(axes.u.y, axes.u.x);
  if (angle >= Math.PI / 2 || angle < -Math.PI / 2) {
    axes = {
      u: { x: -axes.u.x, y: -axes.u.y },
      v: { x: -axes.v.x, y: -axes.v.y },
    };
    angle = Math.atan2(axes.u.y, axes.u.x);
  }
  return axes;
}

function fromAxes(points: Ring, axes: Axes): MinimumAreaBoundingRectangle {
  const { minU, maxU, minV, maxV } = projections(points, axes);
  const toWorld = (u: number, v: number): Point => ({
    x: axes.u.x * u + axes.v.x * v,
    y: axes.u.y * u + axes.v.y * v,
  });
  const width = maxU - minU;
  const height = maxV - minV;
  return {
    corners: [
      toWorld(minU, minV),
      toWorld(maxU, minV),
      toWorld(maxU, maxV),
      toWorld(minU, maxV),
    ],
    center: toWorld((minU + maxU) / 2, (minV + maxV) / 2),
    width,
    height,
    area: width * height,
    angleRad: Math.atan2(axes.u.y, axes.u.x),
  };
}

/**
 * Minimum-area oriented rectangle of a point set.
 *
 * Candidate orientations are the edges of the convex hull (the standard
 * rotating-calipers observation). Degenerate/collinear or non-finite input
 * returns null.
 */
export function minimumAreaBoundingRectangle(
  points: readonly Point[],
): MinimumAreaBoundingRectangle | null {
  if (
    points.length < 3 ||
    points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) {
    return null;
  }
  const hull = convexHull([...points]);
  if (!hull) return null;

  let best: MinimumAreaBoundingRectangle | null = null;
  for (let index = 0; index < hull.length; index++) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0) || !Number.isFinite(length)) continue;
    const axes = canonicalAxes(hull, { x: dx / length, y: dy / length });
    const candidate = fromAxes(hull, axes);
    if (!Number.isFinite(candidate.area)) return null;
    if (!best) {
      best = candidate;
      continue;
    }
    const tolerance = 1e-12 * Math.max(1, best.area, candidate.area);
    if (
      candidate.area < best.area - tolerance ||
      (Math.abs(candidate.area - best.area) <= tolerance &&
        Math.abs(candidate.angleRad) < Math.abs(best.angleRad) - 1e-12)
    ) {
      best = candidate;
    }
  }
  return best;
}

export function minimumAreaBoundingRectangleForPolygon(
  polygon: PolygonGeometry,
): MinimumAreaBoundingRectangle | null {
  // Holes cannot enlarge the convex hull of a valid polygon.
  return minimumAreaBoundingRectangle(polygon.outer);
}

export function minimumAreaBoundingRectangleForMultiPolygon(
  polygons: MultiPolygonGeometry,
): MinimumAreaBoundingRectangle | null {
  return minimumAreaBoundingRectangle(
    polygons.flatMap((polygon) => polygon.outer),
  );
}
