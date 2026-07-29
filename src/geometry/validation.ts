import { polygonArea, signedRingArea } from './area';
import { pointInRing, segmentIntersection } from './intersections';
import { ringBBox, type BBox } from './measure';
import { ringsContainedInRingClosure } from './ringNesting';
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

function expandedBBox(bbox: BBox, tolerance: number): BBox {
  return {
    minX: bbox.minX - tolerance,
    minY: bbox.minY - tolerance,
    maxX: bbox.maxX + tolerance,
    maxY: bbox.maxY + tolerance,
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
    const holes = poly.holes.filter((hole) => hole.length >= 3);
    if (!ringsContainedInRingClosure(holes, poly.outer)) {
      pushIssueOnce(issues, 'hole-outside-outer');
    }
  }
  const indexedHoles = poly.holes.flatMap((ring, index) => {
    if (ring.length < 3) return [];
    const bbox = ringBBox(ring);
    if (!bbox) return [];
    const tolerance = ringCoordinateTolerance(ring);
    return [{ index, ring, bbox, tolerance }];
  });
  const holeIndex = new BBoxSpatialIndex(
    indexedHoles.map((hole) => ({
      bbox: expandedBBox(hole.bbox, hole.tolerance),
      value: hole,
    })),
  );
  for (const a of indexedHoles) {
    for (const b of holeIndex.queryValues(
      expandedBBox(a.bbox, a.tolerance),
    )) {
      if (b.index <= a.index) continue;
      if (
        ringsIntersect(a.ring, b.ring) ||
        pointInRing(a.ring[0], b.ring) ||
        pointInRing(b.ring[0], a.ring)
      ) {
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
