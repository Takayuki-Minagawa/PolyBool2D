export type {
  GeometryEngine,
  GeometryOperationResult,
  GeometryValidationIssue,
  GeometryValidationResult,
  MultiPolygonGeometry,
  PolygonGeometry,
  Point,
  Ring,
  BooleanOperation,
} from './types';
export { EPS } from './types';
import type { GeometryEngine } from './types';
import { clipper2Engine } from './clipper2Engine';
import { defaultEngine as legacyEngine } from './polygonClippingEngine';

let activeEngine: GeometryEngine = clipper2Engine;

/** Return the engine used by all geometry workflows. */
export function getEngine(): GeometryEngine {
  return activeEngine;
}

/** Replace the process-wide geometry engine (primarily for adapters and tests). */
export function setEngine(engine: GeometryEngine): void {
  activeEngine = engine === defaultEngine ? clipper2Engine : engine;
}

/** Restore the preferred Clipper2 implementation. */
export function resetEngine(): void {
  activeEngine = clipper2Engine;
}

/** Explicit rollback path for projects that need the legacy Martinez engine. */
export function useLegacyGeometryEngine(): void {
  activeEngine = legacyEngine;
}

/** Explicitly select the preferred Clipper2 engine. */
export function useClipper2GeometryEngine(): void {
  activeEngine = clipper2Engine;
}

/**
 * Backwards-compatible facade. New code should call getEngine() so the
 * dependency is explicit; this facade still honours setEngine().
 */
export const defaultEngine: GeometryEngine = {
  union: (input) => getEngine().union(input),
  difference: (subject, cutters) => getEngine().difference(subject, cutters),
  intersection: (input) => getEngine().intersection(input),
  xor: (input) => getEngine().xor(input),
  area: (input) => getEngine().area(input),
  normalize: (input) => getEngine().normalize(input),
  validate: (input) => getEngine().validate(input),
};
export {
  Clipper2Engine,
  clipper2Engine,
  offsetWithClipper2,
  repairWithClipper2,
  type Clipper2JoinType,
  type Clipper2OffsetOptions,
} from './clipper2Engine';
export { PolygonClippingEngine } from './polygonClippingEngine';
export {
  bufferMultiPolygon,
  bufferMultiPolygonResult,
  bufferPolygon,
  bufferPolygonResult,
  offsetMultiPolygon,
  offsetMultiPolygonResult,
  offsetPolygon,
  offsetPolygonResult,
  type BufferOptions,
  type OffsetDiagnostic,
  type OffsetFailureReason,
  type OffsetResult,
} from './offset';
export {
  repairMultiPolygon,
  repairMultiPolygonResult,
  repairPolygon,
  repairPolygonResult,
  repairRing,
  repairRingResult,
  type RepairFailureReason,
  type RepairResult,
} from './repair';
export {
  chamferPolygon,
  chamferRing,
  filletPolygon,
  filletRing,
  type FilletOptions,
  type PolygonCornerOptions,
  type PolygonCornerSelection,
  type PolygonFilletOptions,
  type RingCornerOptions,
  type RingVertexSelection,
} from './corner';
export {
  minimumAreaBoundingRectangle,
  minimumAreaBoundingRectangleForMultiPolygon,
  minimumAreaBoundingRectangleForPolygon,
  type MinimumAreaBoundingRectangle,
} from './minimumBoundingRectangle';
export {
  BBoxSpatialIndex,
  bboxContainsPoint,
  bboxesIntersect,
  normalizeBBox,
  type BBoxIndexItem,
} from './spatialIndex';
