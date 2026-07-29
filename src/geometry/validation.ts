import { polygonArea, signedRingArea } from './area';
import { pointInRing, segmentIntersection } from './intersections';
import { BBoxSpatialIndex } from './spatialIndex';
import type {
  GeometryValidationIssue,
  GeometryValidationResult,
  Point,
  PolygonGeometry,
  Ring,
} from './types';
import { EPS } from './types';
import {
  isFiniteRing,
  ringAreaTolerance,
  ringCoordinateTolerance,
} from './numeric';

type IndexedEdge = {
  index: number;
  start: Point;
  end: Point;
};

function edgeBBox(start: Point, end: Point, tolerance: number) {
  return {
    minX: Math.min(start.x, end.x) - tolerance,
    minY: Math.min(start.y, end.y) - tolerance,
    maxX: Math.max(start.x, end.x) + tolerance,
    maxY: Math.max(start.y, end.y) + tolerance,
  };
}

function ringEdges(ring: Ring): IndexedEdge[] {
  return ring.map((start, index) => ({
    index,
    start,
    end: ring[(index + 1) % ring.length],
  }));
}

export function ringHasSelfIntersection(ring: Ring): boolean {
  const n = ring.length;
  if (n < 4 || !isFiniteRing(ring)) return false;
  const tolerance = ringCoordinateTolerance(ring);
  const edges = ringEdges(ring);
  const index = new BBoxSpatialIndex(
    edges.map((edge) => ({
      bbox: edgeBBox(edge.start, edge.end, tolerance),
      value: edge,
    })),
  );
  for (const edge of edges) {
    const candidates = index.queryValues(
      edgeBBox(edge.start, edge.end, tolerance),
    );
    for (const candidate of candidates) {
      if (candidate.index <= edge.index) continue;
      const isAdjacent =
        candidate.index === edge.index + 1 ||
        (edge.index === 0 && candidate.index === n - 1);
      if (isAdjacent) continue;
      const r = segmentIntersection(
        edge.start,
        edge.end,
        candidate.start,
        candidate.end,
      );
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
  if (
    a.length < 2 ||
    b.length < 2 ||
    !isFiniteRing(a) ||
    !isFiniteRing(b)
  ) {
    return false;
  }
  const tolerance = Math.max(
    ringCoordinateTolerance(a),
    ringCoordinateTolerance(b),
  );
  const bEdges = ringEdges(b);
  const index = new BBoxSpatialIndex(
    bEdges.map((edge) => ({
      bbox: edgeBBox(edge.start, edge.end, tolerance),
      value: edge,
    })),
  );
  for (const edge of ringEdges(a)) {
    for (const candidate of index.queryValues(
      edgeBBox(edge.start, edge.end, tolerance),
    )) {
      if (
        segmentIntersection(
          edge.start,
          edge.end,
          candidate.start,
          candidate.end,
        ).type !== 'none'
      ) {
        return true;
      }
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
  if (![poly.outer, ...poly.holes].every(isFiniteRing)) {
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
