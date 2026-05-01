import { polygonArea, signedRingArea } from './area';
import { segmentIntersection } from './intersections';
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

export function validatePolygon(poly: PolygonGeometry): GeometryValidationResult {
  const issues: GeometryValidationIssue[] = [];
  if (poly.outer.length < 3) issues.push('outer-too-few-points');
  for (const h of poly.holes) {
    if (h.length < 3) {
      issues.push('hole-too-few-points');
      break;
    }
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
  const outerAreaTolerance = ringAreaTolerance(poly.outer);
  if (Math.abs(signedRingArea(poly.outer)) < outerAreaTolerance) {
    issues.push('zero-area');
  }
  if (polygonArea(poly) < outerAreaTolerance) {
    if (!issues.includes('zero-area')) issues.push('zero-area');
  }
  return { valid: issues.length === 0, issues };
}
