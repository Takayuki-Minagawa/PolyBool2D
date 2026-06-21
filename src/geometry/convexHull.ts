import type { Point, Ring } from './types';
import { cross } from './numeric';

/**
 * Convex hull of a point set using Andrew's monotone chain.
 * Returns a CCW ring without a repeated closing point, or null when fewer
 * than 3 non-collinear points are supplied.
 */
export function convexHull(points: Point[]): Ring | null {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  // Remove exact duplicates after sorting.
  const unique: Point[] = [];
  for (const p of pts) {
    const last = unique[unique.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) unique.push(p);
  }
  if (unique.length < 3) return null;

  const turn = (o: Point, a: Point, b: Point): number =>
    cross(a.x - o.x, a.y - o.y, b.x - o.x, b.y - o.y);

  const lower: Point[] = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (
      upper.length >= 2 &&
      turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return null;
  return hull;
}
