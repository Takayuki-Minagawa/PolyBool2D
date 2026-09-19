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
  useSaveState,
  deleteProjectRecoverySnapshot,
  loadProjectFromLocalResult,
  preserveProjectRecoverySource,
  saveProjectToLocal,
} from '../persistence/durableProjectStore';
import {
  decodeProjectFromShareHashSourceOutcome,
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
    const loadLocal = (): string | null => {
      const stored = loadProjectFromLocalResult();
      if (!stored) return null;
      const feedback = projectDecodeFeedback(
        stored.decodeResult,
        (key, options) => i18n.t(key, options),
      );
      if (!stored.decodeResult.ok) {
        if (feedback) setErrorMessage(feedback);
        return feedback;
      }
      loadProject(stored.decodeResult.project);
      if (feedback) setErrorMessage(feedback);
      return feedback;
    };
    const clearShareHash = () => {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    };
    const combineDiagnostics = (
      primary: string,
      secondary: string | null,
    ): string => secondary ? `${primary} ${secondary}` : primary;
    const finishWithLocalFallback = (primary: string, clearHash: boolean) => {
      if (clearHash) clearShareHash();
      const localFeedback = loadLocal();
      setErrorMessage(combineDiagnostics(primary, localFeedback));
      setInitialized(true);
    };

    const hash = window.location.hash;
    if (!hash.startsWith(SHARE_HASH_PREFIX)) {
      loadLocal();
      setInitialized(true);
      return;
    }

    let cancelled = false;
    void decodeProjectFromShareHashSourceOutcome(hash)
      .then(async (sharedAttempt) => {
        if (cancelled) return;
        if (!sharedAttempt.ok) {
          finishWithLocalFallback(
            i18n.t('errors.shareInvalid'),
            !sharedAttempt.retryable,
          );
          return;
        }
        const sharedSource = sharedAttempt.value;
        const sharedResult = sharedSource.decodeResult;
        if (sharedResult?.ok) {
          const now = new Date().toISOString();
          // A shared snapshot becomes an independent local project. Reusing
          // its source ID could silently replace a newer local copy.
          const independentProject = {
            ...sharedResult.project,
            id: makeId('project'),
            createdAt: now,
            updatedAt: now,
          };
          let stagedRecovery = false;
          if (
            sharedResult.sourceWasNormalized &&
            (
              !await preserveProjectRecoverySource(
                independentProject.id,
                sharedSource.sourceJson,
                sharedResult.project.id,
              )
            )
          ) {
            finishWithLocalFallback(i18n.t('errors.saveFailed'), false);
            return;
          }
          stagedRecovery = sharedResult.sourceWasNormalized;
          // Do not remove the only URL copy until both the normalized project
          // and the exact pre-normalization bytes are durable under the new
          // local ID.
          if (!await saveProjectToLocal(independentProject)) {
            if (stagedRecovery) {
              await deleteProjectRecoverySnapshot(independentProject.id);
            }
            finishWithLocalFallback(i18n.t('errors.saveFailed'), false);
            return;
          }
          clearShareHash();
          loadProject(independentProject);
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
          finishWithLocalFallback(
            feedback ?? i18n.t('errors.shareInvalid'),
            false,
          );
          return;
        }
        setInitialized(true);
      })
      .catch(() => {
        if (cancelled) return;
        finishWithLocalFallback(
          i18n.t('errors.shareInvalid'),
          false,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [i18n, loadProject, setErrorMessage]);

  // Commit the complete project and backup transaction to IndexedDB (debounced).
  useEffect(() => {
    if (!initialized) return;
    const t = setTimeout(async () => {
      if (latestProjectRef.current !== project) return;
      if (!await saveProjectToLocal(project)) setErrorMessage('errors.saveFailed');
    }, 400);
    return () => clearTimeout(t);
  }, [initialized, project, setErrorMessage]);

  // Debounced work is normally flushed by project-switching controls. This
  // final guard covers closing or reloading the tab before the timer fires.
  useEffect(() => {
    if (!initialized) return;
    const flush = (event: BeforeUnloadEvent) => {
      if (useSaveState.getState().project === latestProjectRef.current) return;
      void saveProjectToLocal(latestProjectRef.current);
      event.preventDefault();
      event.returnValue = '';
    };
    const background = () => {
      if (document.visibilityState === 'hidden') void saveProjectToLocal(latestProjectRef.current);
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', background);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', background);
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
