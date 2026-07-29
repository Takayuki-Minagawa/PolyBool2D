import type { Project, ViewTransform } from '../projectTypes';
import { isEntityEffectivelyLocked, isEntityEffectivelyVisible } from '../layers';
import { expandGroupedSelection } from '../groups';
import type { AppSet, AppState } from './types';

function selectableGroupedIds(project: Project, ids: Iterable<string>): string[] {
  const entitiesById = new Map(
    project.entities.map((entity) => [entity.id, entity]),
  );
  const selectableSeeds = [...ids].filter((id) => {
    const entity = entitiesById.get(id);
    return (
      entity !== undefined &&
      isEntityEffectivelyVisible(project, entity) &&
      !isEntityEffectivelyLocked(project, entity)
    );
  });
  return expandGroupedSelection(selectableSeeds, project.groups ?? [])
    .filter((id) => {
      const entity = entitiesById.get(id);
      return (
        entity !== undefined &&
        isEntityEffectivelyVisible(project, entity) &&
        !isEntityEffectivelyLocked(project, entity)
      );
    });
}

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
        if (!additive) {
          return {
            selectedEntityIds: selectableGroupedIds(s.project, [id]),
          };
        }
        if (s.selectedEntityIds.includes(id)) {
          const groupedIds = new Set(
            expandGroupedSelection([id], s.project.groups ?? []),
          );
          return {
            selectedEntityIds: s.selectedEntityIds.filter(
              (selectedId) => !groupedIds.has(selectedId),
            ),
          };
        }
        return {
          selectedEntityIds: selectableGroupedIds(
            s.project,
            [...s.selectedEntityIds, id],
          ),
        };
      }),

    selectMany: (ids) =>
      set((state) => ({
        selectedEntityIds: selectableGroupedIds(state.project, ids),
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
