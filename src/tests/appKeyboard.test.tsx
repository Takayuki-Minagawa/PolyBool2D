import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../i18n';
import { App } from '../app/App';
import { useAppStore } from '../app/appStore';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = TestResizeObserver;
  host = document.createElement('div');
  document.body.appendChild(host);
  useAppStore.getState().resetProject();
  useAppStore.setState((s) => ({
    activeTool: 'select',
    ui: { ...s.ui, snapEnabled: true },
  }));
  act(() => {
    root = createRoot(host!);
    root.render(<App />);
  });
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = null;
  host = null;
});

function press(key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        metaKey: modifiers.metaKey,
        ctrlKey: modifiers.ctrlKey,
      }),
    );
  });
}

describe('App keyboard shortcuts', () => {
  it('ignores command-modified tool and snap shortcuts', () => {
    press('c', { metaKey: true });
    expect(useAppStore.getState().activeTool).toBe('select');

    press('s', { metaKey: true });
    expect(useAppStore.getState().ui.snapEnabled).toBe(true);

    press('c', { ctrlKey: true });
    expect(useAppStore.getState().activeTool).toBe('select');

    press('s', { ctrlKey: true });
    expect(useAppStore.getState().ui.snapEnabled).toBe(true);
  });

  it('handles plain tool and snap shortcuts', () => {
    press('c');
    expect(useAppStore.getState().activeTool).toBe('circle');

    press('s');
    expect(useAppStore.getState().ui.snapEnabled).toBe(false);
  });
});
