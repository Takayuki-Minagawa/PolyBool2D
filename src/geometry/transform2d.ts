import type { PolygonGeometry, Point, Ring } from './types';

export type MirrorAxis = 'horizontal' | 'vertical';

/** Rotate a point by `angle` radians around `pivot` (CCW for positive angle). */
export function rotatePoint(p: Point, pivot: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/** Scale a point around `pivot` by independent x/y factors. */
export function scalePoint(p: Point, pivot: Point, sx: number, sy: number): Point {
  return {
    x: pivot.x + (p.x - pivot.x) * sx,
    y: pivot.y + (p.y - pivot.y) * sy,
  };
}

/**
 * Mirror a point across a line through `pivot`.
 * `vertical` flips across a vertical line (negates x offset);
 * `horizontal` flips across a horizontal line (negates y offset).
 */
export function mirrorPoint(p: Point, pivot: Point, axis: MirrorAxis): Point {
  if (axis === 'vertical') {
    return { x: pivot.x - (p.x - pivot.x), y: p.y };
  }
  return { x: p.x, y: pivot.y - (p.y - pivot.y) };
}

function mapRing(ring: Ring, fn: (p: Point) => Point): Ring {
  return ring.map(fn);
}

function mapPolygon(
  geometry: PolygonGeometry,
  fn: (p: Point) => Point,
): PolygonGeometry {
  return {
    outer: mapRing(geometry.outer, fn),
    holes: geometry.holes.map((h) => mapRing(h, fn)),
  };
}

export function rotatePolygon(
  geometry: PolygonGeometry,
  pivot: Point,
  angle: number,
): PolygonGeometry {
  return mapPolygon(geometry, (p) => rotatePoint(p, pivot, angle));
}

export function scalePolygon(
  geometry: PolygonGeometry,
  pivot: Point,
  sx: number,
  sy: number,
): PolygonGeometry {
  return mapPolygon(geometry, (p) => scalePoint(p, pivot, sx, sy));
}

export function mirrorPolygon(
  geometry: PolygonGeometry,
  pivot: Point,
  axis: MirrorAxis,
): PolygonGeometry {
  return mapPolygon(geometry, (p) => mirrorPoint(p, pivot, axis));
}
