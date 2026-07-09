import type { StoreApi } from 'zustand';
import type { MirrorAxis } from '../../geometry/transform2d';
import type { Point, PolygonGeometry } from '../../geometry/types';
import type {
  Entity,
  PolygonEntity,
  Project,
  ProjectSettings,
  ToolName,
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
  | { type: 'rectangle'; start: Point; cursor: Point; constrainSquare: boolean }
  | { type: 'circle'; center: Point; cursor: Point }
  | { type: 'knife'; start: Point; cursor: Point };

export type AppUiState = {
  theme: Theme;
  language: Language;
  manualOpen: boolean;
  showGrid: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
};

export type AppState = {
  project: Project;
  selectedEntityIds: string[];
  activeTool: ToolName;
  view: ViewTransform;
  preview: DrawingPreview;
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
  addRectangle: (p1: Point, p2: Point) => PolygonEntity | null;
  addCircle: (center: Point, radius: number) => PolygonEntity | null;
  updateEntityGeometry: (id: string, geom: PolygonGeometry) => void;
  updateEntityGeometryTransient: (id: string, geom: PolygonGeometry) => void;
  updateEntitiesGeometryTransient: (updates: Map<string, PolygonGeometry>) => void;
  removeEntities: (ids: string[]) => void;
  unionSelected: () => void;
  intersectSelected: () => void;
  xorSelected: () => void;
  differenceSelected: (subjectId: string, cutterIds: string[]) => void;
  knifeSelected: (entityId: string, start: Point, end: Point) => boolean;
  duplicateSelected: () => void;
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
  updateSettings: (partial: Partial<ProjectSettings>) => void;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  setManualOpen: (v: boolean) => void;
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
