import type { Point, PolygonGeometry, Ring } from './types';

function translateRing(ring: Ring, dx: number, dy: number): Ring {
  return ring.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function translatePolygon(
  geometry: PolygonGeometry,
  dx: number,
  dy: number,
): PolygonGeometry {
  return {
    outer: translateRing(geometry.outer, dx, dy),
    holes: geometry.holes.map((h) => translateRing(h, dx, dy)),
  };
}

export function translationBetween(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y };
}
