export type {
  GeometryEngine,
  GeometryValidationIssue,
  GeometryValidationResult,
  MultiPolygonGeometry,
  PolygonGeometry,
  Point,
  Ring,
  BooleanOperation,
} from './types';
export { EPS } from './types';
export { defaultEngine } from './polygonClippingEngine';
export {
  bufferMultiPolygon,
  bufferPolygon,
  offsetMultiPolygon,
  offsetPolygon,
  type BufferOptions,
} from './offset';
export {
  repairMultiPolygon,
  repairPolygon,
  repairRing,
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
