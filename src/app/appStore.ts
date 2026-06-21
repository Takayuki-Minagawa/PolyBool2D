import { create } from 'zustand';
import { defaultEngine } from '../geometry/geometryEngine';
import { circleToRing, rectangleToRing } from '../geometry/circle';
import { knifeSplitPolygon } from '../geometry/knifeSplit';
import { polygonArea } from '../geometry/area';
import { translatePolygon } from '../geometry/translate';
import {
  mirrorPolygon,
  rotatePolygon,
  scalePolygon,
  type MirrorAxis,
} from '../geometry/transform2d';
import { convexHull } from '../geometry/convexHull';
import { simplifyRing } from '../geometry/simplify';
import { insertVertexInRing, deleteVertexFromRing } from '../geometry/vertexEdit';
import { normalizePolygon } from '../geometry/normalize';
import { polygonBBox, type BBox } from '../geometry/measure';
import type { Point, PolygonGeometry, Ring } from '../geometry/types';
import { createEmptyProject, createPolygonEntity } from './projectFactory';
import type {
  Entity,
  PolygonEntity,
  Project,
  ProjectSettings,
  ToolName,
  VertexRef,
  ViewTransform,
} from './projectTypes';
import { boundsForEntities, defaultView } from './transform';

export type AlignMode =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'centerX'
  | 'centerY';

const HISTORY_LIMIT = 50;
const DUPLICATE_OFFSET_FACTOR = 0.5;

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
  selectAll: () => void;
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
  return structuredClone(v);
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

function touchProject(project: Project, entities: Entity[]): Project {
  return { ...project, entities, updatedAt: new Date().toISOString() };
}

function isPolygon(e: Entity): e is PolygonEntity {
  return e.type === 'polygon';
}

function polygonsByIds(project: Project, ids: string[]): PolygonEntity[] {
  return project.entities.filter(
    (e): e is PolygonEntity => isPolygon(e) && ids.includes(e.id),
  );
}

/** Translation needed to align `box` to the `group` bounds for the given mode. */
function alignOffset(box: BBox, group: BBox, mode: AlignMode): { dx: number; dy: number } {
  switch (mode) {
    case 'left':
      return { dx: group.minX - box.minX, dy: 0 };
    case 'right':
      return { dx: group.maxX - box.maxX, dy: 0 };
    case 'top':
      return { dx: 0, dy: group.maxY - box.maxY };
    case 'bottom':
      return { dx: 0, dy: group.minY - box.minY };
    case 'centerX':
      return {
        dx: (group.minX + group.maxX) / 2 - (box.minX + box.maxX) / 2,
        dy: 0,
      };
    case 'centerY':
      return {
        dx: 0,
        dy: (group.minY + group.maxY) / 2 - (box.minY + box.maxY) / 2,
      };
  }
}

export const useAppStore = create<AppState>()((set, get) => {
  /** Replace `removeIds` entities with `added`, select the new ones. Records history. */
  function replaceEntities(removeIds: string[], added: PolygonEntity[]) {
    get().pushHistory();
    set((s) => ({
      project: touchProject(s.project, [
        ...s.project.entities.filter((e) => !removeIds.includes(e.id)),
        ...added,
      ]),
      selectedEntityIds: added.map((e) => e.id),
    }));
  }

  /** Shared flow for union / intersection / xor on the current selection. */
  function applyBooleanToSelection(
    op: 'union' | 'intersection' | 'xor',
    name: string,
  ) {
    const { project, selectedEntityIds } = get();
    const polys = polygonsByIds(project, selectedEntityIds);
    if (polys.length < 2) {
      get().setErrorMessage('errors.booleanNeedsTwo');
      return;
    }
    const result = defaultEngine[op](polys.map((p) => p.geometry));
    if (result.length === 0) {
      get().setErrorMessage('errors.emptyResult');
      return;
    }
    const newEntities = result.map((g) =>
      createPolygonEntity(g, {
        name,
        metadata: { sourceShape: 'boolean-result', createdByOperation: op },
        layerId: polys[0].layerId,
      }),
    );
    replaceEntities(selectedEntityIds, newEntities);
  }

  function getPolygon(id: string): PolygonEntity | undefined {
    return get().project.entities.find(
      (e): e is PolygonEntity => isPolygon(e) && e.id === id,
    );
  }

  /**
   * Apply a geometric transform to each selected polygon about the selection's
   * bounding-box centre. The result is normalised so the winding convention
   * (CCW outer / CW holes) is restored after mirrors and negative scales.
   */
  function transformSelected(
    fn: (geom: PolygonGeometry, pivot: Point) => PolygonGeometry,
  ) {
    const { project, selectedEntityIds } = get();
    const polys = polygonsByIds(project, selectedEntityIds);
    if (polys.length === 0) return;
    const bounds = boundsForEntities(polys);
    if (!bounds) return;
    const pivot = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    get().pushHistory();
    set((s) => ({
      project: touchProject(
        s.project,
        s.project.entities.map((e) => {
          if (!isPolygon(e) || !selectedEntityIds.includes(e.id)) return e;
          const normalized = normalizePolygon(fn(e.geometry, pivot));
          return normalized ? { ...e, geometry: normalized } : e;
        }),
      ),
    }));
  }

  /** Apply `fn` to the ring referenced by `ref`, returning the new geometry. */
  function editRing(
    ref: VertexRef,
    fn: (ring: Ring) => Ring | null,
  ): PolygonGeometry | 'too-few' | null {
    const ent = getPolygon(ref.entityId);
    if (!ent) return null;
    if (ref.ringType === 'outer') {
      const next = fn(ent.geometry.outer);
      if (next === null) return 'too-few';
      return { outer: next, holes: ent.geometry.holes };
    }
    const hi = ref.holeIndex ?? -1;
    if (hi < 0 || hi >= ent.geometry.holes.length) return null;
    const next = fn(ent.geometry.holes[hi]);
    if (next === null) return 'too-few';
    return {
      outer: ent.geometry.outer,
      holes: ent.geometry.holes.map((h, i) => (i === hi ? next : h)),
    };
  }

  return {
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

    selectAll: () =>
      set((s) => ({
        selectedEntityIds: s.project.entities.filter(isPolygon).map((e) => e.id),
      })),

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
      set((s) => ({
        project: touchProject(s.project, [...s.project.entities, entity]),
        selectedEntityIds: [entity.id],
      }));
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
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) =>
            e.id === id && isPolygon(e) ? { ...e, geometry: geom } : e,
          ),
        ),
      }));
    },

    removeEntities: (ids) => {
      if (ids.length === 0) return;
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.filter((e) => !ids.includes(e.id)),
        ),
        selectedEntityIds: s.selectedEntityIds.filter((id) => !ids.includes(id)),
      }));
    },

    unionSelected: () => applyBooleanToSelection('union', 'Union'),

    intersectSelected: () => applyBooleanToSelection('intersection', 'Intersection'),

    xorSelected: () => applyBooleanToSelection('xor', 'XOR'),

    differenceSelected: (subjectId, cutterIds) => {
      const { project } = get();
      const subject = polygonsByIds(project, [subjectId])[0];
      if (!subject) {
        get().setErrorMessage('errors.subjectNotSelected');
        return;
      }
      const cutters = polygonsByIds(project, cutterIds);
      if (cutters.length === 0) {
        get().setErrorMessage('errors.cutterNotSelected');
        return;
      }
      const result = defaultEngine.difference(
        [subject.geometry],
        cutters.map((c) => c.geometry),
      );
      const newEntities = result.map((g) =>
        createPolygonEntity(g, {
          name: 'Difference',
          metadata: {
            sourceShape: 'boolean-result',
            createdByOperation: 'difference',
          },
          layerId: subject.layerId,
        }),
      );
      replaceEntities([subjectId, ...cutterIds], newEntities);
    },

    knifeSelected: (entityId, start, end) => {
      const { project } = get();
      const target = polygonsByIds(project, [entityId])[0];
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
      const newEntities = result.polygons.map((g, i) =>
        createPolygonEntity(g, {
          name: `${target.name} (${i + 1})`,
          layerId: target.layerId,
          metadata: {
            sourceShape: 'knife-result',
            createdByOperation: 'knife',
          },
        }),
      );
      replaceEntities([entityId], newEntities);
      return true;
    },

    duplicateSelected: () => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length === 0) return;
      const offset = project.settings.gridSize * DUPLICATE_OFFSET_FACTOR;
      get().pushHistory();
      const copies = polys.map((p) =>
        createPolygonEntity(translatePolygon(p.geometry, offset, -offset), {
          name: `${p.name} copy`,
          layerId: p.layerId,
          metadata: p.metadata ? { ...p.metadata } : undefined,
        }),
      );
      set((s) => ({
        project: touchProject(s.project, [...s.project.entities, ...copies]),
        selectedEntityIds: copies.map((e) => e.id),
      }));
    },

    translateEntities: (ids, dx, dy, recordHistory = true) => {
      if (ids.length === 0 || (dx === 0 && dy === 0)) return;
      if (recordHistory) get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) =>
            isPolygon(e) && ids.includes(e.id)
              ? { ...e, geometry: translatePolygon(e.geometry, dx, dy) }
              : e,
          ),
        ),
      }));
    },

    rotateSelected: (angleRad) =>
      transformSelected((geom, pivot) => rotatePolygon(geom, pivot, angleRad)),

    scaleSelected: (sx, sy) => {
      if (sx === 0 || sy === 0 || !Number.isFinite(sx) || !Number.isFinite(sy)) {
        get().setErrorMessage('errors.invalidScale');
        return;
      }
      transformSelected((geom, pivot) => scalePolygon(geom, pivot, sx, sy));
    },

    mirrorSelected: (axis) =>
      transformSelected((geom, pivot) => mirrorPolygon(geom, pivot, axis)),

    convexHullSelected: () => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length === 0) return;
      const points: Point[] = [];
      for (const p of polys) {
        for (const ring of [p.geometry.outer, ...p.geometry.holes]) {
          for (const pt of ring) points.push(pt);
        }
      }
      const hull = convexHull(points);
      if (!hull) {
        get().setErrorMessage('errors.hullDegenerate');
        return;
      }
      const created = createPolygonEntity(
        { outer: hull, holes: [] },
        {
          name: 'Convex hull',
          layerId: polys[0].layerId,
          metadata: { sourceShape: 'polygon', createdByOperation: 'draw' },
        },
      );
      replaceEntities(selectedEntityIds, [created]);
    },

    simplifySelected: (tolerance) => {
      if (!(tolerance > 0)) return;
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length === 0) return;
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) => {
            if (!isPolygon(e) || !selectedEntityIds.includes(e.id)) return e;
            const simplified: PolygonGeometry = {
              outer: simplifyRing(e.geometry.outer, tolerance),
              holes: e.geometry.holes.map((h) => simplifyRing(h, tolerance)),
            };
            const normalized = normalizePolygon(simplified);
            return normalized ? { ...e, geometry: normalized } : e;
          }),
        ),
      }));
    },

    alignSelected: (mode) => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length < 2) return;
      const group = boundsForEntities(polys);
      if (!group) return;
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) => {
            if (!isPolygon(e) || !selectedEntityIds.includes(e.id)) return e;
            const box = polygonBBox(e.geometry);
            if (!box) return e;
            const { dx, dy } = alignOffset(box, group, mode);
            return dx === 0 && dy === 0
              ? e
              : { ...e, geometry: translatePolygon(e.geometry, dx, dy) };
          }),
        ),
      }));
    },

    distributeSelected: (axis) => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length < 3) return;
      const items = polys
        .map((p) => ({ id: p.id, box: polygonBBox(p.geometry) }))
        .filter((it): it is { id: string; box: BBox } => it.box !== null)
        .map((it) => ({
          id: it.id,
          center: axis === 'x'
            ? (it.box.minX + it.box.maxX) / 2
            : (it.box.minY + it.box.maxY) / 2,
        }))
        .sort((a, b) => a.center - b.center);
      if (items.length < 3) return;
      const first = items[0].center;
      const last = items[items.length - 1].center;
      const step = (last - first) / (items.length - 1);
      const targetById = new Map<string, number>();
      items.forEach((it, i) => targetById.set(it.id, first + step * i));
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) => {
            if (!isPolygon(e)) return e;
            const target = targetById.get(e.id);
            if (target === undefined) return e;
            const box = polygonBBox(e.geometry);
            if (!box) return e;
            const center = axis === 'x'
              ? (box.minX + box.maxX) / 2
              : (box.minY + box.maxY) / 2;
            const delta = target - center;
            if (delta === 0) return e;
            return {
              ...e,
              geometry: translatePolygon(
                e.geometry,
                axis === 'x' ? delta : 0,
                axis === 'y' ? delta : 0,
              ),
            };
          }),
        ),
      }));
    },

    updateSettings: (partial) =>
      set((s) => ({
        project: {
          ...s.project,
          settings: { ...s.project.settings, ...partial },
          updatedAt: new Date().toISOString(),
        },
        // Settings changes branch the timeline; drop any pending redo so a
        // later redo cannot revert this change onto a stale project snapshot.
        history: { ...s.history, future: [] },
      })),

    insertVertex: (ref, point) => {
      const geom = editRing(ref, (ring) => insertVertexInRing(ring, ref.vertexIndex, point));
      if (geom && geom !== 'too-few') get().updateEntityGeometry(ref.entityId, geom);
    },

    deleteVertex: (ref) => {
      const geom = editRing(ref, (ring) => deleteVertexFromRing(ring, ref.vertexIndex));
      if (geom === 'too-few') {
        get().setErrorMessage('errors.vertexMinimum');
        return;
      }
      if (geom) get().updateEntityGeometry(ref.entityId, geom);
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
  };
});

export type { Entity };
