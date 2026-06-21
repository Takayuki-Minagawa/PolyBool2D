import type { PolygonGeometry, Point, Ring } from './types';
import { distance } from './numeric';
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

export function ringBBox(ring: Ring): BBox | null {
  if (ring.length === 0) return null;
  let { x: minX, y: minY } = ring[0];
  let maxX = minX;
  let maxY = minY;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
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
  if (area <= 1e-12) return outerCentroid;
  return { x: cx / area, y: cy / area };
}
