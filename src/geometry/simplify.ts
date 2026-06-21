import type { Point, Ring } from './types';

/** Perpendicular distance from `p` to the line through `a` and `b`. */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Douglas-Peucker on an open polyline (endpoints are always kept). */
export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
    const right = simplifyPolyline(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * Simplify a closed ring with Douglas-Peucker. The ring is treated as a loop;
 * the first vertex is preserved as an anchor. Returns the original ring when
 * simplification would drop below 3 vertices.
 */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 3 || tolerance <= 0) return ring;
  // Open the loop by appending a copy of the first vertex, simplify, then
  // drop the duplicated endpoint.
  const open = [...ring, ring[0]];
  const simplified = simplifyPolyline(open, tolerance);
  const result = simplified.slice(0, -1);
  if (result.length < 3) return ring;
  return result;
}
