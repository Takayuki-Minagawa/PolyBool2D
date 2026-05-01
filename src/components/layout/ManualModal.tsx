import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../app/appStore';
import manualJaUrl from '../../i18n/manual.ja.md?url';
import manualEnUrl from '../../i18n/manual.en.md?url';

export function ManualModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.ui.manualOpen);
  const setOpen = useAppStore((s) => s.setManualOpen);
  const language = useAppStore((s) => s.ui.language);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    const url = language === 'en' ? manualEnUrl : manualJaUrl;
    fetch(url)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setContent(''));
  }, [open, language]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('manual.title')}</h2>
          <button onClick={() => setOpen(false)}>{t('manual.close')}</button>
        </header>
        <div className="body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
