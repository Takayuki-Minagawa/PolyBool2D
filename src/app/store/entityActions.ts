import { defaultEngine } from '../../geometry/geometryEngine';
import { circleToRing, rectangleToRing } from '../../geometry/circle';
import { translatePolygon } from '../../geometry/translate';
import type { PolygonGeometry } from '../../geometry/types';
import { createPolygonEntity } from '../projectFactory';
import type { Entity, ProjectSettings } from '../projectTypes';
import {
  applyTransientGeometryUpdates,
  DUPLICATE_OFFSET_FACTOR,
  isPolygon,
  polygonsByIds,
  touchProject,
  touchProjectSettings,
} from './helpers';
import type { AppGet, AppSet, AppState } from './types';

export function createEntityActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'addPolygonFromOuter'
  | 'addRectangle'
  | 'addCircle'
  | 'updateEntityGeometry'
  | 'updateEntityGeometryTransient'
  | 'updateEntitiesGeometryTransient'
  | 'removeEntities'
  | 'duplicateSelected'
  | 'translateEntities'
  | 'updateSettings'
> {
  return {
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

    updateEntityGeometryTransient: (id, geom) => {
      get().updateEntitiesGeometryTransient(new Map([[id, geom]]));
    },

    updateEntitiesGeometryTransient: (updates: Map<string, PolygonGeometry>) => {
      set((s) => ({ project: applyTransientGeometryUpdates(s.project, updates) }));
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
      }));
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
      const wanted = new Set(ids);
      if (recordHistory) get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e): Entity =>
            isPolygon(e) && wanted.has(e.id)
              ? { ...e, geometry: translatePolygon(e.geometry, dx, dy) }
              : e,
          ),
        ),
      }));
    },

    updateSettings: (partial: Partial<ProjectSettings>) =>
      set((s) => ({
        project: touchProjectSettings({
          ...s.project,
          settings: { ...s.project.settings, ...partial },
        }),
        history: { ...s.history, future: [] },
      })),
  };
}
