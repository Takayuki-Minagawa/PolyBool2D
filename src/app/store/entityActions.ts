import { getEngine } from '../../geometry/geometryEngine';
import { circleToRing, rectangleToRing } from '../../geometry/circle';
import { translatePolygon } from '../../geometry/translate';
import type { PolygonGeometry } from '../../geometry/types';
import { createLinearEntity, createPolygonEntity } from '../projectFactory';
import { copyEntities, pasteEntities } from '../clipboard';
import {
  isEntityEffectivelyLocked,
  unlockedEntityIds,
} from '../layers';
import type {
  Entity,
  PolygonEntity,
  ProjectSettings,
  Unit,
} from '../projectTypes';
import {
  applyTransientGeometryUpdates,
  DUPLICATE_OFFSET_FACTOR,
  isPolygon,
  resolveDrawingLayer,
  touchProject,
  touchProjectUpdatedAt,
} from './helpers';
import type { AppGet, AppSet, AppState } from './types';

export function createEntityActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'addPolygonFromOuter'
  | 'importPolygonGeometries'
  | 'importDrawingGeometries'
  | 'addRectangle'
  | 'addCircle'
  | 'updateEntityGeometry'
  | 'updateEntityGeometryTransient'
  | 'updateEntitiesTransient'
  | 'removeEntities'
  | 'duplicateSelected'
  | 'translateEntities'
  | 'updateSettings'
  | 'updateProjectUnit'
> {
  function updateEntitiesGeometryTransient(
    updates: Map<string, PolygonGeometry>,
  ): void {
    set((state) => ({
      project: applyTransientGeometryUpdates(state.project, updates),
    }));
  }

  function preparePolygonEntities(
    geometries: PolygonGeometry[],
    options: (geometry: PolygonGeometry) => {
      metadata?: PolygonEntity['metadata'];
      name?: string;
    },
  ): PolygonEntity[] {
    const validation = getEngine().validate(geometries);
    if (!validation.valid) {
      get().setErrorMessage(`errors.validation.${validation.issues[0]}`);
      return [];
    }
    const normalized = getEngine().normalize(geometries);
    if (normalized.length === 0) {
      get().setErrorMessage('errors.invalidPolygon');
      return [];
    }
    const state = get();
    const layer = resolveDrawingLayer(state.project, state.ui.activeLayerId);
    if (!layer) {
      get().setErrorMessage('errors.noDrawableLayer');
      return [];
    }
    return normalized.map((geometry) =>
      createPolygonEntity(geometry, {
        ...options(geometry),
        layerId: layer.id,
      }),
    );
  }

  function commitAddedEntities(entities: Entity[]): void {
    if (entities.length === 0) return;
    get().pushHistory();
    set((state) => ({
      project: touchProject(state.project, [
        ...state.project.entities,
        ...entities,
      ]),
      selectedEntityIds: entities.map((entity) => entity.id),
    }));
    for (const entity of entities) get().validateEntity(entity.id);
  }

  return {
    addPolygonFromOuter: (outer, metadata) => {
      const [entity] = preparePolygonEntities(
        [{ outer, holes: [] }],
        () => ({ metadata }),
      );
      if (!entity) return null;
      commitAddedEntities([entity]);
      return entity;
    },

    importPolygonGeometries: (geometries) => {
      if (geometries.length === 0) return [];
      const entities = preparePolygonEntities(geometries, () => ({
          metadata: { sourceShape: 'svg-import', createdByOperation: 'import' },
      }));
      commitAddedEntities(entities);
      return entities;
    },

    importDrawingGeometries: (geometries, linears) => {
      const polygonEntities = geometries.length > 0
        ? preparePolygonEntities(geometries, () => ({
            metadata: { sourceShape: 'polygon', createdByOperation: 'import' },
          }))
        : [];
      const state = get();
      const layer = resolveDrawingLayer(state.project, state.ui.activeLayerId);
      if (!layer && linears.length > 0) {
        state.setErrorMessage('errors.noDrawableLayer');
        return polygonEntities;
      }
      const linearEntities = layer
        ? linears.flatMap((item) => {
            const valid =
              item.points.length >= 2 &&
              item.points.every(
                (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
              ) &&
              item.points.some(
                (point) =>
                  Math.hypot(
                    point.x - item.points[0].x,
                    point.y - item.points[0].y,
                  ) > 1e-9,
              );
            return valid
              ? [createLinearEntity(item.points, item.kind, { layerId: layer.id })]
              : [];
          })
        : [];
      const entities: Entity[] = [...polygonEntities, ...linearEntities];
      commitAddedEntities(entities);
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
      const current = get();
      const target = current.project.entities.find(
        (entity) => entity.id === id && isPolygon(entity),
      );
      if (
        !target ||
        isEntityEffectivelyLocked(current.project, target)
      ) return;
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
      const state = get();
      const entity = state.project.entities.find((item) => item.id === id);
      if (!entity || isEntityEffectivelyLocked(state.project, entity)) return;
      updateEntitiesGeometryTransient(new Map([[id, geom]]));
    },

    updateEntitiesTransient: (updates) => {
      if (updates.size === 0) return;
      set((state) => ({
        project: touchProject(
          state.project,
          state.project.entities.map((entity) =>
            isEntityEffectivelyLocked(state.project, entity)
              ? entity
              : updates.get(entity.id) ?? entity,
          ),
        ),
      }));
    },

    removeEntities: (ids) => {
      if (ids.length === 0) return;
      const remove = new Set(unlockedEntityIds(get().project, ids));
      if (remove.size === 0) return;
      get().pushHistory();
      set((s) => {
        const project = touchProject(
          s.project,
          s.project.entities.filter((e) => !remove.has(e.id)),
        );
        return {
          project,
          selectedEntityIds: s.selectedEntityIds.filter((id) => !remove.has(id)),
          ui: {
            ...s.ui,
            invalidEntityIds: s.ui.invalidEntityIds.filter((id) => !remove.has(id)),
          },
        };
      });
    },

    duplicateSelected: () => {
      const { project, selectedEntityIds } = get();
      const selected = new Set(unlockedEntityIds(project, selectedEntityIds));
      const originals = project.entities.filter(
        (entity) => selected.has(entity.id),
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
      const wanted = new Set(unlockedEntityIds(get().project, ids));
      if (wanted.size === 0) return;
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
        project: touchProjectUpdatedAt({
          ...s.project,
          settings: { ...s.project.settings, ...partial },
        }),
      }));
    },

    updateProjectUnit: (unit: Unit) => {
      if (get().project.unit === unit) return;
      get().pushHistory();
      set((s) => ({
        project: touchProjectUpdatedAt({ ...s.project, unit }),
      }));
    },
  };
}
