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
import { applyDocumentLanguage, applyDocumentTheme } from './preferences';
import { makeId } from './idUtils';
import { projectDecodeFeedback } from './projectDecodeFeedback';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import {
  loadProjectFromLocalResult,
  saveProjectToLocal,
} from '../persistence/localProjectStore';
import {
  decodeProjectFromShareHashResult,
  SHARE_HASH_PREFIX,
} from '../persistence/shareUrl';

export function App() {
  const { i18n } = useTranslation();
  const project = useAppStore((s) => s.project);
  const language = useAppStore((s) => s.ui.language);
  const theme = useAppStore((s) => s.ui.theme);
  const loadProject = useAppStore((s) => s.loadProject);
  const setErrorMessage = useAppStore((s) => s.setErrorMessage);
  const [initialized, setInitialized] = useState(false);
  const latestProjectRef = useRef(project);
  latestProjectRef.current = project;
  useGlobalShortcuts();

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
      const stored = loadProjectFromLocalResult();
      if (!stored) return;
      const feedback = projectDecodeFeedback(
        stored.decodeResult,
        (key, options) => i18n.t(key, options),
      );
      if (!stored.decodeResult.ok) {
        if (feedback) setErrorMessage(feedback);
        return;
      }
      loadProject(stored.decodeResult.project);
      if (feedback) setErrorMessage(feedback);
    };

    const hash = window.location.hash;
    if (!hash.startsWith(SHARE_HASH_PREFIX)) {
      loadLocal();
      setInitialized(true);
      return;
    }

    let cancelled = false;
    void decodeProjectFromShareHashResult(hash)
      .then((sharedResult) => {
        if (cancelled) return;
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}`,
        );
        if (sharedResult?.ok) {
          const now = new Date().toISOString();
          // A shared snapshot becomes an independent local project. Reusing
          // its source ID could silently replace a newer local copy.
          loadProject({
            ...sharedResult.project,
            id: makeId('project'),
            createdAt: now,
            updatedAt: now,
          });
          const feedback = projectDecodeFeedback(
            sharedResult,
            (key, options) => i18n.t(key, options),
          );
          if (feedback) setErrorMessage(feedback);
        } else {
          const feedback = sharedResult
            ? projectDecodeFeedback(
                sharedResult,
                (key, options) => i18n.t(key, options),
              )
            : null;
          setErrorMessage(feedback ?? 'errors.shareInvalid');
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
  }, [i18n, loadProject, setErrorMessage]);

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
