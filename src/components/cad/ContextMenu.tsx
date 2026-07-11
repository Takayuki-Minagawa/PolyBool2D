import { useEffect, useRef } from 'react';

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const left = typeof window === 'undefined' ? x : Math.max(4, Math.min(x, window.innerWidth - 210));
  const top = typeof window === 'undefined' ? y : Math.max(4, Math.min(y, window.innerHeight - 300));

  useEffect(() => {
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const buttons = [
        ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
      ];
      if (buttons.length === 0) return;
      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let nextIndex: number | null = null;
      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % buttons.length;
      if (event.key === 'ArrowUp') {
        nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
      }
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = buttons.length - 1;
      if (nextIndex !== null) {
        event.preventDefault();
        buttons[nextIndex].focus();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left, top }}
      role="menu"
      tabIndex={-1}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`${item.separatorBefore ? 'separator' : ''} ${
            item.danger ? 'danger' : ''
          }`.trim()}
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
