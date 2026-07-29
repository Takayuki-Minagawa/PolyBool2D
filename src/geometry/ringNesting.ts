import { signedRingArea } from './area';
import { pointInRingStrict, segmentIntersection } from './intersections';
import { ringBBox } from './measure';
import { normalizePolygon, normalizeRing } from './normalize';
import { BBoxSpatialIndex } from './spatialIndex';
import type { PolygonGeometry, Ring } from './types';

function ringStrictlyContained(inner: Ring, outer: Ring): boolean {
  if (!inner.every((point) => pointInRingStrict(point, outer))) return false;
  for (let innerIndex = 0; innerIndex < inner.length; innerIndex += 1) {
    const innerStart = inner[innerIndex];
    const innerEnd = inner[(innerIndex + 1) % inner.length];
    for (let outerIndex = 0; outerIndex < outer.length; outerIndex += 1) {
      const outerStart = outer[outerIndex];
      const outerEnd = outer[(outerIndex + 1) % outer.length];
      if (
        segmentIntersection(
          innerStart,
          innerEnd,
          outerStart,
          outerEnd,
        ).type !== 'none'
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Reconstruct polygon outer/hole topology from independent closed rings using
 * even/odd nesting. Areas and bounding boxes are computed once, and exact
 * containment checks are restricted to spatial-index candidates.
 */
export function nestRingsAsPolygons(rings: readonly Ring[]): PolygonGeometry[] {
  const normalized = rings
    .map(normalizeRing)
    .filter((ring): ring is Ring => ring !== null)
    .map((ring) => ({
      ring,
      area: Math.abs(signedRingArea(ring)),
      bbox: ringBBox(ring)!,
    }))
    .sort((a, b) => b.area - a.area);
  const spatialIndex = new BBoxSpatialIndex(
    normalized.map((item, index) => ({ bbox: item.bbox, value: index })),
  );
  const nodes: { ring: Ring; parent: number | null; depth: number }[] = [];

  for (let ringIndex = 0; ringIndex < normalized.length; ringIndex += 1) {
    const item = normalized[ringIndex];
    let parent: number | null = null;
    let parentArea = Number.POSITIVE_INFINITY;
    for (const candidateIndex of spatialIndex
      .queryPoint(item.ring[0])
      .map((entry) => entry.value)) {
      if (candidateIndex >= ringIndex) continue;
      const candidate = nodes[candidateIndex];
      const area = normalized[candidateIndex].area;
      if (
        area < parentArea &&
        ringStrictlyContained(item.ring, candidate.ring)
      ) {
        parent = candidateIndex;
        parentArea = area;
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
