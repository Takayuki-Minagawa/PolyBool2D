import { signedRingArea } from './area';
import {
  pointInRingStrict,
  segmentIntersection,
} from './intersections';
import { ringBBox, type BBox } from './measure';
import {
  lerpPoint,
  parameterTolerance,
  pointOnSegment,
  ringCoordinateTolerance,
  segmentParameter,
} from './numeric';
import { normalizePolygon, normalizeRing } from './normalize';
import { BBoxSpatialIndex } from './spatialIndex';
import type { Point, PolygonGeometry, Ring } from './types';

type RingEdge = {
  start: Point;
  end: Point;
};

type PreparedRing = {
  ring: Ring;
  area: number;
  bbox: BBox;
  probe: Point | null;
  edges?: BBoxSpatialIndex<RingEdge>;
};

type AreaIndexItem = {
  bbox: BBox;
  area: number;
  index: number;
};

type AreaIndexNode = {
  bbox: BBox;
  maxArea: number;
  items?: AreaIndexItem[];
  left?: AreaIndexNode;
  right?: AreaIndexNode;
};

const AREA_INDEX_LEAF_SIZE = 8;

function midpoint(a: number, b: number): number {
  const direct = a + (b - a) / 2;
  return Number.isFinite(direct) ? direct : a / 2 + b / 2;
}

/**
 * Pick a point in the even/odd interior of a ring with one horizontal scan.
 * This avoids testing every inner vertex against every candidate outer edge.
 */
function ringInteriorPoint(ring: Ring): Point | null {
  let scanStart: Point | null = null;
  let scanEnd: Point | null = null;
  let largestVerticalSpan = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const verticalSpan = Math.abs(end.y - start.y);
    if (verticalSpan > largestVerticalSpan) {
      largestVerticalSpan = verticalSpan;
      scanStart = start;
      scanEnd = end;
    }
  }
  if (!scanStart || !scanEnd || largestVerticalSpan === 0) return null;

  const y = midpoint(scanStart.y, scanEnd.y);
  if (!Number.isFinite(y)) return null;
  const intersections: number[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if ((start.y > y) === (end.y > y)) continue;
    const x =
      start.x + ((y - start.y) * (end.x - start.x)) / (end.y - start.y);
    if (Number.isFinite(x)) intersections.push(x);
  }
  intersections.sort((a, b) => a - b);

  let probe: Point | null = null;
  let widestInterval = 0;
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const left = intersections[index];
    const right = intersections[index + 1];
    const width = right - left;
    if (!(width > widestInterval)) continue;
    const x = midpoint(left, right);
    if (!Number.isFinite(x)) continue;
    widestInterval = width;
    probe = { x, y };
  }
  return probe && pointInRingStrict(probe, ring) ? probe : null;
}

function edgeBBox(edge: RingEdge): BBox {
  return {
    minX: Math.min(edge.start.x, edge.end.x),
    minY: Math.min(edge.start.y, edge.end.y),
    maxX: Math.max(edge.start.x, edge.end.x),
    maxY: Math.max(edge.start.y, edge.end.y),
  };
}

function ringEdgeIndex(ring: Ring): BBoxSpatialIndex<RingEdge> {
  return new BBoxSpatialIndex(
    ring.map((start, index) => {
      const edge = { start, end: ring[(index + 1) % ring.length] };
      return { bbox: edgeBBox(edge), value: edge };
    }),
  );
}

function preparedRingEdges(item: PreparedRing): BBoxSpatialIndex<RingEdge> {
  item.edges ??= ringEdgeIndex(item.ring);
  return item.edges;
}

function bboxContains(outer: BBox, inner: BBox): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  );
}

function bboxContainsPoint(bounds: BBox, point: Point): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function areaIndexBounds(items: readonly AreaIndexItem[]): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    minX = Math.min(minX, item.bbox.minX);
    minY = Math.min(minY, item.bbox.minY);
    maxX = Math.max(maxX, item.bbox.maxX);
    maxY = Math.max(maxY, item.bbox.maxY);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Spatial tree augmented with the largest ring area in each subtree.
 * Equal- and smaller-area subtrees cannot contain the queried ring and are
 * pruned before their individual bounding boxes are visited.
 */
function buildAreaIndex(items: readonly AreaIndexItem[]): AreaIndexNode | null {
  if (items.length === 0) return null;
  const bbox = areaIndexBounds(items);
  const maxArea = items.reduce(
    (largest, item) => Math.max(largest, item.area),
    Number.NEGATIVE_INFINITY,
  );
  if (items.length <= AREA_INDEX_LEAF_SIZE) {
    return { bbox, maxArea, items: [...items] };
  }

  const splitX = bbox.maxX - bbox.minX >= bbox.maxY - bbox.minY;
  const ordered = [...items].sort((a, b) => {
    const centerA = splitX
      ? midpoint(a.bbox.minX, a.bbox.maxX)
      : midpoint(a.bbox.minY, a.bbox.maxY);
    const centerB = splitX
      ? midpoint(b.bbox.minX, b.bbox.maxX)
      : midpoint(b.bbox.minY, b.bbox.maxY);
    return centerA - centerB;
  });
  const middle = Math.floor(ordered.length / 2);
  return {
    bbox,
    maxArea,
    left: buildAreaIndex(ordered.slice(0, middle)) ?? undefined,
    right: buildAreaIndex(ordered.slice(middle)) ?? undefined,
  };
}

function queryStrictlyLargerAtPoint(
  root: AreaIndexNode | null,
  point: Point,
  area: number,
): number[] {
  if (!root) return [];
  const result: number[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.maxArea <= area || !bboxContainsPoint(node.bbox, point)) continue;
    if (node.items) {
      for (const item of node.items) {
        if (
          item.area > area &&
          bboxContainsPoint(item.bbox, point)
        ) {
          result.push(item.index);
        }
      }
      continue;
    }
    if (node.left) stack.push(node.left);
    if (node.right) stack.push(node.right);
  }
  return result;
}

/**
 * Boundary-inclusive even/odd point classification accelerated by the edge
 * index. Only edges that can meet the horizontal ray are inspected.
 */
function pointInRingClosureWithIndex(
  point: Point,
  ring: Ring,
  bounds: BBox,
  edges: BBoxSpatialIndex<RingEdge>,
): boolean {
  const tolerance = ringCoordinateTolerance(ring);
  let inside = false;
  for (const candidate of edges.query({
    minX: Math.max(bounds.minX, point.x - tolerance),
    minY: Math.max(bounds.minY, point.y - tolerance),
    maxX: bounds.maxX,
    maxY: Math.min(bounds.maxY, point.y + tolerance),
  })) {
    const { start, end } = candidate.value;
    if (pointOnSegment(point, start, end)) return true;
    if ((start.y > point.y) === (end.y > point.y)) continue;
    const intersectionX =
      start.x +
      ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y);
    if (point.x < intersectionX) inside = !inside;
  }
  return inside;
}

function ringContainedInClosureWithIndex(
  inner: Ring,
  outer: Ring,
  outerBounds: BBox,
  outerEdges: BBoxSpatialIndex<RingEdge>,
): boolean {
  for (let index = 0; index < inner.length; index += 1) {
    const edge = {
      start: inner[index],
      end: inner[(index + 1) % inner.length],
    };
    const edgeLength = Math.hypot(
      edge.end.x - edge.start.x,
      edge.end.y - edge.start.y,
    );
    const tolerance = parameterTolerance(edgeLength);
    const parameters = [0, 1];
    for (const candidate of outerEdges.query(edgeBBox(edge))) {
      const intersection = segmentIntersection(
        edge.start,
        edge.end,
        candidate.value.start,
        candidate.value.end,
      );
      if (intersection.type === 'point') {
        parameters.push(Math.max(0, Math.min(1, intersection.tA)));
      } else if (intersection.type === 'overlap') {
        parameters.push(
          Math.max(
            0,
            Math.min(
              1,
              segmentParameter(
                intersection.points[0],
                edge.start,
                edge.end,
              ),
            ),
          ),
          Math.max(
            0,
            Math.min(
              1,
              segmentParameter(
                intersection.points[1],
                edge.start,
                edge.end,
              ),
            ),
          ),
        );
      }
    }
    if (parameters.length === 2) continue;
    parameters.sort((a, b) => a - b);
    const unique = parameters.filter(
      (value, parameterIndex) =>
        parameterIndex === 0 ||
        value - parameters[parameterIndex - 1] > tolerance,
    );
    for (let parameterIndex = 0; parameterIndex + 1 < unique.length; parameterIndex += 1) {
      const start = unique[parameterIndex];
      const end = unique[parameterIndex + 1];
      if (end - start <= tolerance) continue;
      if (!pointInRingClosureWithIndex(
        lerpPoint(edge.start, edge.end, (start + end) / 2),
        outer,
        outerBounds,
        outerEdges,
      )) {
        return false;
      }
    }
  }
  return pointInRingClosureWithIndex(inner[0], outer, outerBounds, outerEdges);
}

/**
 * Return whether every part of `inner` lies in the boundary-inclusive closure
 * of `outer`. Shared edges and tangential contact are accepted, while an edge
 * that exits through a concave outer vertex is rejected.
 */
export function ringContainedInRingClosure(
  inner: Ring,
  outer: Ring,
): boolean {
  return ringsContainedInRingClosure([inner], outer);
}

/**
 * Batch form of `ringContainedInRingClosure`. The outer edge index is shared
 * so validating many holes does not rebuild the same tree for every ring.
 */
export function ringsContainedInRingClosure(
  innerRings: readonly Ring[],
  outer: Ring,
): boolean {
  const outerBounds = ringBBox(outer);
  if (outerBounds === null) return false;
  const outerEdges = ringEdgeIndex(outer);
  return innerRings.every((inner) => {
    const innerBounds = ringBBox(inner);
    return (
      innerBounds !== null &&
      bboxContains(outerBounds, innerBounds) &&
      ringContainedInClosureWithIndex(
        inner,
        outer,
        outerBounds,
        outerEdges,
      )
    );
  });
}

/**
 * Reconstruct polygon outer/hole topology from independent closed rings using
 * even/odd nesting. Areas and bounding boxes are computed once, and exact
 * containment checks are restricted to spatial-index candidates.
 */
export function nestRingsAsPolygons(rings: readonly Ring[]): PolygonGeometry[] {
  const normalized: PreparedRing[] = rings
    .map(normalizeRing)
    .filter((ring): ring is Ring => ring !== null)
    .map((ring) => ({
      ring,
      area: Math.abs(signedRingArea(ring)),
      bbox: ringBBox(ring)!,
      probe: ringInteriorPoint(ring),
    }))
    .sort((a, b) => b.area - a.area);
  const candidateTree = buildAreaIndex(
    normalized.map((item, index) => ({
      bbox: item.bbox,
      area: item.area,
      index,
    })),
  );
  const nodes: { ring: Ring; parent: number | null; depth: number }[] = [];

  for (let ringIndex = 0; ringIndex < normalized.length; ringIndex += 1) {
    const item = normalized[ringIndex];
    let parent: number | null = null;
    let parentArea = Number.POSITIVE_INFINITY;
    const probe = item.probe;
    if (!probe) {
      nodes.push({ ring: item.ring, parent, depth: 0 });
      continue;
    }

    const isContainingParent = (candidateIndex: number): boolean => {
      const candidate = nodes[candidateIndex];
      const candidateGeometry = normalized[candidateIndex];
      return (
        candidateGeometry.area > item.area &&
        bboxContains(candidateGeometry.bbox, item.bbox) &&
        pointInRingStrict(probe, candidate.ring) &&
        ringContainedInClosureWithIndex(
          item.ring,
          candidate.ring,
          candidateGeometry.bbox,
          preparedRingEdges(candidateGeometry),
        )
      );
    };

    // Rings are sorted largest-first. If the immediately preceding (therefore
    // smallest eligible) ring contains this one, it is necessarily the direct
    // parent. This turns a deeply concentric chain from all-ancestor scans into
    // one exact containment check per ring.
    const nearestByArea =
      ringIndex > 0 && normalized[ringIndex - 1].area > item.area
        ? ringIndex - 1
        : -1;
    if (
      nearestByArea >= 0 &&
      isContainingParent(nearestByArea)
    ) {
      parent = nearestByArea;
    } else {
      for (const candidateIndex of queryStrictlyLargerAtPoint(
        candidateTree,
        probe,
        item.area,
      )) {
        if (candidateIndex >= ringIndex) continue;
        const area = normalized[candidateIndex].area;
        if (
          area < parentArea &&
          isContainingParent(candidateIndex)
        ) {
          parent = candidateIndex;
          parentArea = area;
        }
      }
    }
    nodes.push({
      ring: item.ring,
      parent,
      depth: parent === null ? 0 : nodes[parent].depth + 1,
    });
  }

  const polygons = new Map<number, PolygonGeometry>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.depth % 2 === 0) {
      polygons.set(index, { outer: node.ring, holes: [] });
      continue;
    }
    let ancestor = node.parent;
    while (ancestor !== null && nodes[ancestor].depth % 2 !== 0) {
      ancestor = nodes[ancestor].parent;
    }
    if (ancestor !== null) polygons.get(ancestor)?.holes.push(node.ring);
  }

  return [...polygons.values()]
    .map(normalizePolygon)
    .filter((polygon): polygon is PolygonGeometry => polygon !== null);
}
