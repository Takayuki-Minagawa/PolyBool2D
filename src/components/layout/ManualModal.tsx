import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../app/appStore';
import manualJaUrl from '../../i18n/manual.ja.md?url';
import manualEnUrl from '../../i18n/manual.en.md?url';
import { useModalDismiss } from '../common/useModalDismiss';

export function ManualModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.ui.manualOpen);
  const setOpen = useAppStore((s) => s.setManualOpen);
  const language = useAppStore((s) => s.ui.language);
  const [content, setContent] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    const url = language === 'en' ? manualEnUrl : manualJaUrl;
    setContent('');
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Manual request failed: ${response.status}`);
        return response.text();
      })
      .then((markdown) => {
        if (active) setContent(markdown);
      })
      .catch(() => {
        if (active) setContent('');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, language]);

  useModalDismiss({
    open,
    onDismiss: () => setOpen(false),
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
  });

  if (!open) return null;
  return (
    <div className="modal-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id="manual-modal-title">{t('manual.title')}</h2>
          <button ref={closeButtonRef} onClick={() => setOpen(false)}>
            {t('manual.close')}
          </button>
        </header>
        <div className="body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
