import type { Point, Ring } from './types';
import { isFinitePoint } from './numeric';

export function circleToRing(
  center: Point,
  radius: number,
  segments: number,
): Ring {
  if (
    !isFinitePoint(center) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(segments)
  ) {
    return [];
  }
  const n = Math.max(8, Math.floor(segments));
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    ring.push({
      x: center.x + Math.cos(t) * radius,
      y: center.y + Math.sin(t) * radius,
    });
  }
  return ring;
}

export function rectangleToRing(p1: Point, p2: Point): Ring {
  if (
    !isFinitePoint(p1) ||
    !isFinitePoint(p2)
  ) {
    return [];
  }
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}
