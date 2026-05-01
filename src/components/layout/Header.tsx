import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import {
  exportProjectFile,
  importProjectFile,
} from '../../persistence/projectSerializer';

export function Header() {
  const { t, i18n } = useTranslation();
  const project = useAppStore((s) => s.project);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const reset = useAppStore((s) => s.resetProject);
  const loadProject = useAppStore((s) => s.loadProject);
  const setErrorMessage = useAppStore((s) => s.setErrorMessage);
  const theme = useAppStore((s) => s.ui.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.ui.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setManualOpen = useAppStore((s) => s.setManualOpen);
  const fileInput = useRef<HTMLInputElement>(null);

  function onChangeLang(l: 'ja' | 'en') {
    setLanguage(l);
    i18n.changeLanguage(l);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const p = await importProjectFile(file);
    if (!p) {
      setErrorMessage('errors.importInvalid');
      return;
    }
    loadProject(p);
  }

  return (
    <header className="header">
      <h1>{t('app.title')}</h1>
      <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
        {t('app.subtitle')}
      </span>
      <div className="spacer" />

      <div className="group">
        <button onClick={() => reset()}>{t('header.newProject')}</button>
        <button onClick={() => fileInput.current?.click()}>
          {t('header.import')}
        </button>
        <button onClick={() => exportProjectFile(project)}>
          {t('header.export')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={onImport}
        />
      </div>

      <div className="group">
        <button onClick={() => undo()} title="Ctrl/⌘+Z">
          {t('header.undo')}
        </button>
        <button onClick={() => redo()} title="Ctrl/⌘+Shift+Z">
          {t('header.redo')}
        </button>
      </div>

      <div className="group lang-toggle">
        <button
          className={language === 'ja' ? 'active' : ''}
          onClick={() => onChangeLang('ja')}
          title={t('header.language.ja')}
        >
          JA
        </button>
        <button
          className={language === 'en' ? 'active' : ''}
          onClick={() => onChangeLang('en')}
          title={t('header.language.en')}
        >
          EN
        </button>
      </div>

      <div className="group">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? t('header.theme.light') : t('header.theme.dark')}
        >
          {theme === 'dark' ? '☀ ' + t('header.theme.light') : '☾ ' + t('header.theme.dark')}
        </button>
      </div>

      <div className="group">
        <button onClick={() => setManualOpen(true)}>
          ? {t('header.manual')}
        </button>
      </div>
    </header>
  );
}
