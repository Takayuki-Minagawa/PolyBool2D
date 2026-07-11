import { copyEntities, pasteEntities } from '../clipboard';
import { isEntityEffectivelyLocked } from '../layers';
import { touchProject } from './helpers';
import type { AppGet, AppSet, AppState } from './types';

export function createClipboardActions(set: AppSet, get: AppGet): Pick<
  AppState,
  'copySelected' | 'cutSelected' | 'pasteClipboard'
> {
  return {
    copySelected: () => {
      const state = get();
      const selected = new Set(state.selectedEntityIds);
      const entities = state.project.entities.filter(
        (entity) => selected.has(entity.id) && !isEntityEffectivelyLocked(state.project, entity),
      );
      if (entities.length === 0) return;
      set({ clipboard: copyEntities(entities) });
    },

    cutSelected: () => {
      const state = get();
      const selected = new Set(state.selectedEntityIds);
      const ids = state.project.entities
        .filter(
          (entity) => selected.has(entity.id) && !isEntityEffectivelyLocked(state.project, entity),
        )
        .map((entity) => entity.id);
      if (ids.length === 0) return;
      state.copySelected();
      get().removeEntities(ids);
    },

    pasteClipboard: () => {
      const state = get();
      if (state.clipboard.entities.length === 0) return;
      const result = pasteEntities(
        state.clipboard,
        state.project.settings.gridSize * 0.5,
      );
      const layerIds = new Set(state.project.layers.map((layer) => layer.id));
      const activeLayerId = layerIds.has(state.ui.activeLayerId)
        ? state.ui.activeLayerId
        : state.project.layers[0].id;
      const entities = result.entities.map((entity) =>
        layerIds.has(entity.layerId) ? entity : { ...entity, layerId: activeLayerId },
      );
      state.pushHistory();
      set((current) => ({
        project: touchProject(current.project, [...current.project.entities, ...entities]),
        selectedEntityIds: entities.map((entity) => entity.id),
        clipboard: result.clipboard,
      }));
    },
  };
}
