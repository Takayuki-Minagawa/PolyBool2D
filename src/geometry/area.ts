import type {
  MultiPolygonGeometry,
  PolygonGeometry,
  Point,
  Ring,
} from './types';
import {
  addCompensated,
  compensatedTotal,
  createCompensatedSum,
} from './numeric';

export function signedRingArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  const origin = ring[0];
  const sum = createCompensatedSum();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ax = a.x - origin.x;
    const ay = a.y - origin.y;
    const bx = b.x - origin.x;
    const by = b.y - origin.y;
    addCompensated(sum, ax * by - bx * ay);
  }
  return compensatedTotal(sum) / 2;
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
  if (ring.length === 0) return { x: 0, y: 0 };
  const origin = ring[0];
  const crossSum = createCompensatedSum();
  const cxSum = createCompensatedSum();
  const cySum = createCompensatedSum();
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % ring.length];
    const x0 = p0.x - origin.x;
    const y0 = p0.y - origin.y;
    const x1 = p1.x - origin.x;
    const y1 = p1.y - origin.y;
    const cross = x0 * y1 - x1 * y0;
    addCompensated(crossSum, cross);
    addCompensated(cxSum, (x0 + x1) * cross);
    addCompensated(cySum, (y0 + y1) * cross);
  }

  const crossTotal = compensatedTotal(crossSum);
  if (Math.abs(crossTotal) < 1e-18) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / ring.length, y: sy / ring.length };
  }
  const denom = 3 * crossTotal;
  return {
    x: origin.x + compensatedTotal(cxSum) / denom,
    y: origin.y + compensatedTotal(cySum) / denom,
  };
}
