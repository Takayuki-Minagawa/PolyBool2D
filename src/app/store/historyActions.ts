import { createEmptyProject } from '../projectFactory';
import type { Project } from '../projectTypes';
import { clone, HISTORY_LIMIT } from './helpers';
import type { AppSet, AppState } from './types';

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
        return { project: prev, history: { past, future }, selectedEntityIds: [] };
      }),

    redo: () =>
      set((s) => {
        if (s.history.future.length === 0) return s;
        const [next, ...future] = s.history.future;
        const past = [...s.history.past, clone(s.project)];
        while (past.length > HISTORY_LIMIT) past.shift();
        return { project: next, history: { past, future }, selectedEntityIds: [] };
      }),

    resetProject: () =>
      set({
        project: createEmptyProject(),
        selectedEntityIds: [],
        history: { past: [], future: [] },
      }),

    loadProject: (p: Project) =>
      set({
        project: p,
        selectedEntityIds: [],
        history: { past: [], future: [] },
      }),
  };
}
