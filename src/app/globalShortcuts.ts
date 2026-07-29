import { useEffect, useRef } from 'react';

export type GlobalShortcutHandler = {
  onKeyDown?: (event: KeyboardEvent) => boolean | void;
  onKeyUp?: (event: KeyboardEvent) => boolean | void;
};

type RegisteredHandler = GlobalShortcutHandler & {
  id: number;
  priority: number;
};

const handlers = new Map<number, RegisteredHandler>();
let nextHandlerId = 1;
let listening = false;

function orderedHandlers(): RegisteredHandler[] {
  return [...handlers.values()].sort(
    (left, right) => right.priority - left.priority || right.id - left.id,
  );
}

function dispatch(
  phase: 'onKeyDown' | 'onKeyUp',
  event: KeyboardEvent,
): void {
  for (const handler of orderedHandlers()) {
    if (handler[phase]?.(event)) return;
  }
}

function onWindowKeyDown(event: KeyboardEvent): void {
  dispatch('onKeyDown', event);
}

function onWindowKeyUp(event: KeyboardEvent): void {
  dispatch('onKeyUp', event);
}

function syncWindowListeners(): void {
  if (typeof window === 'undefined') return;
  if (handlers.size > 0 && !listening) {
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('keyup', onWindowKeyUp);
    listening = true;
  } else if (handlers.size === 0 && listening) {
    window.removeEventListener('keydown', onWindowKeyDown);
    window.removeEventListener('keyup', onWindowKeyUp);
    listening = false;
  }
}

export function registerGlobalShortcutHandler(
  handler: GlobalShortcutHandler,
  priority = 0,
): () => void {
  const id = nextHandlerId++;
  handlers.set(id, { ...handler, id, priority });
  syncWindowListeners();
  return () => {
    handlers.delete(id);
    syncWindowListeners();
  };
}

/**
 * Registers a shortcut scope without re-registering the underlying window
 * listeners when render-time values change.
 */
export function useGlobalShortcutHandler(
  handler: GlobalShortcutHandler,
  priority = 0,
): void {
  const latestRef = useRef(handler);
  latestRef.current = handler;

  useEffect(
    () =>
      registerGlobalShortcutHandler(
        {
          onKeyDown: (event) => latestRef.current.onKeyDown?.(event),
          onKeyUp: (event) => latestRef.current.onKeyUp?.(event),
        },
        priority,
      ),
    [priority],
  );
}
