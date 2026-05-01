import type { PolygonGeometry, Point } from '../geometry/types';

export type Unit = 'mm' | 'cm' | 'm';

export type ProjectSettings = {
  gridSize: number;
  snapEnabled: boolean;
  snapToGrid: boolean;
  snapToVertex: boolean;
  snapToEdge: boolean;
  snapTolerancePx: number;
  areaPrecision: number;
  coordinatePrecision: number;
  circleSegments: number;
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
    sourceShape?: 'polygon' | 'rectangle' | 'circle' | 'boolean-result' | 'knife-result';
    createdByOperation?: 'draw' | 'union' | 'difference' | 'knife';
  };
};

export type GuideLineEntity = {
  id: string;
  type: 'guide-line';
  layerId: string;
  points: Point[];
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

export const APP_VERSION = '0.1.0';

export const DEFAULT_SETTINGS: ProjectSettings = {
  gridSize: 100,
  snapEnabled: true,
  snapToGrid: true,
  snapToVertex: true,
  snapToEdge: true,
  snapTolerancePx: 12,
  areaPrecision: 3,
  coordinatePrecision: 3,
  circleSegments: 64,
};

export const DEFAULT_STYLE: EntityStyle = {
  fill: 'var(--cad-fill)',
  stroke: 'var(--cad-stroke)',
  strokeWidth: 1.5,
  opacity: 0.7,
};
