import type { PolygonGeometry, Point, Ring } from './types';
import { AREA_ABSOLUTE_TOLERANCE, distance } from './numeric';
import { signedRingArea, ringCentroid } from './area';

/** Total length of a closed ring (last vertex connects back to the first). */
export function ringPerimeter(ring: Ring): number {
  if (ring.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    sum += distance(ring[i], ring[(i + 1) % ring.length]);
  }
  return sum;
}

/** Perimeter of a polygon including its hole boundaries. */
export function polygonPerimeter(poly: PolygonGeometry): number {
  return (
    ringPerimeter(poly.outer) +
    poly.holes.reduce((acc, h) => acc + ringPerimeter(h), 0)
  );
}

export type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function expandBBox(box: BBox | null, point: Point): BBox {
  if (!box) {
    return {
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    };
  }
  return {
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y),
  };
}

export function ringBBox(ring: Ring): BBox | null {
  if (ring.length === 0) return null;
  let box: BBox | null = null;
  for (const point of ring) {
    box = expandBBox(box, point);
  }
  return box;
}

/** Axis-aligned bounding box of a polygon (the outer ring contains the holes). */
export function polygonBBox(poly: PolygonGeometry): BBox | null {
  return ringBBox(poly.outer);
}

export function bboxSize(box: BBox): { width: number; height: number } {
  return { width: box.maxX - box.minX, height: box.maxY - box.minY };
}

/**
 * Area-weighted centroid of a polygon, subtracting hole contributions.
 * Falls back to the outer-ring centroid when the net area is degenerate.
 */
export function polygonCentroid(poly: PolygonGeometry): Point {
  const outerArea = signedRingArea(poly.outer);
  const outerCentroid = ringCentroid(poly.outer);
  let area = Math.abs(outerArea);
  let cx = outerCentroid.x * area;
  let cy = outerCentroid.y * area;
  for (const hole of poly.holes) {
    const holeArea = Math.abs(signedRingArea(hole));
    const hc = ringCentroid(hole);
    area -= holeArea;
    cx -= hc.x * holeArea;
    cy -= hc.y * holeArea;
  }
  // Guard against degenerate or invalid input (holes >= outer) where the net
  // area is non-positive; fall back to the outer-ring centroid.
  if (area <= AREA_ABSOLUTE_TOLERANCE) return outerCentroid;
  return { x: cx / area, y: cy / area };
}
