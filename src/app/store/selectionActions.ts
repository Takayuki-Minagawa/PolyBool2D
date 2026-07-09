import type { ViewTransform } from '../projectTypes';
import { isPolygon } from './helpers';
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
  };
}
