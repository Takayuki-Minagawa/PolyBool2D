import { getEngine } from './geometryEngine';
import { isFiniteRing } from './numeric';
import type {
  GeometryOperationResult,
  MultiPolygonGeometry,
  PolygonGeometry,
  Ring,
} from './types';

export type RepairFailureReason = 'invalid-input' | 'engine-error';
export type RepairResult = GeometryOperationResult<
  MultiPolygonGeometry,
  RepairFailureReason
>;

function successful(value: MultiPolygonGeometry): RepairResult {
  return { ok: true, value, diagnostics: [] };
}

function failed(
  reason: RepairFailureReason,
  message: string,
): RepairResult {
  return { ok: false, value: [], reason, message, diagnostics: [] };
}

function caughtMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validRingInput(ring: Ring): boolean {
  return ring.length >= 3 && isFiniteRing(ring);
}

function validPolygonInput(polygon: PolygonGeometry): boolean {
  return (
    validRingInput(polygon.outer) &&
    polygon.holes.every(validRingInput)
  );
}

function repairWithActiveEngine(
  polygons: MultiPolygonGeometry,
): MultiPolygonGeometry {
  const engine = getEngine();
  return engine.repair?.(polygons) ?? engine.union(polygons);
}

/**
 * Resolve self-crossing/self-touching rings using polygon-clipping's non-zero
 * fill rule. The result can contain more than one polygon (for example, a
 * bow-tie ring becomes two polygons).
 */
export function repairRing(ring: Ring): MultiPolygonGeometry {
  return repairRingResult(ring).value;
}

export function repairRingResult(ring: Ring): RepairResult {
  if (!validRingInput(ring)) {
    return failed(
      'invalid-input',
      'A repair ring needs at least three finite points.',
    );
  }
  return repairPolygonResult({ outer: ring, holes: [] });
}

/**
 * Normalize a polygon into valid, non-self-crossing polygon-clipping output.
 * Invalid/non-finite input and clipping failures are reported as an empty
 * result instead of leaking library exceptions into editing workflows.
 */
export function repairPolygon(polygon: PolygonGeometry): MultiPolygonGeometry {
  return repairPolygonResult(polygon).value;
}

export function repairPolygonResult(polygon: PolygonGeometry): RepairResult {
  if (!validPolygonInput(polygon)) {
    return failed(
      'invalid-input',
      'A repair polygon needs finite rings with at least three points.',
    );
  }
  try {
    return successful(repairWithActiveEngine([polygon]));
  } catch (error) {
    return failed(
      'engine-error',
      `The geometry engine could not repair the polygon: ${caughtMessage(error)}`,
    );
  }
}

/** Normalize and merge a collection of possibly self-crossing polygons. */
export function repairMultiPolygon(
  polygons: MultiPolygonGeometry,
): MultiPolygonGeometry {
  return repairMultiPolygonResult(polygons).value;
}

export function repairMultiPolygonResult(
  polygons: MultiPolygonGeometry,
): RepairResult {
  if (polygons.length === 0) return successful([]);
  if (!polygons.every(validPolygonInput)) {
    return failed(
      'invalid-input',
      'Every repair polygon needs finite rings with at least three points.',
    );
  }
  try {
    return successful(repairWithActiveEngine(polygons));
  } catch (error) {
    return failed(
      'engine-error',
      `The geometry engine could not repair the polygons: ${caughtMessage(error)}`,
    );
  }
}
