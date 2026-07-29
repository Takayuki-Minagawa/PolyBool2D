import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { useAppStore } from '../app/appStore';
import { ManualModal } from '../components/layout/ManualModal';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function manualResponse(markdown: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => markdown,
  } as Response;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.getState().resetProject();
  useAppStore.setState((state) => ({
    ui: { ...state.ui, language: 'ja', manualOpen: false, shortcutsOpen: false },
  }));
  await i18n.changeLanguage('ja');
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

function renderModal() {
  act(() => {
    root = createRoot(host!);
    root.render(<ManualModal />);
  });
}

describe('ManualModal', () => {
  it('is an accessible dialog, closes with Escape, and restores focus', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(manualResponse('# Manual')),
    );
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    useAppStore.setState((state) => ({
      ui: { ...state.ui, manualOpen: true },
    }));
    renderModal();

    const dialog = host!.querySelector('[role="dialog"]') as HTMLElement;
    const closeButton = dialog.querySelector('button') as HTMLButtonElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('manual-modal-title');
    expect(document.activeElement).toBe(closeButton);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(closeButton);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(useAppStore.getState().ui.manualOpen).toBe(false);
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('aborts stale language loads and ignores late responses', async () => {
    const requests: Array<{
      signal: AbortSignal | undefined;
      resolve: (response: Response) => void;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          requests.push({ signal: init?.signal ?? undefined, resolve });
        }),
      ),
    );
    useAppStore.setState((state) => ({
      ui: { ...state.ui, manualOpen: true },
    }));
    renderModal();
    expect(requests).toHaveLength(1);

    act(() => {
      useAppStore.setState((state) => ({
        ui: { ...state.ui, language: 'en' },
      }));
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].signal?.aborted).toBe(true);

    await act(async () => {
      requests[0].resolve(manualResponse('# 古いマニュアル'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host!.textContent).not.toContain('古いマニュアル');

    await act(async () => {
      requests[1].resolve(manualResponse('# Current manual'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host!.textContent).toContain('Current manual');
  });
});
