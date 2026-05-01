import { create } from 'zustand';
import { defaultEngine } from '../geometry/geometryEngine';
import { circleToRing, rectangleToRing } from '../geometry/circle';
import { knifeSplitPolygon } from '../geometry/knifeSplit';
import { polygonArea } from '../geometry/area';
import type { Point, PolygonGeometry } from '../geometry/types';
import { createEmptyProject, createPolygonEntity } from './projectFactory';
import type {
  Entity,
  PolygonEntity,
  Project,
  ToolName,
  ViewTransform,
} from './projectTypes';
import { defaultView } from './transform';

const HISTORY_LIMIT = 50;

type Theme = 'light' | 'dark';

export type DrawingPreview =
  | { type: 'none' }
  | { type: 'polygon'; points: Point[]; cursor: Point | null }
  | { type: 'rectangle'; start: Point; cursor: Point; constrainSquare: boolean }
  | { type: 'circle'; center: Point; cursor: Point }
  | { type: 'knife'; start: Point; cursor: Point };

export type AppState = {
  project: Project;
  selectedEntityIds: string[];
  activeTool: ToolName;
  view: ViewTransform;
  preview: DrawingPreview;
  history: { past: Project[]; future: Project[] };
  ui: {
    theme: Theme;
    language: 'ja' | 'en';
    manualOpen: boolean;
    showGrid: boolean;
    snapEnabled: boolean;
    statusMessage: string | null;
    errorMessage: string | null;
  };
  setActiveTool: (tool: ToolName) => void;
  setView: (view: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setPreview: (preview: DrawingPreview) => void;
  selectEntity: (id: string, additive: boolean) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;
  addPolygonFromOuter: (
    outer: Point[],
    metadata?: PolygonEntity['metadata'],
  ) => PolygonEntity | null;
  addRectangle: (p1: Point, p2: Point) => PolygonEntity | null;
  addCircle: (center: Point, radius: number) => PolygonEntity | null;
  updateEntityGeometry: (id: string, geom: PolygonGeometry) => void;
  removeEntities: (ids: string[]) => void;
  unionSelected: () => void;
  differenceSelected: (subjectId: string, cutterIds: string[]) => void;
  knifeSelected: (entityId: string, start: Point, end: Point) => boolean;
  setTheme: (t: Theme) => void;
  setLanguage: (l: 'ja' | 'en') => void;
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

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function readTheme(): Theme {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('pb2d.theme') : null;
  if (stored === 'light' || stored === 'dark') return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function readLanguage(): 'ja' | 'en' {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('pb2d.lang') : null;
  if (stored === 'ja' || stored === 'en') return stored;
  return 'ja';
}

export const useAppStore = create<AppState>()((set, get) => ({
  project: createEmptyProject(),
  selectedEntityIds: [],
  activeTool: 'select',
  view: defaultView(800, 600),
  preview: { type: 'none' },
  history: { past: [], future: [] },
  ui: {
    theme: readTheme(),
    language: readLanguage(),
    manualOpen: false,
    showGrid: true,
    snapEnabled: true,
    statusMessage: null,
    errorMessage: null,
  },

  setActiveTool: (tool) =>
    set((s) => ({
      activeTool: tool,
      preview: { type: 'none' },
      ui: { ...s.ui, errorMessage: null },
    })),

  setView: (view) =>
    set((s) => ({ view: typeof view === 'function' ? view(s.view) : view })),

  setPreview: (preview) => set({ preview }),

  selectEntity: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedEntityIds: [id] };
      if (s.selectedEntityIds.includes(id)) {
        return { selectedEntityIds: s.selectedEntityIds.filter((x) => x !== id) };
      }
      return { selectedEntityIds: [...s.selectedEntityIds, id] };
    }),

  selectMany: (ids) => set({ selectedEntityIds: ids }),

  clearSelection: () => set({ selectedEntityIds: [] }),

  pushHistory: () =>
    set((s) => {
      const past = [...s.history.past, clone(s.project)];
      while (past.length > HISTORY_LIMIT) past.shift();
      return { history: { past, future: [] } };
    }),

  addPolygonFromOuter: (outer, metadata) => {
    const ring = defaultEngine.normalize([{ outer, holes: [] }]);
    if (ring.length === 0) {
      get().setErrorMessage('errors.invalidPolygon');
      return null;
    }
    get().pushHistory();
    const entity = createPolygonEntity(ring[0], { metadata });
    set((s) => {
      const project = {
        ...s.project,
        entities: [...s.project.entities, entity],
        updatedAt: new Date().toISOString(),
      };
      return { project, selectedEntityIds: [entity.id] };
    });
    return entity;
  },

  addRectangle: (p1, p2) => {
    const ring = rectangleToRing(p1, p2);
    return get().addPolygonFromOuter(ring, {
      sourceShape: 'rectangle',
      createdByOperation: 'draw',
    });
  },

  addCircle: (center, radius) => {
    if (radius <= 0) return null;
    const segments = get().project.settings.circleSegments;
    const ring = circleToRing(center, radius, segments);
    return get().addPolygonFromOuter(ring, {
      sourceShape: 'circle',
      createdByOperation: 'draw',
    });
  },

  updateEntityGeometry: (id, geom) => {
    get().pushHistory();
    set((s) => {
      const entities = s.project.entities.map((e) =>
        e.id === id && e.type === 'polygon'
          ? { ...e, geometry: geom }
          : e,
      );
      return {
        project: { ...s.project, entities, updatedAt: new Date().toISOString() },
      };
    });
  },

  removeEntities: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        entities: s.project.entities.filter((e) => !ids.includes(e.id)),
        updatedAt: new Date().toISOString(),
      },
      selectedEntityIds: s.selectedEntityIds.filter((id) => !ids.includes(id)),
    }));
  },

  unionSelected: () => {
    const { project, selectedEntityIds } = get();
    const polys = project.entities
      .filter(
        (e): e is PolygonEntity =>
          e.type === 'polygon' && selectedEntityIds.includes(e.id),
      );
    if (polys.length < 2) {
      get().setErrorMessage('errors.unionNeedsTwo');
      return;
    }
    const result = defaultEngine.union(polys.map((p) => [p.geometry]).flat());
    if (result.length === 0) {
      get().setErrorMessage('errors.emptyResult');
      return;
    }
    get().pushHistory();
    const newEntities: PolygonEntity[] = result.map((g) =>
      createPolygonEntity(g, {
        name: 'Union',
        metadata: { sourceShape: 'boolean-result', createdByOperation: 'union' },
        layerId: polys[0].layerId,
      }),
    );
    set((s) => ({
      project: {
        ...s.project,
        entities: [
          ...s.project.entities.filter((e) => !selectedEntityIds.includes(e.id)),
          ...newEntities,
        ],
        updatedAt: new Date().toISOString(),
      },
      selectedEntityIds: newEntities.map((e) => e.id),
    }));
  },

  differenceSelected: (subjectId, cutterIds) => {
    const { project } = get();
    const subject = project.entities.find(
      (e): e is PolygonEntity => e.id === subjectId && e.type === 'polygon',
    );
    if (!subject) {
      get().setErrorMessage('errors.subjectNotSelected');
      return;
    }
    const cutters = project.entities.filter(
      (e): e is PolygonEntity =>
        cutterIds.includes(e.id) && e.type === 'polygon',
    );
    if (cutters.length === 0) {
      get().setErrorMessage('errors.cutterNotSelected');
      return;
    }
    const result = defaultEngine.difference(
      [subject.geometry],
      cutters.map((c) => c.geometry),
    );
    get().pushHistory();
    const newEntities: PolygonEntity[] = result.map((g) =>
      createPolygonEntity(g, {
        name: 'Difference',
        metadata: {
          sourceShape: 'boolean-result',
          createdByOperation: 'difference',
        },
        layerId: subject.layerId,
      }),
    );
    set((s) => ({
      project: {
        ...s.project,
        entities: [
          ...s.project.entities.filter(
            (e) => e.id !== subjectId && !cutterIds.includes(e.id),
          ),
          ...newEntities,
        ],
        updatedAt: new Date().toISOString(),
      },
      selectedEntityIds: newEntities.map((e) => e.id),
    }));
  },

  knifeSelected: (entityId, start, end) => {
    const { project } = get();
    const target = project.entities.find(
      (e): e is PolygonEntity => e.id === entityId && e.type === 'polygon',
    );
    if (!target) {
      get().setErrorMessage('errors.knifeNoTarget');
      return false;
    }
    const result = knifeSplitPolygon(target.geometry, start, end);
    if (!result.ok) {
      get().setErrorMessage(`errors.knife.${result.reason}`);
      return false;
    }
    const totalBefore = polygonArea(target.geometry);
    const totalAfter = result.polygons.reduce(
      (acc, p) => acc + polygonArea(p),
      0,
    );
    if (Math.abs(totalBefore - totalAfter) > 1e-3) {
      get().setErrorMessage('errors.knife.areaMismatch');
      return false;
    }
    get().pushHistory();
    const newEntities: PolygonEntity[] = result.polygons.map((g, i) =>
      createPolygonEntity(g, {
        name: `${target.name} (${i + 1})`,
        layerId: target.layerId,
        metadata: {
          sourceShape: 'knife-result',
          createdByOperation: 'knife',
        },
      }),
    );
    set((s) => ({
      project: {
        ...s.project,
        entities: [
          ...s.project.entities.filter((e) => e.id !== entityId),
          ...newEntities,
        ],
        updatedAt: new Date().toISOString(),
      },
      selectedEntityIds: newEntities.map((e) => e.id),
    }));
    return true;
  },

  setTheme: (t) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('pb2d.theme', t);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
    }
    set((s) => ({ ui: { ...s.ui, theme: t } }));
  },

  setLanguage: (l) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('pb2d.lang', l);
    set((s) => ({ ui: { ...s.ui, language: l } }));
  },

  setManualOpen: (v) => set((s) => ({ ui: { ...s.ui, manualOpen: v } })),

  toggleGrid: () =>
    set((s) => ({ ui: { ...s.ui, showGrid: !s.ui.showGrid } })),

  toggleSnap: () =>
    set((s) => ({ ui: { ...s.ui, snapEnabled: !s.ui.snapEnabled } })),

  setStatusMessage: (m) =>
    set((s) => ({ ui: { ...s.ui, statusMessage: m } })),

  setErrorMessage: (m) =>
    set((s) => ({ ui: { ...s.ui, errorMessage: m } })),

  undo: () =>
    set((s) => {
      if (s.history.past.length === 0) return s;
      const past = [...s.history.past];
      const prev = past.pop()!;
      const future = [clone(s.project), ...s.history.future];
      while (future.length > HISTORY_LIMIT) future.pop();
      return { project: prev, history: { past, future }, selectedEntityIds: [] };
    }),

  redo: () =>
    set((s) => {
      if (s.history.future.length === 0) return s;
      const [next, ...future] = s.history.future;
      const past = [...s.history.past, clone(s.project)];
      while (past.length > HISTORY_LIMIT) past.shift();
      return { project: next, history: { past, future }, selectedEntityIds: [] };
    }),

  resetProject: () =>
    set({
      project: createEmptyProject(),
      selectedEntityIds: [],
      history: { past: [], future: [] },
    }),

  loadProject: (p) =>
    set({
      project: p,
      selectedEntityIds: [],
      history: { past: [], future: [] },
    }),
}));

export type { Entity };
