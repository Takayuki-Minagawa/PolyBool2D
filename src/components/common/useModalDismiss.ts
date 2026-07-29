import { useEffect, type RefObject } from 'react';
import { useGlobalShortcutHandler } from '../../app/globalShortcuts';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type UseModalDismissOptions = {
  open: boolean;
  onDismiss: () => void;
  containerRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
};

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );
}

export function useModalDismiss({
  open,
  onDismiss,
  containerRef,
  initialFocusRef,
}: UseModalDismissOptions): void {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const initial =
      initialFocusRef?.current ?? (container ? focusableElements(container)[0] : null);
    initial?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [containerRef, initialFocusRef, open]);

  useGlobalShortcutHandler(
    {
      onKeyDown: (event) => {
        if (!open) return false;
        if (event.key === 'Escape') {
          event.preventDefault();
          onDismiss();
          return true;
        }
        if (event.key !== 'Tab') return false;
        const container = containerRef.current;
        if (!container) return true;
        const focusable = focusableElements(container);
        if (focusable.length === 0) {
          event.preventDefault();
          container.focus();
          return true;
        }
        const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const nextIndex = event.shiftKey
          ? activeIndex <= 0
            ? focusable.length - 1
            : activeIndex - 1
          : activeIndex < 0 || activeIndex === focusable.length - 1
            ? 0
            : activeIndex + 1;
        event.preventDefault();
        focusable[nextIndex].focus();
        return true;
      },
    },
    100,
  );
}
