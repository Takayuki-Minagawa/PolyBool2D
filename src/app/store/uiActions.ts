import {
  writeLanguage,
  writeTheme,
  type Language,
  type Theme,
} from '../preferences';
import type { AppSet, AppState } from './types';

export function createUiActions(set: AppSet): Pick<
  AppState,
  | 'setTheme'
  | 'setLanguage'
  | 'setManualOpen'
  | 'setShortcutsOpen'
  | 'setProjectManagerOpen'
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

    setManualOpen: (v) =>
      set((s) => ({
        ui: {
          ...s.ui,
          manualOpen: v,
          shortcutsOpen: v ? false : s.ui.shortcutsOpen,
          projectManagerOpen: v ? false : s.ui.projectManagerOpen,
        },
      })),

    setShortcutsOpen: (v) =>
      set((s) => ({
        ui: {
          ...s.ui,
          shortcutsOpen: v,
          manualOpen: v ? false : s.ui.manualOpen,
          projectManagerOpen: v ? false : s.ui.projectManagerOpen,
        },
      })),

    setProjectManagerOpen: (v) =>
      set((s) => ({
        ui: {
          ...s.ui,
          projectManagerOpen: v,
          manualOpen: v ? false : s.ui.manualOpen,
          shortcutsOpen: v ? false : s.ui.shortcutsOpen,
        },
      })),

    toggleGrid: () =>
      set((s) => ({ ui: { ...s.ui, showGrid: !s.ui.showGrid } })),

    toggleSnap: () =>
      set((s) => ({ ui: { ...s.ui, snapEnabled: !s.ui.snapEnabled } })),

    setStatusMessage: (m) =>
      set((s) => ({ ui: { ...s.ui, statusMessage: m } })),

    setErrorMessage: (m) =>
      set((s) => ({ ui: { ...s.ui, errorMessage: m } })),
  };
}
