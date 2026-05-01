import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Toolbar } from '../components/layout/Toolbar';
import { PropertyPanel } from '../components/layout/PropertyPanel';
import { StatusBar } from '../components/layout/StatusBar';
import { ManualModal } from '../components/layout/ManualModal';
import { CadViewport } from '../components/cad/CadViewport';
import { useAppStore } from './appStore';
import { loadProjectFromLocal, saveProjectToLocal } from '../persistence/localProjectStore';

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
  const toggleGrid = useAppStore((s) => s.toggleGrid);
  const toggleSnap = useAppStore((s) => s.toggleSnap);

  // Apply theme attribute on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Sync i18n language
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
    document.documentElement.setAttribute('lang', language);
  }, [language, i18n]);

  // Load project from localStorage on mount
  useEffect(() => {
    const stored = loadProjectFromLocal();
    if (stored) loadProject(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    const t = setTimeout(() => saveProjectToLocal(project), 400);
    return () => clearTimeout(t);
  }, [project]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = useAppStore.getState().selectedEntityIds;
        if (sel.length > 0) {
          e.preventDefault();
          removeEntities(sel);
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'v':
          setActiveTool('select');
          break;
        case 'h':
          setActiveTool('pan');
          break;
        case 'p':
          setActiveTool('polygon');
          break;
        case 'r':
          setActiveTool('rectangle');
          break;
        case 'c':
          setActiveTool('circle');
          break;
        case 'k':
          setActiveTool('knife');
          break;
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
  }, [setActiveTool, undo, redo, removeEntities, toggleGrid, toggleSnap]);

  return (
    <div className="app-shell">
      <Header />
      <Toolbar />
      <CadViewport />
      <PropertyPanel />
      <StatusBar />
      <ManualModal />
    </div>
  );
}
