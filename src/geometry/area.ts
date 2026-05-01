import type {
  MultiPolygonGeometry,
  PolygonGeometry,
  Point,
  Ring,
} from './types';

export function signedRingArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function ringIsCCW(ring: Ring): boolean {
  return signedRingArea(ring) > 0;
}

export function polygonArea(poly: PolygonGeometry): number {
  const outer = Math.abs(signedRingArea(poly.outer));
  const holes = poly.holes.reduce(
    (acc, h) => acc + Math.abs(signedRingArea(h)),
    0,
  );
  return outer - holes;
}

export function multiPolygonArea(mp: MultiPolygonGeometry): number {
  return mp.reduce((acc, p) => acc + polygonArea(p), 0);
}

export function ringCentroid(ring: Ring): Point {
  const a = signedRingArea(ring);
  if (Math.abs(a) < 1e-18) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / ring.length, y: sy / ring.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % ring.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  const denom = 6 * a;
  return { x: cx / denom, y: cy / denom };
}
