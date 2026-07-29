import { makeId } from '../idUtils';
import {
  entitiesReassignedFromLayer,
  isEntityEffectivelyLocked,
  isEntityEffectivelyVisible,
  unlockedEntityIds,
  uniqueLayerName,
} from '../layers';
import type { Layer } from '../projectTypes';
import {
  resolveDrawingLayer,
  touchProject,
  touchProjectUpdatedAt,
} from './helpers';
import type { AppGet, AppSet, AppState } from './types';

const LAYER_COLORS = ['#3a8dde', '#e05d5d', '#41a66b', '#9b6bd3', '#d58b2a', '#2ca6a4'];

export function createLayerActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'addLayer'
  | 'updateLayer'
  | 'removeLayer'
  | 'setActiveLayer'
  | 'assignSelectedToLayer'
  | 'updateEntityProperties'
> {
  return {
    addLayer: () => {
      const state = get();
      const layer: Layer = {
        id: makeId('layer'),
        name: uniqueLayerName(state.project.layers, 'Layer'),
        visible: true,
        locked: false,
        color: LAYER_COLORS[state.project.layers.length % LAYER_COLORS.length],
      };
      state.pushHistory();
      set((current) => ({
        project: touchProjectUpdatedAt({
          ...current.project,
          layers: [...current.project.layers, layer],
        }),
        ui: { ...current.ui, activeLayerId: layer.id },
      }));
      return layer;
    },

    updateLayer: (id, partial) => {
      const current = get();
      const existing = current.project.layers.find((layer) => layer.id === id);
      if (!existing) return;
      const sanitized = { ...partial };
      if (sanitized.name !== undefined) {
        sanitized.name = sanitized.name.trim();
        if (!sanitized.name) delete sanitized.name;
      }
      const changed =
        (sanitized.name !== undefined && sanitized.name !== existing.name) ||
        (sanitized.visible !== undefined && sanitized.visible !== existing.visible) ||
        (sanitized.locked !== undefined && sanitized.locked !== existing.locked) ||
        (sanitized.color !== undefined && sanitized.color !== existing.color);
      if (!changed) return;
      current.pushHistory();
      set((state) => {
        const project = touchProjectUpdatedAt({
          ...state.project,
          layers: state.project.layers.map((layer) =>
            layer.id === id ? { ...layer, ...sanitized } : layer,
          ),
        });
        const activeLayerId =
          resolveDrawingLayer(project, state.ui.activeLayerId)?.id ??
          project.layers[0]?.id ??
          '';
        return {
          project,
          selectedEntityIds: state.selectedEntityIds.filter((entityId) => {
            const entity = project.entities.find((item) => item.id === entityId);
            return entity
              ? isEntityEffectivelyVisible(project, entity) &&
                  !isEntityEffectivelyLocked(project, entity)
              : false;
          }),
          ui: { ...state.ui, activeLayerId },
        };
      });
    },

    removeLayer: (id) => {
      const current = get();
      if (current.project.layers.length <= 1) {
        current.setErrorMessage('errors.layerMinimum');
        return;
      }
      const existing = current.project.layers.find((layer) => layer.id === id);
      const fallback = current.project.layers.find((layer) => layer.id !== id);
      if (
        !existing ||
        existing.locked ||
        !fallback ||
        current.project.entities.some(
          (entity) =>
            entity.layerId === id &&
            isEntityEffectivelyLocked(current.project, entity),
        )
      ) return;
      current.pushHistory();
      set((state) => ({
        project: touchProjectUpdatedAt({
          ...state.project,
          layers: state.project.layers.filter((layer) => layer.id !== id),
          entities: entitiesReassignedFromLayer(state.project.entities, id, fallback.id),
        }),
        ui: {
          ...state.ui,
          activeLayerId: state.ui.activeLayerId === id ? fallback.id : state.ui.activeLayerId,
        },
      }));
    },

    setActiveLayer: (id) =>
      set((state) =>
        state.project.layers.some(
          (layer) => layer.id === id && layer.visible && !layer.locked,
        )
          ? { ui: { ...state.ui, activeLayerId: id } }
          : state,
      ),

    assignSelectedToLayer: (layerId) => {
      const current = get();
      const targetLayer = current.project.layers.find(
        (layer) => layer.id === layerId,
      );
      if (
        current.selectedEntityIds.length === 0 ||
        !targetLayer
      ) {
        return;
      }
      const selected = new Set(
        unlockedEntityIds(current.project, current.selectedEntityIds),
      );
      const changedIds = new Set(
        current.project.entities
          .filter(
            (entity) =>
              selected.has(entity.id) &&
              entity.layerId !== layerId,
          )
          .map((entity) => entity.id),
      );
      if (changedIds.size === 0) return;
      current.pushHistory();
      set((state) => ({
        project: touchProject(
          state.project,
          state.project.entities.map((entity) =>
            changedIds.has(entity.id) ? { ...entity, layerId } : entity,
          ),
        ),
        selectedEntityIds:
          targetLayer.locked || !targetLayer.visible ? [] : [...selected],
      }));
    },

    updateEntityProperties: (id, partial) => {
      const current = get();
      const existing = current.project.entities.find((entity) => entity.id === id);
      if (!existing) return;
      const sanitized = { ...partial };
      if (sanitized.name !== undefined) {
        sanitized.name = sanitized.name.trim();
        if (!sanitized.name) delete sanitized.name;
      }
      if (
        sanitized.layerId !== undefined
      ) {
        const targetLayer = current.project.layers.find(
          (layer) => layer.id === sanitized.layerId,
        );
        if (
          !targetLayer ||
          isEntityEffectivelyLocked(current.project, existing)
        ) {
          delete sanitized.layerId;
        }
      }
      const changed =
        (sanitized.name !== undefined && sanitized.name !== existing.name) ||
        (sanitized.visible !== undefined && sanitized.visible !== existing.visible) ||
        (sanitized.locked !== undefined && sanitized.locked !== existing.locked) ||
        (sanitized.layerId !== undefined && sanitized.layerId !== existing.layerId);
      if (!changed) return;
      current.pushHistory();
      set((state) => {
        const entities = state.project.entities.map((entity) =>
          entity.id === id
            ? {
                ...entity,
                ...sanitized,
                // Linear entities and polygons both accept these shared fields;
                // name is only present after schema migration for linear entities.
              }
            : entity,
        );
        const project = touchProject(state.project, entities);
        return {
          project,
          selectedEntityIds: state.selectedEntityIds.filter((entityId) => {
            const entity = project.entities.find((item) => item.id === entityId);
            return entity
              ? isEntityEffectivelyVisible(project, entity) &&
                  !isEntityEffectivelyLocked(project, entity)
              : false;
          }),
        };
      });
    },
  };
}
