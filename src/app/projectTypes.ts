import type { PolygonGeometry, Point } from '../geometry/types';
import type { EntityGroup } from './groups';
import type { ParametricConstraint } from '../geometry/constraints';
import packageMetadata from '../../package.json';

export type Unit = 'mm' | 'cm' | 'm';

/** Display unit for area readouts (independent of the project coordinate unit). */
export type AreaUnit = 'mm2' | 'cm2' | 'm2';

export type ProjectSettings = {
  gridSize: number;
  snapToGrid: boolean;
  snapToVertex: boolean;
  snapToEdge: boolean;
  snapTolerancePx: number;
  areaPrecision: number;
  coordinatePrecision: number;
  circleSegments: number;
  areaDisplayUnit: AreaUnit;
  angleSnapEnabled: boolean;
  angleSnapIncrementDeg: number;
};

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
};

export type EntityStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

export type PolygonEntity = {
  id: string;
  type: 'polygon';
  name: string;
  layerId: string;
  geometry: PolygonGeometry;
  style: EntityStyle;
  locked: boolean;
  visible: boolean;
  metadata?: {
    sourceShape?:
      | 'polygon'
      | 'rectangle'
      | 'circle'
      | 'ellipse'
      | 'boolean-result'
      | 'knife-result'
      | 'offset-result'
      | 'corner-result'
      | 'bounding-rectangle'
      | 'svg-import';
    createdByOperation?:
      | 'draw'
      | 'union'
      | 'difference'
      | 'intersection'
      | 'xor'
      | 'knife'
      | 'offset'
      | 'repair'
      | 'fillet'
      | 'chamfer'
      | 'minimum-bounds'
      | 'import';
  };
};

export type LinearEntityKind =
  | 'guide'
  | 'polyline'
  | 'arc'
  | 'linear-dimension'
  | 'angular-dimension'
  | 'annotation';

export type LineStyle = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

/**
 * Canonical non-polygon entity.
 *
 * Persisted point semantics:
 * - linear-dimension: measured start, measured end, dimension-line anchor
 * - angular-dimension: center, first ray, second ray, optional radius anchor
 * - annotation: insertion point
 *
 * The runtime discriminator stays `guide-line` for file and UI compatibility.
 */
export type LinearEntity = {
  id: string;
  type: 'guide-line';
  name: string;
  kind: LinearEntityKind;
  layerId: string;
  points: Point[];
  /** Custom dimension label or annotation text. */
  label?: string;
  /** Decimal precision for a generated dimension label. */
  precision?: number;
  /** Text height in project coordinate units. */
  textHeight?: number;
  /** Counter-clockwise world rotation, primarily for annotations. */
  rotationDeg?: number;
  style: LineStyle;
  locked: boolean;
  visible: boolean;
};

/** @deprecated Use LinearEntity. */
export type GuideLineEntity = LinearEntity;

export type Entity = PolygonEntity | LinearEntity;

export type Project = {
  id: string;
  name: string;
  version: string;
  unit: Unit;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  layers: Layer[];
  entities: Entity[];
  groups?: EntityGroup[];
  constraints?: ParametricConstraint[];
};

export type ToolName =
  | 'select'
  | 'pan'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'arc'
  | 'polyline'
  | 'hole'
  | 'guide-line'
  | 'measure'
  | 'linear-dimension'
  | 'angular-dimension'
  | 'annotation'
  | 'vertex-edit'
  | 'knife';

export type VertexRef = {
  entityId: string;
  ringType: 'outer' | 'hole';
  holeIndex?: number;
  vertexIndex: number;
};

export type ViewTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

/** Single source of truth: the application/package version declared at the repository root. */
export const APP_VERSION = packageMetadata.version;

/**
 * Persisted project schema version.
 *
 * This must only change when the on-disk project shape changes. Application
 * releases may advance independently without making existing files obsolete.
 */
export const PROJECT_SCHEMA_VERSION = '0.3.0';

export const DEFAULT_SETTINGS: ProjectSettings = {
  gridSize: 100,
  snapToGrid: true,
  snapToVertex: true,
  snapToEdge: true,
  snapTolerancePx: 12,
  areaPrecision: 3,
  coordinatePrecision: 3,
  circleSegments: 64,
  areaDisplayUnit: 'm2',
  // Keep legacy/free drawing behaviour unless the user explicitly enables
  // angular quantisation in project settings.
  angleSnapEnabled: false,
  angleSnapIncrementDeg: 15,
};

export const DEFAULT_STYLE: EntityStyle = {
  fill: 'var(--cad-fill)',
  stroke: 'var(--cad-stroke)',
  strokeWidth: 1.5,
  opacity: 0.7,
};

export const DEFAULT_LINE_STYLE: LineStyle = {
  stroke: 'var(--cad-stroke)',
  strokeWidth: 1.25,
  opacity: 0.9,
};
