import { createEmptyProject } from '../projectFactory';
import type { Project } from '../projectTypes';
import { validatePolygon } from '../../geometry/validation';
import { clone, HISTORY_LIMIT } from './helpers';
import type { AppSet, AppState } from './types';

function invalidEntityIds(project: Project): string[] {
  return project.entities
    .filter(
      (entity) => entity.type === 'polygon' && !validatePolygon(entity.geometry).valid,
    )
    .map((entity) => entity.id);
}

function drawingLayerId(project: Project, preferred?: string): string {
  return (
    project.layers.find(
      (layer) => layer.id === preferred && layer.visible && !layer.locked,
    )?.id ??
    project.layers.find((layer) => layer.visible && !layer.locked)?.id ??
    project.layers[0].id
  );
}

export function createHistoryActions(set: AppSet): Pick<
  AppState,
  'pushHistory' | 'undo' | 'redo' | 'resetProject' | 'loadProject'
> {
  return {
    pushHistory: () =>
      set((s) => {
        const past = [...s.history.past, clone(s.project)];
        while (past.length > HISTORY_LIMIT) past.shift();
        return { history: { past, future: [] } };
      }),

    undo: () =>
      set((s) => {
        if (s.history.past.length === 0) return s;
        const past = [...s.history.past];
        const prev = past.pop()!;
        const future = [clone(s.project), ...s.history.future];
        while (future.length > HISTORY_LIMIT) future.pop();
        const activeLayerId = drawingLayerId(prev, s.ui.activeLayerId);
        return {
          project: prev,
          history: { past, future },
          selectedEntityIds: [],
          ui: { ...s.ui, activeLayerId, invalidEntityIds: invalidEntityIds(prev) },
        };
      }),

    redo: () =>
      set((s) => {
        if (s.history.future.length === 0) return s;
        const [next, ...future] = s.history.future;
        const past = [...s.history.past, clone(s.project)];
        while (past.length > HISTORY_LIMIT) past.shift();
        const activeLayerId = drawingLayerId(next, s.ui.activeLayerId);
        return {
          project: next,
          history: { past, future },
          selectedEntityIds: [],
          ui: { ...s.ui, activeLayerId, invalidEntityIds: invalidEntityIds(next) },
        };
      }),

    resetProject: () =>
      set((state) => {
        const project = createEmptyProject();
        return {
          project,
          selectedEntityIds: [],
          history: { past: [], future: [] },
          ui: {
            ...state.ui,
            activeLayerId: drawingLayerId(project),
            invalidEntityIds: invalidEntityIds(project),
          },
        };
      }),

    loadProject: (p: Project) =>
      set((state) => ({
        project: p,
        selectedEntityIds: [],
        history: { past: [], future: [] },
        preview: { type: 'none' },
        ui: {
          ...state.ui,
          activeLayerId: drawingLayerId(p),
          invalidEntityIds: invalidEntityIds(p),
        },
      })),
  };
}
