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
import { createLayerActions } from './store/layerActions';
import { createClipboardActions } from './store/clipboardActions';
import { createPrimitiveActions } from './store/primitiveActions';
import type { AppState } from './store/types';

export const useAppStore = create<AppState>()((set, get) => ({
  project: createEmptyProject(),
  selectedEntityIds: [],
  activeTool: 'select',
  view: defaultView(800, 600),
  preview: { type: 'none' },
  clipboard: { entities: [], pasteCount: 0 },
  history: { past: [], future: [] },
  ui: {
    theme: readTheme(),
    language: readLanguage(),
    manualOpen: false,
    shortcutsOpen: false,
    activeLayerId: 'layer-default',
    invalidEntityIds: [],
    showGrid: true,
    snapEnabled: true,
    statusMessage: null,
    errorMessage: null,
  },
  ...createSelectionActions(set),
  ...createHistoryActions(set),
  ...createEntityActions(set, get),
  ...createPrimitiveActions(set, get),
  ...createClipboardActions(set, get),
  ...createLayerActions(set, get),
  ...createGeometryActions(set, get),
  ...createUiActions(set),
}));

export type {
  AlignMode,
  AppState,
  DrawingPreview,
  Language,
  Theme,
} from './store/types';
export type { Entity };
