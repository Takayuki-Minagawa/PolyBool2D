import { polygonArea, signedRingArea } from './area';
import { segmentIntersection } from './intersections';
import { ringBBox, type BBox } from './measure';
import {
  ringContainedInRingClosure,
  ringsContainedInRingClosure,
} from './ringNesting';
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
  pointOnSegment,
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

function bboxContains(outer: BBox, inner: BBox): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  );
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

function overlappingEdgesShareInteriorSide(
  a: IndexedEdge,
  b: IndexedEdge,
  aOrientation: number,
  bOrientation: number,
): boolean {
  if (aOrientation === 0 || bOrientation === 0) return false;
  const aDx = a.end.x - a.start.x;
  const aDy = a.end.y - a.start.y;
  const bDx = b.end.x - b.start.x;
  const bDy = b.end.y - b.start.y;
  const aNormalX = -aDy * aOrientation;
  const aNormalY = aDx * aOrientation;
  const bNormalX = -bDy * bOrientation;
  const bNormalY = bDx * bOrientation;
  return aNormalX * bNormalX + aNormalY * bNormalY > 0;
}

function pointInRingStrictWithIndex(
  point: Point,
  bounds: BBox,
  edges: BBoxSpatialIndex<IndexedEdge>,
): boolean {
  if (
    point.x <= bounds.minX ||
    point.x >= bounds.maxX ||
    point.y <= bounds.minY ||
    point.y >= bounds.maxY
  ) {
    return false;
  }
  let inside = false;
  for (const edge of edges.queryValues({
    minX: point.x,
    minY: point.y,
    maxX: bounds.maxX,
    maxY: point.y,
  })) {
    if (pointOnSegment(point, edge.start, edge.end)) return false;
    if ((edge.start.y > point.y) === (edge.end.y > point.y)) continue;
    const intersectionX =
      edge.start.x +
      ((point.y - edge.start.y) * (edge.end.x - edge.start.x)) /
        (edge.end.y - edge.start.y);
    if (point.x < intersectionX) inside = !inside;
  }
  return inside;
}

function ringsHaveInteriorOverlap(a: Ring, b: Ring): boolean {
  if (
    a.length < 2 ||
    b.length < 2 ||
    !isFiniteRing(a) ||
    !isFiniteRing(b)
  ) {
    return false;
  }
  const aBounds = ringBBox(a);
  const bBounds = ringBBox(b);
  if (!aBounds || !bBounds) return false;
  const tolerance = Math.max(
    ringCoordinateTolerance(a),
    ringCoordinateTolerance(b),
  );
  const aOrientation = Math.sign(signedRingArea(a));
  const bOrientation = Math.sign(signedRingArea(b));
  const aEdges = ringEdges(a);
  const bEdges = ringEdges(b);
  const index = new BBoxSpatialIndex(
    bEdges.map((edge) => ({
      bbox: edgeBBox(edge.start, edge.end, tolerance),
      value: edge,
    })),
  );
  for (const edge of aEdges) {
    for (const candidate of index.queryValues(
      edgeBBox(edge.start, edge.end, tolerance),
    )) {
      const intersection = segmentIntersection(
        edge.start,
        edge.end,
        candidate.start,
        candidate.end,
      );
      if (
        intersection.type === 'point' &&
        intersection.tA > EPS &&
        intersection.tA < 1 - EPS &&
        intersection.tB > EPS &&
        intersection.tB < 1 - EPS
      ) {
        return true;
      }
      if (
        intersection.type === 'overlap' &&
        overlappingEdgesShareInteriorSide(
          edge,
          candidate,
          aOrientation,
          bOrientation,
        )
      ) {
        return true;
      }
    }
  }
  if (a.some((point) => pointInRingStrictWithIndex(point, bBounds, index))) {
    return true;
  }
  const aIndex = new BBoxSpatialIndex(
    aEdges.map((edge) => ({
      bbox: edgeBBox(edge.start, edge.end, tolerance),
      value: edge,
    })),
  );
  if (b.some((point) => pointInRingStrictWithIndex(point, aBounds, aIndex))) {
    return true;
  }
  return (
    (
      bboxContains(bBounds, aBounds) &&
      ringContainedInRingClosure(a, b)
    ) ||
    (
      bboxContains(aBounds, bBounds) &&
      ringContainedInRingClosure(b, a)
    )
  );
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
        ringsHaveInteriorOverlap(a.ring, b.ring)
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
