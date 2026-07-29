import type { ViewTransform } from '../projectTypes';
import { isEntityEffectivelyLocked, isEntityEffectivelyVisible } from '../layers';
import { expandGroupedSelection, type EntityGroup } from '../groups';
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
        const groups = (
          s.project as typeof s.project & { groups?: EntityGroup[] }
        ).groups ?? [];
        if (!additive) {
          return {
            selectedEntityIds: expandGroupedSelection([id], groups),
          };
        }
        if (s.selectedEntityIds.includes(id)) {
          const groupedIds = new Set(expandGroupedSelection([id], groups));
          return {
            selectedEntityIds: s.selectedEntityIds.filter(
              (selectedId) => !groupedIds.has(selectedId),
            ),
          };
        }
        return {
          selectedEntityIds: expandGroupedSelection(
            [...s.selectedEntityIds, id],
            groups,
          ),
        };
      }),

    selectMany: (ids) =>
      set((state) => ({
        selectedEntityIds: expandGroupedSelection(
          ids,
          (
            state.project as typeof state.project & { groups?: EntityGroup[] }
          ).groups ?? [],
        ),
      })),

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
