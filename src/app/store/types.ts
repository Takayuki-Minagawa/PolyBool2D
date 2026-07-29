import type { StoreApi } from 'zustand';
import type { MirrorAxis } from '../../geometry/transform2d';
import type { Point, PolygonGeometry, Ring } from '../../geometry/types';
import type { EntityClipboard } from '../clipboard';
import type {
  Entity,
  Layer,
  LinearEntityKind,
  PolygonEntity,
  Project,
  ProjectSettings,
  ToolName,
  Unit,
  VertexRef,
  ViewTransform,
} from '../projectTypes';
import type { Language, Theme } from '../preferences';

export type AlignMode =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'centerX'
  | 'centerY';

export type DrawingPreview =
  | { type: 'none' }
  | { type: 'polygon'; points: Point[]; cursor: Point | null }
  | { type: 'hole'; entityId: string; points: Point[]; cursor: Point | null }
  | { type: 'polyline'; points: Point[]; cursor: Point | null }
  | { type: 'rectangle'; start: Point; cursor: Point; constrainSquare: boolean }
  | { type: 'circle'; center: Point; cursor: Point }
  | { type: 'ellipse'; center: Point; cursor: Point }
  | { type: 'arc'; center: Point; start: Point | null; cursor: Point }
  | { type: 'guide-line'; start: Point; cursor: Point }
  | { type: 'measure'; points: Point[]; cursor: Point | null }
  | { type: 'linear-dimension'; points: Point[]; cursor: Point | null }
  | { type: 'angular-dimension'; points: Point[]; cursor: Point | null }
  | { type: 'knife'; start: Point; cursor: Point };

export type AppUiState = {
  theme: Theme;
  language: Language;
  manualOpen: boolean;
  shortcutsOpen: boolean;
  projectManagerOpen: boolean;
  activeLayerId: string;
  invalidEntityIds: string[];
  showGrid: boolean;
  snapEnabled: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
};

export type AppState = {
  project: Project;
  /** Increments for committed scene changes; transient drag frames share a value. */
  snapRevision: number;
  selectedEntityIds: string[];
  activeTool: ToolName;
  view: ViewTransform;
  preview: DrawingPreview;
  clipboard: EntityClipboard;
  history: { past: Project[]; future: Project[] };
  ui: AppUiState;
  setActiveTool: (tool: ToolName) => void;
  setView: (view: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setPreview: (preview: DrawingPreview) => void;
  selectEntity: (id: string, additive: boolean) => void;
  selectMany: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  addPolygonFromOuter: (
    outer: Point[],
    metadata?: PolygonEntity['metadata'],
  ) => PolygonEntity | null;
  importPolygonGeometries: (geometries: PolygonGeometry[]) => PolygonEntity[];
  importDrawingGeometries: (
    polygons: PolygonGeometry[],
    linears: Array<{
      points: Point[];
      kind: Extract<LinearEntityKind, 'polyline' | 'arc'>;
    }>,
  ) => Entity[];
  addRectangle: (p1: Point, p2: Point) => PolygonEntity | null;
  addCircle: (center: Point, radius: number) => PolygonEntity | null;
  addEllipse: (center: Point, radiusX: number, radiusY: number) => PolygonEntity | null;
  addLinearEntity: (
    points: Point[],
    kind: LinearEntityKind,
    options?: Partial<
      Pick<
        import('../projectTypes').LinearEntity,
        'name' | 'style' | 'label' | 'precision' | 'textHeight' | 'rotationDeg'
      >
    >,
  ) => Entity | null;
  addHole: (entityId: string, ring: Ring) => boolean;
  removeHole: (entityId: string, holeIndex: number) => void;
  updateEntityGeometry: (id: string, geom: PolygonGeometry) => void;
  updateEntityGeometryTransient: (id: string, geom: PolygonGeometry) => void;
  updateEntitiesTransient: (updates: Map<string, Entity>) => void;
  removeEntities: (ids: string[]) => void;
  unionSelected: () => void;
  intersectSelected: () => void;
  xorSelected: () => void;
  differenceSelected: (subjectId: string, cutterIds: string[]) => void;
  knifeSelected: (entityId: string, start: Point, end: Point) => boolean;
  duplicateSelected: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: () => void;
  translateEntities: (ids: string[], dx: number, dy: number, recordHistory?: boolean) => void;
  rotateSelected: (angleRad: number) => void;
  scaleSelected: (sx: number, sy: number) => void;
  mirrorSelected: (axis: MirrorAxis) => void;
  convexHullSelected: () => void;
  simplifySelected: (tolerance: number) => void;
  alignSelected: (mode: AlignMode) => void;
  distributeSelected: (axis: 'x' | 'y') => void;
  insertVertex: (ref: VertexRef, point: Point) => void;
  deleteVertex: (ref: VertexRef) => void;
  validateEntity: (id: string) => boolean;
  updateEntityProperties: (
    id: string,
    partial: { name?: string; visible?: boolean; locked?: boolean; layerId?: string },
  ) => void;
  addLayer: () => Layer;
  updateLayer: (id: string, partial: Partial<Omit<Layer, 'id'>>) => void;
  removeLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
  assignSelectedToLayer: (layerId: string) => void;
  offsetSelected: (distance: number) => void;
  repairSelected: () => void;
  chamferSelected: (distance: number) => void;
  filletSelected: (radius: number, segments?: number) => void;
  minimumBoundingRectangleSelected: () => void;
  updateSettings: (partial: Partial<ProjectSettings>) => void;
  updateProjectUnit: (unit: Unit) => void;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  setManualOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setProjectManagerOpen: (v: boolean) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setStatusMessage: (m: string | null) => void;
  setErrorMessage: (m: string | null) => void;
  undo: () => void;
  redo: () => void;
  resetProject: () => void;
  loadProject: (p: Project) => void;
  pushHistory: () => void;
};

export type AppSet = StoreApi<AppState>['setState'];
export type AppGet = StoreApi<AppState>['getState'];

export type { Entity, Theme, Language };
