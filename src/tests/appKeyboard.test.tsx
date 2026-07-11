import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    preview: { type: 'none' },
    ui: {
      ...s.ui,
      language: 'ja',
      manualOpen: false,
      shortcutsOpen: false,
      snapEnabled: true,
    },
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }),
  );
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
  vi.unstubAllGlobals();
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

  it('opens and closes the shortcut modal with ?', () => {
    press('?');
    expect(useAppStore.getState().ui.shortcutsOpen).toBe(true);
    expect(host!.querySelector('[role="dialog"]')?.textContent).toContain('ショートカット');

    press('?');
    expect(useAppStore.getState().ui.shortcutsOpen).toBe(false);
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not route input Enter to the viewport drawing command', () => {
    act(() => {
      useAppStore.getState().setPreview({
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        cursor: null,
      });
    });
    const input = document.createElement('input');
    host!.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(useAppStore.getState().preview.type).toBe('polygon');
    expect(useAppStore.getState().project.entities).toHaveLength(0);
  });

  it('suppresses deletion, tool shortcuts, and viewport keys behind dialogs', () => {
    let entityId = '';
    act(() => {
      entityId = useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 })!.id;
      useAppStore.getState().setShortcutsOpen(true);
    });

    press('Delete');
    press('p');
    expect(useAppStore.getState().project.entities.some((entity) => entity.id === entityId)).toBe(true);
    expect(useAppStore.getState().activeTool).toBe('select');
    act(() => {
      useAppStore.getState().setPreview({
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
        ],
        cursor: null,
      });
    });
    press('Enter');
    expect(useAppStore.getState().preview.type).toBe('polygon');

    press('Escape');
    expect(useAppStore.getState().ui.shortcutsOpen).toBe(false);

    act(() => {
      useAppStore.getState().setPreview({ type: 'none' });
      useAppStore.getState().setManualOpen(true);
    });
    expect(host!.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    press('Delete');
    press('c');
    expect(useAppStore.getState().project.entities.some((entity) => entity.id === entityId)).toBe(true);
    expect(useAppStore.getState().activeTool).toBe('select');
    act(() => {
      useAppStore.getState().setPreview({
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
        ],
        cursor: null,
      });
    });
    press('Enter');
    expect(useAppStore.getState().project.entities.some((entity) => entity.id === entityId)).toBe(true);
    expect(useAppStore.getState().activeTool).toBe('select');
    expect(useAppStore.getState().preview.type).toBe('polygon');
    press('Escape');
    expect(useAppStore.getState().ui.manualOpen).toBe(false);

    const projectsButton = [...host!.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'プロジェクト',
    ) as HTMLButtonElement;
    act(() => {
      useAppStore.getState().setPreview({ type: 'none' });
      projectsButton.click();
    });
    expect(host!.querySelector('.project-manager-modal[aria-modal="true"]')).not.toBeNull();
    press('Delete');
    press('r');
    expect(useAppStore.getState().project.entities.some((entity) => entity.id === entityId)).toBe(true);
    expect(useAppStore.getState().activeTool).toBe('select');
    press('Escape');
    expect(host!.querySelector('.project-manager-modal')).toBeNull();
  });

  it('exposes pressed state for tools, grid, snap, and language toggles', () => {
    const selectTool = host!.querySelector('button[title^="選択 "]') as HTMLButtonElement;
    const polygonTool = host!.querySelector('button[title^="ポリゴン "]') as HTMLButtonElement;
    const grid = [...host!.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('グリッド'),
    ) as HTMLButtonElement;
    const snap = [...host!.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('スナップ'),
    ) as HTMLButtonElement;
    const ja = host!.querySelector('button[title="日本語"]') as HTMLButtonElement;
    const en = host!.querySelector('button[title="English"]') as HTMLButtonElement;

    expect(selectTool.getAttribute('aria-pressed')).toBe('true');
    expect(polygonTool.getAttribute('aria-pressed')).toBe('false');
    expect(grid.getAttribute('aria-pressed')).toBe('true');
    expect(snap.getAttribute('aria-pressed')).toBe('true');
    expect(ja.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
  });
});
