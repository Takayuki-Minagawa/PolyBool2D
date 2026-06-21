import type { Point, Ring } from './types';

/**
 * Insert `point` into `ring` after position `index` (i.e. on the edge from
 * vertex `index` to `index + 1`). `index` is clamped into range.
 */
export function insertVertexInRing(ring: Ring, index: number, point: Point): Ring {
  const i = Math.max(0, Math.min(ring.length - 1, index));
  const out = [...ring];
  out.splice(i + 1, 0, point);
  return out;
}

/**
 * Remove the vertex at `index`. Returns null when the ring would have fewer
 * than 3 vertices afterwards (callers should reject the edit in that case).
 */
export function deleteVertexFromRing(ring: Ring, index: number): Ring | null {
  if (index < 0 || index >= ring.length) return ring;
  if (ring.length <= 3) return null;
  const out = [...ring];
  out.splice(index, 1);
  return out;
}
