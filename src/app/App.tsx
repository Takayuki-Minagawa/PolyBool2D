import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Toolbar } from '../components/layout/Toolbar';
import { PropertyPanel } from '../components/layout/PropertyPanel';
import { StatusBar } from '../components/layout/StatusBar';
import { ManualModal } from '../components/layout/ManualModal';
import { ShortcutModal } from '../components/layout/ShortcutModal';
import { CadViewport } from '../components/cad/CadViewport';
import { useAppStore } from './appStore';
import { hasBlockingOverlay, isEditableTarget } from './domGuards';
import { applyDocumentLanguage, applyDocumentTheme } from './preferences';
import { toolForShortcut } from './toolRegistry';
import { makeId } from './idUtils';
import { loadProjectFromLocal, saveProjectToLocal } from '../persistence/localProjectStore';
import {
  decodeProjectFromShareHash,
  SHARE_HASH_PREFIX,
} from '../persistence/shareUrl';

export function App() {
  const { i18n } = useTranslation();
  const project = useAppStore((s) => s.project);
  const language = useAppStore((s) => s.ui.language);
  const theme = useAppStore((s) => s.ui.theme);
  const loadProject = useAppStore((s) => s.loadProject);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const removeEntities = useAppStore((s) => s.removeEntities);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const copySelected = useAppStore((s) => s.copySelected);
  const cutSelected = useAppStore((s) => s.cutSelected);
  const pasteClipboard = useAppStore((s) => s.pasteClipboard);
  const translateEntities = useAppStore((s) => s.translateEntities);
  const selectAll = useAppStore((s) => s.selectAll);
  const toggleGrid = useAppStore((s) => s.toggleGrid);
  const toggleSnap = useAppStore((s) => s.toggleSnap);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const setErrorMessage = useAppStore((s) => s.setErrorMessage);
  const [initialized, setInitialized] = useState(false);
  const latestProjectRef = useRef(project);
  latestProjectRef.current = project;

  // Apply theme attribute on mount
  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  // Sync i18n language
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
    applyDocumentLanguage(language);
  }, [language, i18n]);

  // A shared URL takes priority over the locally active project. Keep
  // autosave paused until the asynchronous shared payload has been decoded.
  useEffect(() => {
    const loadLocal = () => {
      const stored = loadProjectFromLocal();
      if (stored) loadProject(stored);
    };

    const hash = window.location.hash;
    if (!hash.startsWith(SHARE_HASH_PREFIX)) {
      loadLocal();
      setInitialized(true);
      return;
    }

    let cancelled = false;
    void decodeProjectFromShareHash(hash)
      .then((shared) => {
        if (cancelled) return;
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}`,
        );
        if (shared) {
          const now = new Date().toISOString();
          // A shared snapshot becomes an independent local project. Reusing
          // its source ID could silently replace a newer local copy.
          loadProject({
            ...shared,
            id: makeId('project'),
            createdAt: now,
            updatedAt: now,
          });
        } else {
          setErrorMessage('errors.shareInvalid');
          loadLocal();
        }
        setInitialized(true);
      })
      .catch(() => {
        if (cancelled) return;
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}`,
        );
        setErrorMessage('errors.shareInvalid');
        loadLocal();
        setInitialized(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loadProject, setErrorMessage]);

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    if (!initialized) return;
    const t = setTimeout(() => {
      if (!saveProjectToLocal(project)) setErrorMessage('errors.saveFailed');
    }, 400);
    return () => clearTimeout(t);
  }, [initialized, project, setErrorMessage]);

  // Debounced work is normally flushed by project-switching controls. This
  // final guard covers closing or reloading the tab before the timer fires.
  useEffect(() => {
    if (!initialized) return;
    const flush = () => saveProjectToLocal(latestProjectRef.current);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [initialized]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) {
        return;
      }
      const cmd = e.metaKey || e.ctrlKey;
      const shortcutsOpen = useAppStore.getState().ui.shortcutsOpen;
      if (shortcutsOpen) {
        if (!cmd && !e.altKey && e.key === '?') {
          e.preventDefault();
          setShortcutsOpen(false);
        }
        return;
      }
      if (hasBlockingOverlay()) return;
      if (!cmd && !e.altKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutSelected();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (!cmd && !e.altKey && e.key.startsWith('Arrow')) {
        const sel = useAppStore.getState().selectedEntityIds;
        if (sel.length === 0) return;
        e.preventDefault();
        const state = useAppStore.getState();
        // Arrow = one grid cell; Shift+Arrow = fine step (1/10 cell).
        const step = e.shiftKey
          ? state.project.settings.gridSize / 10
          : state.project.settings.gridSize;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        translateEntities(sel, dx, dy);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (useAppStore.getState().preview.type !== 'none') return;
        const sel = useAppStore.getState().selectedEntityIds;
        if (sel.length > 0) {
          e.preventDefault();
          removeEntities(sel);
        }
        return;
      }
      if (cmd) return;
      const tool = toolForShortcut(e.key);
      if (tool) {
        setActiveTool(tool);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'g':
          toggleGrid();
          break;
        case 's':
          toggleSnap();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTool, undo, redo, removeEntities, duplicateSelected, copySelected, cutSelected, pasteClipboard, translateEntities, selectAll, toggleGrid, toggleSnap, setShortcutsOpen]);

  return (
    <div className="app-shell">
      <Header />
      <Toolbar />
      <CadViewport />
      <PropertyPanel />
      <StatusBar />
      <ManualModal />
      <ShortcutModal />
    </div>
  );
}
