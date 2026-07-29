import { signedRingArea } from './area';
import { pointInRing } from './intersections';
import { ringBBox } from './measure';
import { normalizePolygon, normalizeRing } from './normalize';
import { BBoxSpatialIndex } from './spatialIndex';
import type { PolygonGeometry, Ring } from './types';

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
        pointInRing(item.ring[0], candidate.ring)
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
