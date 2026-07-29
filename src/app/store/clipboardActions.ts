import { copyEntities, pasteEntities } from '../clipboard';
import { unlockedEntityIds } from '../layers';
import { resolveDrawingLayer, touchProject } from './helpers';
import type { AppGet, AppSet, AppState } from './types';

export function createClipboardActions(set: AppSet, get: AppGet): Pick<
  AppState,
  'copySelected' | 'cutSelected' | 'pasteClipboard'
> {
  return {
    copySelected: () => {
      const state = get();
      const selected = new Set(
        unlockedEntityIds(state.project, state.selectedEntityIds),
      );
      const entities = state.project.entities.filter(
        (entity) => selected.has(entity.id),
      );
      if (entities.length === 0) return;
      set({ clipboard: copyEntities(entities) });
    },

    cutSelected: () => {
      const state = get();
      const selected = new Set(
        unlockedEntityIds(state.project, state.selectedEntityIds),
      );
      const ids = state.project.entities
        .filter((entity) => selected.has(entity.id))
        .map((entity) => entity.id);
      if (ids.length === 0) return;
      set({
        clipboard: copyEntities(
          state.project.entities.filter((entity) => selected.has(entity.id)),
        ),
      });
      get().removeEntities(ids);
    },

    pasteClipboard: () => {
      const state = get();
      if (state.clipboard.entities.length === 0) return;
      const result = pasteEntities(
        state.clipboard,
        state.project.settings.gridSize * 0.5,
      );
      const targetLayer = resolveDrawingLayer(
        state.project,
        state.ui.activeLayerId,
      );
      if (!targetLayer) {
        state.setErrorMessage('errors.noDrawableLayer');
        return;
      }
      const writableLayerIds = new Set(
        state.project.layers
          .filter((layer) => layer.visible && !layer.locked)
          .map((layer) => layer.id),
      );
      const entities = result.entities.map((entity) =>
        writableLayerIds.has(entity.layerId)
          ? entity
          : { ...entity, layerId: targetLayer.id },
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
