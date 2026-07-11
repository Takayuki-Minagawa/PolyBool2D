import { polygonArea, signedRingArea } from './area';
import { pointInRing, segmentIntersection } from './intersections';
import type {
  GeometryValidationIssue,
  GeometryValidationResult,
  PolygonGeometry,
  Ring,
} from './types';
import { EPS } from './types';
import { ringAreaTolerance } from './numeric';

export function ringHasSelfIntersection(ring: Ring): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i) continue;
      const isAdjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (isAdjacent) continue;
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];
      const r = segmentIntersection(a1, a2, b1, b2);
      if (r.type === 'point') {
        if (r.tA > EPS && r.tA < 1 - EPS && r.tB > EPS && r.tB < 1 - EPS) {
          return true;
        }
      } else if (r.type === 'overlap') {
        return true;
      }
    }
  }
  return false;
}

function ringsIntersect(a: Ring, b: Ring): boolean {
  if (a.length < 2 || b.length < 2) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segmentIntersection(a1, a2, b1, b2).type !== 'none') return true;
    }
  }
  return false;
}

function pushIssueOnce(issues: GeometryValidationIssue[], issue: GeometryValidationIssue): void {
  if (!issues.includes(issue)) issues.push(issue);
}

export function validatePolygon(poly: PolygonGeometry): GeometryValidationResult {
  const issues: GeometryValidationIssue[] = [];
  if (poly.outer.length < 3) issues.push('outer-too-few-points');
  for (const h of poly.holes) {
    if (h.length < 3) {
      issues.push('hole-too-few-points');
      break;
    }
  }
  if (
    [poly.outer, ...poly.holes]
      .flat()
      .some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
      )
  ) {
    // Non-finite values poison all of the predicates below (NaN comparisons
    // are false), so reject them before intersection and area calculations.
    pushIssueOnce(issues, 'zero-area');
    return { valid: false, issues };
  }
  if (poly.outer.length >= 3 && ringHasSelfIntersection(poly.outer)) {
    issues.push('self-intersection');
  } else {
    for (const h of poly.holes) {
      if (h.length >= 3 && ringHasSelfIntersection(h)) {
        issues.push('self-intersection');
        break;
      }
    }
  }
  if (poly.outer.length >= 3) {
    for (const h of poly.holes) {
      if (h.length < 3) continue;
      if (!pointInRing(h[0], poly.outer) || ringsIntersect(h, poly.outer)) {
        pushIssueOnce(issues, 'hole-outside-outer');
        break;
      }
    }
  }
  for (let i = 0; i < poly.holes.length; i++) {
    const a = poly.holes[i];
    if (a.length < 3) continue;
    for (let j = i + 1; j < poly.holes.length; j++) {
      const b = poly.holes[j];
      if (b.length < 3) continue;
      if (ringsIntersect(a, b) || pointInRing(a[0], b) || pointInRing(b[0], a)) {
        pushIssueOnce(issues, 'hole-overlap');
        break;
      }
    }
    if (issues.includes('hole-overlap')) break;
  }
  const outerAreaTolerance = ringAreaTolerance(poly.outer);
  if (Math.abs(signedRingArea(poly.outer)) < outerAreaTolerance) {
    issues.push('zero-area');
  }
  if (polygonArea(poly) < outerAreaTolerance) {
    if (!issues.includes('zero-area')) issues.push('zero-area');
  }
  return { valid: issues.length === 0, issues };
}
