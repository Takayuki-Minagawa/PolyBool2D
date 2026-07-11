import { makeId } from '../idUtils';
import {
  entitiesReassignedFromLayer,
  isEntityEffectivelyLocked,
  isEntityEffectivelyVisible,
  uniqueLayerName,
} from '../layers';
import type { Layer } from '../projectTypes';
import { touchProject, touchProjectSettings } from './helpers';
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
        project: touchProjectSettings({
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
        const project = touchProjectSettings({
          ...state.project,
          layers: state.project.layers.map((layer) =>
            layer.id === id ? { ...layer, ...sanitized } : layer,
          ),
        });
        const activeLayerId = project.layers.some(
          (layer) =>
            layer.id === state.ui.activeLayerId && layer.visible && !layer.locked,
        )
          ? state.ui.activeLayerId
          : project.layers.find((layer) => layer.visible && !layer.locked)?.id ??
            project.layers[0].id;
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
      const fallback = current.project.layers.find((layer) => layer.id !== id);
      if (!fallback || !current.project.layers.some((layer) => layer.id === id)) return;
      current.pushHistory();
      set((state) => ({
        project: touchProjectSettings({
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
      if (
        current.selectedEntityIds.length === 0 ||
        !current.project.layers.some((layer) => layer.id === layerId)
      ) {
        return;
      }
      const selected = new Set(current.selectedEntityIds);
      current.pushHistory();
      set((state) => ({
        project: touchProject(
          state.project,
          state.project.entities.map((entity) =>
            selected.has(entity.id) ? { ...entity, layerId } : entity,
          ),
        ),
        selectedEntityIds: state.project.layers.find((layer) => layer.id === layerId)?.locked ||
          state.project.layers.find((layer) => layer.id === layerId)?.visible === false
          ? []
          : state.selectedEntityIds,
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
        sanitized.layerId !== undefined &&
        !current.project.layers.some((layer) => layer.id === sanitized.layerId)
      ) {
        delete sanitized.layerId;
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
