import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalDismiss } from './useModalDismiss';

export function useText() {
  const { i18n } = useTranslation();
  return (ja: string, en: string) => (i18n.language.startsWith('ja') ? ja : en);
}
export function TaskDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const text = useText();
  useModalDismiss({ open: true, onDismiss: onClose, containerRef: ref });
  return (
    <div className="modal-overlay">
      <div
        ref={ref}
        className={`modal task-dialog ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={onClose}>{text('閉じる', 'Close')}</button>
        </header>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}
