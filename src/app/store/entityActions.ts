import { defaultEngine } from '../../geometry/geometryEngine';
import { circleToRing, rectangleToRing } from '../../geometry/circle';
import { translatePolygon } from '../../geometry/translate';
import type { PolygonGeometry } from '../../geometry/types';
import { createPolygonEntity } from '../projectFactory';
import { copyEntities, pasteEntities } from '../clipboard';
import { isEntityEffectivelyLocked } from '../layers';
import type { Entity, ProjectSettings, Unit } from '../projectTypes';
import {
  applyTransientGeometryUpdates,
  DUPLICATE_OFFSET_FACTOR,
  isPolygon,
  touchProject,
  touchProjectSettings,
} from './helpers';
import type { AppGet, AppSet, AppState } from './types';

export function createEntityActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'addPolygonFromOuter'
  | 'importPolygonGeometries'
  | 'addRectangle'
  | 'addCircle'
  | 'updateEntityGeometry'
  | 'updateEntityGeometryTransient'
  | 'updateEntitiesGeometryTransient'
  | 'updateEntitiesTransient'
  | 'removeEntities'
  | 'duplicateSelected'
  | 'translateEntities'
  | 'updateSettings'
  | 'updateProjectUnit'
> {
  return {
    addPolygonFromOuter: (outer, metadata) => {
      const validation = defaultEngine.validate([{ outer, holes: [] }]);
      if (!validation.valid) {
        get().setErrorMessage(`errors.validation.${validation.issues[0]}`);
        return null;
      }
      const ring = defaultEngine.normalize([{ outer, holes: [] }]);
      if (ring.length === 0) {
        get().setErrorMessage('errors.invalidPolygon');
        return null;
      }
      const state = get();
      const layer =
        state.project.layers.find(
          (layer) =>
            layer.id === state.ui.activeLayerId && layer.visible && !layer.locked,
        ) ?? state.project.layers.find((layer) => layer.visible && !layer.locked);
      if (!layer) {
        get().setErrorMessage('errors.noDrawableLayer');
        return null;
      }
      get().pushHistory();
      const layerId = layer.id;
      const entity = createPolygonEntity(ring[0], { metadata, layerId });
      set((s) => ({
        project: touchProject(s.project, [...s.project.entities, entity]),
        selectedEntityIds: [entity.id],
      }));
      get().validateEntity(entity.id);
      return entity;
    },

    importPolygonGeometries: (geometries) => {
      if (geometries.length === 0) return [];
      const validation = defaultEngine.validate(geometries);
      if (!validation.valid) {
        get().setErrorMessage(`errors.validation.${validation.issues[0]}`);
        return [];
      }
      const normalized = defaultEngine.normalize(geometries);
      if (normalized.length === 0) {
        get().setErrorMessage('errors.invalidPolygon');
        return [];
      }
      const state = get();
      const layer =
        state.project.layers.find(
          (candidate) =>
            candidate.id === state.ui.activeLayerId && candidate.visible && !candidate.locked,
        ) ?? state.project.layers.find((candidate) => candidate.visible && !candidate.locked);
      if (!layer) {
        get().setErrorMessage('errors.noDrawableLayer');
        return [];
      }
      const entities = normalized.map((geometry) =>
        createPolygonEntity(geometry, {
          layerId: layer.id,
          metadata: { sourceShape: 'svg-import', createdByOperation: 'import' },
        }),
      );
      get().pushHistory();
      set((current) => ({
        project: touchProject(current.project, [...current.project.entities, ...entities]),
        selectedEntityIds: entities.map((entity) => entity.id),
      }));
      return entities;
    },

    addRectangle: (p1, p2) => {
      const ring = rectangleToRing(p1, p2);
      return get().addPolygonFromOuter(ring, {
        sourceShape: 'rectangle',
        createdByOperation: 'draw',
      });
    },

    addCircle: (center, radius) => {
      if (
        !Number.isFinite(center.x) ||
        !Number.isFinite(center.y) ||
        !Number.isFinite(radius) ||
        radius <= 0
      ) {
        get().setErrorMessage('errors.invalidPolygon');
        return null;
      }
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
      get().validateEntity(id);
    },

    updateEntityGeometryTransient: (id, geom) => {
      get().updateEntitiesGeometryTransient(new Map([[id, geom]]));
    },

    updateEntitiesGeometryTransient: (updates: Map<string, PolygonGeometry>) => {
      set((s) => ({ project: applyTransientGeometryUpdates(s.project, updates) }));
    },

    updateEntitiesTransient: (updates) => {
      if (updates.size === 0) return;
      set((state) => ({
        project: touchProject(
          state.project,
          state.project.entities.map((entity) => updates.get(entity.id) ?? entity),
        ),
      }));
    },

    removeEntities: (ids) => {
      if (ids.length === 0) return;
      const remove = new Set(ids);
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.filter((e) => !remove.has(e.id)),
        ),
        selectedEntityIds: s.selectedEntityIds.filter((id) => !remove.has(id)),
        ui: {
          ...s.ui,
          invalidEntityIds: s.ui.invalidEntityIds.filter((id) => !remove.has(id)),
        },
      }));
    },

    duplicateSelected: () => {
      const { project, selectedEntityIds } = get();
      const selected = new Set(selectedEntityIds);
      const originals = project.entities.filter(
        (entity) => selected.has(entity.id) && !isEntityEffectivelyLocked(project, entity),
      );
      if (originals.length === 0) return;
      const offset = project.settings.gridSize * DUPLICATE_OFFSET_FACTOR;
      const copies = pasteEntities(copyEntities(originals), offset).entities;
      get().pushHistory();
      set((s) => ({
        project: touchProject(s.project, [...s.project.entities, ...copies]),
        selectedEntityIds: copies.map((e) => e.id),
      }));
    },

    translateEntities: (ids, dx, dy, recordHistory = true) => {
      if (ids.length === 0 || (dx === 0 && dy === 0)) return;
      const wanted = new Set(ids);
      if (recordHistory) get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e): Entity => {
            if (!wanted.has(e.id)) return e;
            if (isPolygon(e)) {
              return { ...e, geometry: translatePolygon(e.geometry, dx, dy) };
            }
            return {
              ...e,
              points: e.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
            };
          }),
        ),
      }));
    },

    updateSettings: (partial: Partial<ProjectSettings>) => {
      const state = get();
      const changed = Object.entries(partial).some(
        ([key, value]) =>
          state.project.settings[key as keyof ProjectSettings] !== value,
      );
      if (!changed) return;
      get().pushHistory();
      set((s) => ({
        project: touchProjectSettings({
          ...s.project,
          settings: { ...s.project.settings, ...partial },
        }),
      }));
    },

    updateProjectUnit: (unit: Unit) => {
      if (get().project.unit === unit) return;
      get().pushHistory();
      set((s) => ({
        project: touchProjectSettings({ ...s.project, unit }),
      }));
    },
  };
}
