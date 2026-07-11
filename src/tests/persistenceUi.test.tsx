import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { App } from '../app/App';
import { useAppStore } from '../app/appStore';
import { createEmptyProject } from '../app/projectFactory';
import { Header } from '../components/layout/Header';
import {
  loadProjectById,
  saveProjectToLocal,
} from '../persistence/localProjectStore';
import { serializeProject } from '../persistence/projectCodec';
import { encodeProjectToShareHash } from '../persistence/shareUrl';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function button(label: string): HTMLButtonElement {
  const match = [...host!.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match as HTMLButtonElement;
}

function projectCard(name: string): HTMLElement {
  const match = [...host!.querySelectorAll<HTMLElement>('.project-card')].find(
    (element) => element.querySelector('strong')?.textContent === name,
  );
  if (!match) throw new Error(`Project card not found: ${name}`);
  return match;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = TestResizeObserver;
  localStorage.clear();
  window.location.hash = '';
  useAppStore.getState().resetProject();
  useAppStore.setState((state) => ({
    ui: { ...state.ui, statusMessage: null, errorMessage: null },
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
  window.location.hash = '';
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('persistence UI', () => {
  it('opens a saved project through the project manager', () => {
    const saved = createEmptyProject();
    saved.name = '保存済み案件';
    expect(saveProjectToLocal(saved)).toBe(true);

    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    act(() => button('プロジェクト').click());
    expect(host!.querySelector('[aria-labelledby="project-manager-title"]')).not.toBeNull();

    act(() => button('開く').click());
    expect(useAppStore.getState().project.name).toBe('保存済み案件');
    expect(host!.querySelector('[aria-labelledby="project-manager-title"]')).toBeNull();
  });

  it('imports supported SVG geometry through the SVG file input', async () => {
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="svg"]',
    ) as HTMLInputElement;
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 H20 V10 H0 Z M5 2 H15 V8 H5 Z"/></svg>',
      ],
      'shape.svg',
      { type: 'image/svg+xml' },
    );
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork();
    });

    const polygons = useAppStore.getState().project.entities.filter(
      (entity) => entity.type === 'polygon',
    );
    expect(polygons).toHaveLength(1);
    expect(polygons[0].geometry.holes).toHaveLength(1);
    expect(polygons[0].metadata?.sourceShape).toBe('svg-import');
    expect(useAppStore.getState().history.past).toHaveLength(1);
    expect(useAppStore.getState().ui.statusMessage).toContain('1図形');
  });

  it('loads a project through the JSON file input', async () => {
    const imported = createEmptyProject();
    imported.name = 'JSON案件';
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="json"]',
    ) as HTMLInputElement;
    const file = new File([serializeProject(imported)], 'project.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork();
    });

    expect(useAppStore.getState().project.name).toBe('JSON案件');
    expect(useAppStore.getState().ui.statusMessage).toContain('JSON案件');
  });

  it('copies a generated share URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });

    await act(async () => {
      button('共有URL').click();
      await flushAsyncWork();
    });

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('#pb2d=');
    expect(useAppStore.getState().ui.statusMessage).toContain('クリップボード');
  });

  it('keeps the live project in sync when renaming the current saved project', () => {
    const current = createEmptyProject();
    current.name = '変更前';
    expect(saveProjectToLocal(current)).toBe(true);
    useAppStore.getState().loadProject(current);
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    act(() => button('プロジェクト').click());
    const card = projectCard('変更前');
    act(() => {
      const rename = [...card.querySelectorAll('button')].find(
        (element) => element.textContent === '名前変更',
      )!;
      rename.click();
    });
    const input = card.querySelector('input')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '変更後');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(useAppStore.getState().project.name).toBe('変更後');
    expect(loadProjectById(current.id)?.name).toBe('変更後');
  });

  it('does not resurrect the current project after deleting it', async () => {
    const current = createEmptyProject();
    current.name = '削除対象';
    expect(saveProjectToLocal(current)).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });
    act(() => button('プロジェクト').click());
    const card = projectCard('削除対象');
    act(() => {
      const remove = [...card.querySelectorAll('button')].find(
        (element) => element.textContent === '削除',
      )!;
      remove.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    expect(useAppStore.getState().project.id).not.toBe(current.id);
    expect(loadProjectById(current.id)).toBeNull();
  });
});

describe('shared URL initialization', () => {
  it('loads the shared project before the locally active project', async () => {
    const local = createEmptyProject();
    local.name = 'ローカル案件';
    expect(saveProjectToLocal(local)).toBe(true);

    const shared = createEmptyProject();
    shared.name = '共有案件';
    const hash = await encodeProjectToShareHash(shared);
    expect(hash).not.toBeNull();
    window.location.hash = hash!;

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    expect(useAppStore.getState().project.name).toBe('共有案件');
    expect(useAppStore.getState().project.id).not.toBe(shared.id);
    expect(window.location.hash).toBe('');
  });

  it('does not overwrite a newer local project that shares the source ID', async () => {
    const shared = createEmptyProject();
    shared.name = '古い共有スナップショット';
    const newerLocal = {
      ...shared,
      name: '新しいローカル案件',
      updatedAt: '2026-07-12T00:00:00.000Z',
    };
    expect(saveProjectToLocal(newerLocal)).toBe(true);
    const hash = await encodeProjectToShareHash(shared);
    window.location.hash = hash!;

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });
    act(() => window.dispatchEvent(new Event('beforeunload')));

    expect(useAppStore.getState().project.id).not.toBe(shared.id);
    expect(loadProjectById(shared.id)?.name).toBe('新しいローカル案件');
  });
});
