import { ensureHoleCW, normalizeRing } from './normalize';
import type { GeometryValidationIssue, PolygonGeometry, Ring } from './types';
import { validatePolygon } from './validation';

export type AddHoleResult =
  | { ok: true; geometry: PolygonGeometry }
  | { ok: false; issues: GeometryValidationIssue[] };

/**
 * Validate and append a hole ring. Validation covers self-intersection,
 * containment, boundary intersections, overlap with existing holes and area.
 */
export function addHoleToPolygon(
  geometry: PolygonGeometry,
  candidate: Ring,
): AddHoleResult {
  const normalized = normalizeRing(candidate);
  if (!normalized) return { ok: false, issues: ['hole-too-few-points'] };
  const next: PolygonGeometry = {
    outer: geometry.outer,
    holes: [...geometry.holes, ensureHoleCW(normalized)],
  };
  const validation = validatePolygon(next);
  return validation.valid
    ? { ok: true, geometry: next }
    : { ok: false, issues: validation.issues };
}

export function removeHoleFromPolygon(
  geometry: PolygonGeometry,
  holeIndex: number,
): PolygonGeometry | null {
  if (!Number.isInteger(holeIndex) || holeIndex < 0 || holeIndex >= geometry.holes.length) {
    return null;
  }
  return {
    outer: geometry.outer,
    holes: geometry.holes.filter((_, index) => index !== holeIndex),
  };
}
