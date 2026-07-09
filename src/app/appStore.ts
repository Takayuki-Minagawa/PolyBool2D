import { create } from 'zustand';
import { createEmptyProject } from './projectFactory';
import type { Entity } from './projectTypes';
import { readLanguage, readTheme } from './preferences';
import { defaultView } from './transform';
import { createEntityActions } from './store/entityActions';
import { createGeometryActions } from './store/geometryActions';
import { createHistoryActions } from './store/historyActions';
import { createSelectionActions } from './store/selectionActions';
import { createUiActions } from './store/uiActions';
import type { AppState } from './store/types';

export const useAppStore = create<AppState>()((set, get) => ({
  project: createEmptyProject(),
  selectedEntityIds: [],
  activeTool: 'select',
  view: defaultView(800, 600),
  preview: { type: 'none' },
  history: { past: [], future: [] },
  ui: {
    theme: readTheme(),
    language: readLanguage(),
    manualOpen: false,
    showGrid: true,
    statusMessage: null,
    errorMessage: null,
  },
  ...createSelectionActions(set),
  ...createHistoryActions(set),
  ...createEntityActions(set, get),
  ...createGeometryActions(set, get),
  ...createUiActions(set, get),
}));

export type {
  AlignMode,
  AppState,
  DrawingPreview,
  Language,
  Theme,
} from './store/types';
export type { Entity };
