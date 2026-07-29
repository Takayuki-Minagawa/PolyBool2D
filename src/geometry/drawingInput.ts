import type { Point } from './types';
import { isFinitePoint } from './numeric';

/**
 * Place a point at an exact distance from an anchor while preserving the
 * direction indicated by the cursor. Returns null for invalid/zero direction.
 */
export function pointAtDistance(
  anchor: Point,
  directionPoint: Point,
  distance: number,
): Point | null {
  if (
    !isFinitePoint(anchor) ||
    !isFinitePoint(directionPoint) ||
    !Number.isFinite(distance) ||
    distance <= 0
  ) {
    return null;
  }
  const dx = directionPoint.x - anchor.x;
  const dy = directionPoint.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  return {
    x: anchor.x + (dx / length) * distance,
    y: anchor.y + (dy / length) * distance,
  };
}

export function parseDrawingDistance(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}
