import {
  writeLanguage,
  writeTheme,
  type Language,
  type Theme,
} from '../preferences';
import type { AppGet, AppSet, AppState } from './types';

export function createUiActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'setTheme'
  | 'setLanguage'
  | 'setManualOpen'
  | 'toggleGrid'
  | 'toggleSnap'
  | 'setStatusMessage'
  | 'setErrorMessage'
> {
  return {
    setTheme: (t: Theme) => {
      writeTheme(t);
      set((s) => ({ ui: { ...s.ui, theme: t } }));
    },

    setLanguage: (l: Language) => {
      writeLanguage(l);
      set((s) => ({ ui: { ...s.ui, language: l } }));
    },

    setManualOpen: (v) => set((s) => ({ ui: { ...s.ui, manualOpen: v } })),

    toggleGrid: () =>
      set((s) => ({ ui: { ...s.ui, showGrid: !s.ui.showGrid } })),

    toggleSnap: () => {
      const enabled = !get().project.settings.snapEnabled;
      get().updateSettings({ snapEnabled: enabled });
    },

    setStatusMessage: (m) =>
      set((s) => ({ ui: { ...s.ui, statusMessage: m } })),

    setErrorMessage: (m) =>
      set((s) => ({ ui: { ...s.ui, errorMessage: m } })),
  };
}
