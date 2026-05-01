import { signedRingArea } from './area';
import type {
  MultiPolygonGeometry,
  PolygonGeometry,
  Point,
  Ring,
} from './types';
import { EPS } from './types';
import { pointsAlmostEqual, ringAreaTolerance } from './numeric';

const ROUND_DECIMALS = 9;
const ROUND_FACTOR = 10 ** ROUND_DECIMALS;

export function roundCoord(v: number): number {
  const rounded = Math.round(v * ROUND_FACTOR) / ROUND_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundPoint(p: Point): Point {
  return { x: roundCoord(p.x), y: roundCoord(p.y) };
}

export function pointsEqual(a: Point, b: Point, eps = EPS): boolean {
  return pointsAlmostEqual(a, b, eps);
}

export function dedupeAdjacent(ring: Ring, eps = EPS): Ring {
  if (ring.length === 0) return ring;
  const out: Ring = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    if (!pointsEqual(out[out.length - 1], ring[i], eps)) {
      out.push(ring[i]);
    }
  }
  if (out.length > 1 && pointsEqual(out[0], out[out.length - 1], eps)) {
    out.pop();
  }
  return out;
}

export function normalizeRing(ring: Ring): Ring | null {
  const rounded = ring.map(roundPoint);
  const cleaned = dedupeAdjacent(rounded);
  if (cleaned.length < 3) return null;
  if (Math.abs(signedRingArea(cleaned)) < ringAreaTolerance(cleaned)) {
    return null;
  }
  return cleaned;
}

export function ensureOuterCCW(ring: Ring): Ring {
  return signedRingArea(ring) > 0 ? ring : [...ring].reverse();
}

export function ensureHoleCW(ring: Ring): Ring {
  return signedRingArea(ring) < 0 ? ring : [...ring].reverse();
}

export function normalizePolygon(poly: PolygonGeometry): PolygonGeometry | null {
  const outer = normalizeRing(poly.outer);
  if (!outer) return null;
  const holes: Ring[] = [];
  for (const h of poly.holes) {
    const nh = normalizeRing(h);
    if (nh) holes.push(ensureHoleCW(nh));
  }
  return { outer: ensureOuterCCW(outer), holes };
}

export function normalizeMultiPolygon(
  mp: MultiPolygonGeometry,
): MultiPolygonGeometry {
  const out: MultiPolygonGeometry = [];
  for (const p of mp) {
    const np = normalizePolygon(p);
    if (np) out.push(np);
  }
  return out;
}
