import { defaultEngine } from './polygonClippingEngine';
import type { MultiPolygonGeometry, PolygonGeometry, Ring } from './types';

function ringIsFinite(ring: Ring): boolean {
  return (
    ring.length >= 3 &&
    ring.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}
function polygonIsFinite(polygon: PolygonGeometry): boolean {
  return ringIsFinite(polygon.outer) && polygon.holes.every(ringIsFinite);
}

/**
 * Resolve self-crossing/self-touching rings using polygon-clipping's non-zero
 * fill rule. The result can contain more than one polygon (for example, a
 * bow-tie ring becomes two polygons).
 */
export function repairRing(ring: Ring): MultiPolygonGeometry {
  if (!ringIsFinite(ring)) return [];
  return repairPolygon({ outer: ring, holes: [] });
}

/**
 * Normalize a polygon into valid, non-self-crossing polygon-clipping output.
 * Invalid/non-finite input and clipping failures are reported as an empty
 * result instead of leaking library exceptions into editing workflows.
 */
export function repairPolygon(polygon: PolygonGeometry): MultiPolygonGeometry {
  if (!polygonIsFinite(polygon)) return [];
  try {
    return defaultEngine.union([polygon]);
  } catch {
    return [];
  }
}

/** Normalize and merge a collection of possibly self-crossing polygons. */
export function repairMultiPolygon(
  polygons: MultiPolygonGeometry,
): MultiPolygonGeometry {
  if (polygons.length === 0 || !polygons.every(polygonIsFinite)) return [];
  try {
    return defaultEngine.union(polygons);
  } catch {
    return [];
  }
}
