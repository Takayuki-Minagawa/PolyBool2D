import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../i18n';
import { useAppStore } from '../app/appStore';
import { useViewportStatusStore } from '../app/viewportStatusStore';
import { StatusBar } from '../components/layout/StatusBar';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.getState().resetProject();
  useViewportStatusStore.getState().setCursor(null);
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('StatusBar', () => {
  it('shows the cursor coordinates and status message at the same time', () => {
    useAppStore.setState((state) => ({
      ui: { ...state.ui, statusMessage: 'Import completed' },
    }));
    useViewportStatusStore.getState().setCursor({ x: 1.25, y: -2.5 });

    act(() => {
      root = createRoot(host!);
      root.render(<StatusBar />);
    });

    expect(host!.textContent).toContain('X: 1.250, Y: -2.500');
    expect(host!.textContent).toContain('Import completed');
  });
});
