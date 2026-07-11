import type { ViewTransform } from '../projectTypes';
import { isEntityEffectivelyLocked, isEntityEffectivelyVisible } from '../layers';
import type { AppSet, AppState } from './types';

export function createSelectionActions(set: AppSet): Pick<
  AppState,
  | 'setActiveTool'
  | 'setView'
  | 'setPreview'
  | 'selectEntity'
  | 'selectMany'
  | 'selectAll'
  | 'clearSelection'
> {
  return {
    setActiveTool: (tool) =>
      set((s) => ({
        activeTool: tool,
        preview: { type: 'none' },
        ui: { ...s.ui, errorMessage: null },
      })),

    setView: (view: ViewTransform | ((prev: ViewTransform) => ViewTransform)) =>
      set((s) => ({ view: typeof view === 'function' ? view(s.view) : view })),

    setPreview: (preview) => set({ preview }),

    selectEntity: (id, additive) =>
      set((s) => {
        const entity = s.project.entities.find((item) => item.id === id);
        if (
          !entity ||
          !isEntityEffectivelyVisible(s.project, entity) ||
          isEntityEffectivelyLocked(s.project, entity)
        ) {
          return s;
        }
        if (!additive) return { selectedEntityIds: [id] };
        if (s.selectedEntityIds.includes(id)) {
          return { selectedEntityIds: s.selectedEntityIds.filter((x) => x !== id) };
        }
        return { selectedEntityIds: [...s.selectedEntityIds, id] };
      }),

    selectMany: (ids) => set({ selectedEntityIds: ids }),

    selectAll: () =>
      set((s) => ({
        selectedEntityIds: s.project.entities
          .filter(
            (entity) =>
              isEntityEffectivelyVisible(s.project, entity) &&
              !isEntityEffectivelyLocked(s.project, entity),
          )
          .map((entity) => entity.id),
      })),

    clearSelection: () => set({ selectedEntityIds: [] }),
  };
}
