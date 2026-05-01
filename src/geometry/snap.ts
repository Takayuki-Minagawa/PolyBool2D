import type { Point } from './types';
import { pointInRing } from './intersections';

export type SnapMode = 'grid' | 'vertex' | 'edge' | 'midpoint';

export type SnapResult = {
  point: Point;
  mode: SnapMode | null;
  distance: number;
};

export function snapToGrid(p: Point, gridSize: number): Point {
  if (gridSize <= 0) return p;
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  };
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function nearestVertex(p: Point, vertices: Point[]): { point: Point; distance: number } | null {
  if (vertices.length === 0) return null;
  let best = vertices[0];
  let bestD = distance(p, best);
  for (let i = 1; i < vertices.length; i++) {
    const d = distance(p, vertices[i]);
    if (d < bestD) {
      bestD = d;
      best = vertices[i];
    }
  }
  return { point: best, distance: bestD };
}

export function nearestEdgePoint(
  p: Point,
  segments: { a: Point; b: Point }[],
): { point: Point; midpoint: Point; distance: number; midpointDistance: number } | null {
  if (segments.length === 0) return null;
  let best: { point: Point; midpoint: Point; distance: number; midpointDistance: number } | null = null;
  for (const seg of segments) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: seg.a.x + t * dx, y: seg.a.y + t * dy };
    const mid = { x: seg.a.x + 0.5 * dx, y: seg.a.y + 0.5 * dy };
    const d = distance(p, proj);
    const md = distance(p, mid);
    if (!best || d < best.distance) {
      best = { point: proj, midpoint: mid, distance: d, midpointDistance: md };
    }
  }
  return best;
}

export { pointInRing };
