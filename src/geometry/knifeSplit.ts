import { polygonArea, signedRingArea } from './area';
import { segmentIntersection } from './intersections';
import { normalizePolygon } from './normalize';
import type { Point, PolygonGeometry, Ring } from './types';
import { EPS } from './types';

export type KnifeSplitResult =
  | { ok: true; polygons: PolygonGeometry[] }
  | { ok: false; reason: 'no-intersection' | 'not-two-intersections' | 'has-holes' };

type EdgeIntersection = {
  edgeIndex: number;
  t: number;
  point: Point;
};

export function knifeSplitPolygon(
  poly: PolygonGeometry,
  knifeStart: Point,
  knifeEnd: Point,
): KnifeSplitResult {
  if (poly.holes.length > 0) {
    return { ok: false, reason: 'has-holes' };
  }
  const ring = poly.outer;
  const n = ring.length;
  const intersections: EdgeIntersection[] = [];

  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const r = segmentIntersection(knifeStart, knifeEnd, a, b);
    if (r.type === 'point') {
      const onKnife = r.tA > -EPS && r.tA < 1 + EPS;
      const onEdge = r.tB > -EPS && r.tB < 1 + EPS;
      if (onKnife && onEdge) {
        const tEdge = Math.max(0, Math.min(1, r.tB));
        if (tEdge < 1 - EPS) {
          intersections.push({
            edgeIndex: i,
            t: tEdge,
            point: { x: r.point.x, y: r.point.y },
          });
        }
      }
    }
  }

  const dedup: EdgeIntersection[] = [];
  for (const it of intersections) {
    const dup = dedup.find(
      (d) => Math.abs(d.point.x - it.point.x) < 1e-6 &&
        Math.abs(d.point.y - it.point.y) < 1e-6,
    );
    if (!dup) dedup.push(it);
  }

  if (dedup.length === 0) return { ok: false, reason: 'no-intersection' };
  if (dedup.length !== 2) return { ok: false, reason: 'not-two-intersections' };

  const [iaRaw, ibRaw] = dedup;
  const [iA, iB] =
    iaRaw.edgeIndex < ibRaw.edgeIndex ||
    (iaRaw.edgeIndex === ibRaw.edgeIndex && iaRaw.t <= ibRaw.t)
      ? [iaRaw, ibRaw]
      : [ibRaw, iaRaw];

  const ringWithCuts: Point[] = [];
  type Tag = 'orig' | 'cutA' | 'cutB';
  const tags: Tag[] = [];

  for (let i = 0; i < n; i++) {
    ringWithCuts.push(ring[i]);
    tags.push('orig');
    const cutsHere: { t: number; point: Point; tag: Tag }[] = [];
    if (iA.edgeIndex === i) cutsHere.push({ t: iA.t, point: iA.point, tag: 'cutA' });
    if (iB.edgeIndex === i) cutsHere.push({ t: iB.t, point: iB.point, tag: 'cutB' });
    cutsHere.sort((x, y) => x.t - y.t);
    for (const c of cutsHere) {
      ringWithCuts.push(c.point);
      tags.push(c.tag);
    }
  }

  const idxA = tags.indexOf('cutA');
  const idxB = tags.indexOf('cutB');
  if (idxA < 0 || idxB < 0) return { ok: false, reason: 'not-two-intersections' };

  const total = ringWithCuts.length;
  const path1: Point[] = [];
  for (let k = idxA; ; k = (k + 1) % total) {
    path1.push(ringWithCuts[k]);
    if (k === idxB) break;
    if (path1.length > total + 2) break;
  }
  const path2: Point[] = [];
  for (let k = idxB; ; k = (k + 1) % total) {
    path2.push(ringWithCuts[k]);
    if (k === idxA) break;
    if (path2.length > total + 2) break;
  }

  const poly1: PolygonGeometry = { outer: path1, holes: [] };
  const poly2: PolygonGeometry = { outer: path2, holes: [] };
  const n1 = normalizePolygon(poly1);
  const n2 = normalizePolygon(poly2);
  const out: PolygonGeometry[] = [];
  if (n1 && polygonArea(n1) > EPS * 1000) out.push(n1);
  if (n2 && polygonArea(n2) > EPS * 1000) out.push(n2);
  if (out.length < 2) return { ok: false, reason: 'not-two-intersections' };
  return { ok: true, polygons: out };
}

export function ringWindingMatches(a: Ring, b: Ring): boolean {
  return Math.sign(signedRingArea(a)) === Math.sign(signedRingArea(b));
}
