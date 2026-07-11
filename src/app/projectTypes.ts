import type { PolygonGeometry, Point } from '../geometry/types';

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

export type LinearEntityKind = 'guide' | 'polyline' | 'arc';

export type LineStyle = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

export type GuideLineEntity = {
  id: string;
  type: 'guide-line';
  name: string;
  kind: LinearEntityKind;
  layerId: string;
  points: Point[];
  style: LineStyle;
  locked: boolean;
  visible: boolean;
};

export type Entity = PolygonEntity | GuideLineEntity;

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

export const APP_VERSION = '0.2.0';

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
  angleSnapEnabled: true,
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
