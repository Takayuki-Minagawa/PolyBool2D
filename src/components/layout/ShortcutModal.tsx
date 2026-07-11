import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { COMMAND_SHORTCUTS, TOOL_DEFINITIONS } from '../../app/toolRegistry';

export function ShortcutModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.ui.shortcutsOpen);
  const setOpen = useAppStore((s) => s.setShortcutsOpen);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div
        className="modal shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="shortcut-modal-title">{t('shortcuts.title')}</h2>
          <button ref={closeButtonRef} onClick={() => setOpen(false)}>
            {t('shortcuts.close')}
          </button>
        </header>
        <div className="body shortcut-modal-body">
          <section>
            <h3>{t('shortcuts.toolsHeading')}</h3>
            <table className="shortcut-table">
              <tbody>
                {TOOL_DEFINITIONS.map((tool) => (
                  <tr key={tool.name}>
                    <th scope="row"><kbd>{tool.key}</kbd></th>
                    <td>{t(tool.labelKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h3>{t('shortcuts.commandsHeading')}</h3>
            <table className="shortcut-table">
              <tbody>
                {COMMAND_SHORTCUTS.map((shortcut) => (
                  <tr key={shortcut.key}>
                    <th scope="row"><kbd>{shortcut.key}</kbd></th>
                    <td>{t(shortcut.labelKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
