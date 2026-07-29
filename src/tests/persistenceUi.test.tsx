import { Blob as NodeBlob } from 'node:buffer';
import { act } from 'react';
import { gzipSync } from 'node:zlib';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { App } from '../app/App';
import { useAppStore } from '../app/appStore';
import {
  createEmptyProject,
  createLinearEntity,
} from '../app/projectFactory';
import { Header } from '../components/layout/Header';
import {
  getProjectRecoverySourceJson,
  listLocalProjects,
  loadProjectById,
  saveProjectToLocal,
} from '../persistence/localProjectStore';
import { serializeProject } from '../persistence/projectCodec';
import {
  encodeProjectToShareHash,
  MAX_SHARE_HASH_LENGTH,
  SHARE_HASH_PREFIX,
} from '../persistence/shareUrl';

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

function replaceGlobalValue(name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    name,
  );
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  };
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

  it('keeps a recovery warning visible after opening a damaged project', () => {
    const saved = createEmptyProject();
    saved.name = 'Recoverable project';
    expect(saveProjectToLocal(saved)).toBe(true);
    const raw = JSON.parse(serializeProject(saved));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    localStorage.setItem(
      `pb2d.project.${encodeURIComponent(saved.id)}`,
      JSON.stringify(raw),
    );

    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    act(() => button('プロジェクト').click());
    const card = projectCard('Recoverable project');
    act(() => {
      const open = [...card.querySelectorAll('button')].find(
        (element) => element.textContent === '開く',
      )!;
      open.click();
    });

    expect(useAppStore.getState().project.id).toBe(saved.id);
    expect(useAppStore.getState().ui.errorMessage).toContain('1');
  });

  it('explains unreadable snapshots and disables only their restore actions', () => {
    const saved = createEmptyProject();
    saved.name = 'Unreadable history project';
    expect(saveProjectToLocal(saved)).toBe(true);
    const invalidJson = '{"version":';
    localStorage.setItem(
      `pb2d.backups.${encodeURIComponent(saved.id)}`,
      JSON.stringify([{
        id: 'unreadable-backup',
        savedAt: '2026-07-29T00:00:00.000Z',
        projectJson: invalidJson,
      }]),
    );
    localStorage.setItem(
      `pb2d.recovery.${encodeURIComponent(saved.id)}`,
      JSON.stringify({
        savedAt: '2026-07-29T00:00:00.000Z',
        projectJson: invalidJson,
      }),
    );

    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    act(() => button('プロジェクト').click());
    const card = projectCard(saved.name);
    const backupsButton = [...card.querySelectorAll('button')].find(
      (element) => element.textContent === 'バックアップ',
    );
    act(() => backupsButton!.click());

    const restoreButtons = [...card.querySelectorAll<HTMLButtonElement>('button')]
      .filter((element) => element.textContent === '復元');
    expect(restoreButtons).toHaveLength(2);
    expect(restoreButtons.every((element) => element.disabled)).toBe(true);
    expect(card.textContent).toContain('復元できません: JSONが不正');
    const downloadButton = [...card.querySelectorAll<HTMLButtonElement>('button')]
      .find((element) => element.textContent === '元データをダウンロード');
    expect(downloadButton?.disabled).toBe(false);
  });

  it('lets the user download or discard a malformed recovery envelope', () => {
    const saved = createEmptyProject();
    saved.name = 'Malformed recovery envelope project';
    expect(saveProjectToLocal(saved)).toBe(true);
    const recoveryStorageKey =
      `pb2d.recovery.${encodeURIComponent(saved.id)}`;
    const malformedEnvelope = '{"savedAt":"truncated"';
    localStorage.setItem(recoveryStorageKey, malformedEnvelope);

    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    act(() => button('プロジェクト').click());
    const card = projectCard(saved.name);
    const backupsButton = [...card.querySelectorAll('button')].find(
      (element) => element.textContent === 'バックアップ',
    );
    act(() => backupsButton!.click());

    const recoveryRow = card.querySelector('.recovery-snapshot-row');
    expect(recoveryRow).not.toBeNull();
    const restoreButton = [...recoveryRow!.querySelectorAll('button')].find(
      (element) => element.textContent === '復元',
    ) as HTMLButtonElement;
    const downloadButton = [...recoveryRow!.querySelectorAll('button')].find(
      (element) => element.textContent === '元データをダウンロード',
    ) as HTMLButtonElement;
    expect(restoreButton.disabled).toBe(true);
    expect(downloadButton.disabled).toBe(false);
    expect(getProjectRecoverySourceJson(saved.id)).toBe(malformedEnvelope);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const discardButton = [...recoveryRow!.querySelectorAll('button')].find(
      (element) => element.textContent === '元データを破棄',
    ) as HTMLButtonElement;
    act(() => discardButton.click());

    expect(card.querySelector('.recovery-snapshot-row')).toBeNull();
    expect(localStorage.getItem(recoveryStorageKey)).toBeNull();
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

  it('does not import an asynchronously read file into a newly selected project', async () => {
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="svg"]',
    ) as HTMLInputElement;
    let resolveText!: (value: string) => void;
    const file = new File([], 'delayed.svg', { type: 'image/svg+xml' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockReturnValue(new Promise((resolve) => {
        resolveText = resolve;
      })),
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      useAppStore.getState().resetProject();
      resolveText(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      );
      await flushAsyncWork();
    });

    expect(useAppStore.getState().project.entities).toHaveLength(0);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      'errors.projectChangedDuringImport',
    );
  });

  it('does not overwrite a same-ID project edit made during an import', async () => {
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="svg"]',
    ) as HTMLInputElement;
    let resolveText!: (value: string) => void;
    const file = new File([], 'delayed.svg', { type: 'image/svg+xml' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockReturnValue(new Promise((resolve) => {
        resolveText = resolve;
      })),
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const current = useAppStore.getState().project;
      useAppStore.getState().loadProject({
        ...current,
        name: 'Edited while importing',
        updatedAt: '2026-07-29T01:00:00.000Z',
      });
      resolveText(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      );
      await flushAsyncWork();
    });

    expect(useAppStore.getState().project.name).toBe('Edited while importing');
    expect(useAppStore.getState().project.entities).toHaveLength(0);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      'errors.projectChangedDuringImport',
    );
  });

  it('shows DXF warning types alongside a successful partial import', async () => {
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="dxf"]',
    ) as HTMLInputElement;
    const file = new File([
      [
        0, 'SECTION', 2, 'ENTITIES',
        0, 'SPLINE', 8, 'Unsupported',
        0, 'LINE', 10, 0, 20, 0, 11, 10, 21, 0,
        0, 'ENDSEC', 0, 'EOF',
      ].join('\n'),
    ], 'partial.dxf', { type: 'application/dxf' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork();
    });

    expect(useAppStore.getState().project.entities).toHaveLength(1);
    expect(useAppStore.getState().ui.statusMessage).toContain(
      '未対応エンティティ（SPLINE）',
    );
    expect(useAppStore.getState().ui.statusMessage).not.toContain(
      'unsupported-entity',
    );
    expect(useAppStore.getState().ui.errorMessage).toBeNull();
  });

  it('localizes structural and block-related DXF warning details', async () => {
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="dxf"]',
    ) as HTMLInputElement;
    const file = new File([[
      0, 'SECTION', 2, 'BLOCKS',
      0, 'BLOCK', 2, 'Repeated',
      0, 'ENDBLK',
      0, 'BLOCK', 2, 'Repeated',
      0, 'ENDBLK',
      0, 'ENDSEC',
      0, 'SECTION', 2, 'ENTITIES',
      0, 'LINE', 10, 0, 20, 0, 11, 10, 21, 0,
      0, 'ENDSEC',
    ].join('\n') + '\n999'], 'warnings.dxf', {
      type: 'application/dxf',
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork();
    });

    const message = useAppStore.getState().ui.statusMessage ?? '';
    expect(message).toContain('ブロック定義が重複（Repeated）');
    expect(message).toContain('DXFレコードが途中で終了');
    expect(message).toContain('ファイル終端マーカーがない');
    expect(message).not.toContain('duplicate-block');
    expect(message).not.toContain('truncated-group-pair');
    expect(message).not.toContain('missing-eof');
  });

  it('keeps a store validation error visible when DXF lines import successfully', async () => {
    const originalImport = useAppStore.getState().importDrawingGeometries;
    const importedLine = createLinearEntity(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      'polyline',
    );
    useAppStore.setState({
      importDrawingGeometries: () => {
        useAppStore.getState().setErrorMessage('errors.invalidPolygon');
        return [importedLine];
      },
    });

    try {
      act(() => {
        root = createRoot(host!);
        root.render(<Header />);
      });
      const input = host!.querySelector(
        'input[type="file"][accept*="dxf"]',
      ) as HTMLInputElement;
      const file = new File([
        [
          0, 'SECTION', 2, 'ENTITIES',
          0, 'LINE', 10, 0, 20, 0, 11, 10, 21, 0,
          0, 'ENDSEC', 0, 'EOF',
        ].join('\n'),
      ], 'partial-validation.dxf', { type: 'application/dxf' });
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });

      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncWork();
      });

      expect(useAppStore.getState().ui.statusMessage).not.toBeNull();
      expect(useAppStore.getState().ui.errorMessage).toBe(
        'errors.invalidPolygon',
      );
    } finally {
      act(() => {
        useAppStore.setState({ importDrawingGeometries: originalImport });
      });
    }
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
    expect(useAppStore.getState().project.id).not.toBe(imported.id);
    expect(loadProjectById(useAppStore.getState().project.id)?.name).toBe(
      'JSON案件',
    );
    expect(useAppStore.getState().ui.statusMessage).toContain('JSON案件');
  });

  it('imports a same-ID JSON file as an independent project', async () => {
    const existing = createEmptyProject();
    existing.name = 'Newer local project';
    existing.updatedAt = '2026-07-29T02:00:00.000Z';
    expect(saveProjectToLocal(existing)).toBe(true);
    const imported = {
      ...existing,
      name: 'Older imported snapshot',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="json"]',
    ) as HTMLInputElement;
    const file = new File([serializeProject(imported)], 'snapshot.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork();
    });

    expect(loadProjectById(existing.id)?.name).toBe('Newer local project');
    expect(useAppStore.getState().project.name).toBe('Older imported snapshot');
    expect(useAppStore.getState().project.id).not.toBe(existing.id);
  });

  it('preserves exact JSON bytes when decoding normalizes the imported source', async () => {
    const imported = createEmptyProject();
    imported.name = 'Normalized import';
    const raw = JSON.parse(serializeProject(imported));
    raw.settings.gridSize = 1e99;
    raw.unknownTopLevelField = { keep: 'exactly' };
    const sourceJson = JSON.stringify(raw);
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="json"]',
    ) as HTMLInputElement;
    const file = new File([sourceJson], 'normalized.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork();
    });

    const targetId = useAppStore.getState().project.id;
    expect(targetId).not.toBe(imported.id);
    expect(getProjectRecoverySourceJson(targetId)).toBe(sourceJson);
  });

  it('keeps the newest JSON import when an older read finishes later', async () => {
    const base = useAppStore.getState().project;
    const older = { ...base, name: 'Older import result' };
    const newer = { ...base, name: 'Newest import result' };
    let resolveOlder!: (value: string) => void;
    let resolveNewer!: (value: string) => void;
    const olderFile = new File([], 'older.json', { type: 'application/json' });
    const newerFile = new File([], 'newer.json', { type: 'application/json' });
    Object.defineProperty(olderFile, 'text', {
      configurable: true,
      value: vi.fn().mockReturnValue(new Promise((resolve) => {
        resolveOlder = resolve;
      })),
    });
    Object.defineProperty(newerFile, 'text', {
      configurable: true,
      value: vi.fn().mockReturnValue(new Promise((resolve) => {
        resolveNewer = resolve;
      })),
    });
    act(() => {
      root = createRoot(host!);
      root.render(<Header />);
    });
    const input = host!.querySelector(
      'input[type="file"][accept*="json"]',
    ) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [olderFile],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [newerFile],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await act(async () => {
      resolveNewer(serializeProject(newer));
      await flushAsyncWork();
    });
    expect(useAppStore.getState().project.name).toBe('Newest import result');

    await act(async () => {
      resolveOlder(serializeProject(older));
      await flushAsyncWork();
    });
    expect(useAppStore.getState().project.name).toBe('Newest import result');
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

  it('switches away from a deleted current project when only unreadable projects remain', async () => {
    const current = createEmptyProject();
    current.name = 'Current project';
    expect(saveProjectToLocal(current)).toBe(true);
    const unreadableId = 'unreadable-project';
    localStorage.setItem(
      `pb2d.project.${encodeURIComponent(unreadableId)}`,
      '{broken-json',
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });
    act(() => button(i18n.t('header.projects')).click());
    const card = projectCard(current.name);
    act(() => {
      const remove = [...card.querySelectorAll('button')].find(
        (element) => element.textContent === i18n.t('projects.delete'),
      )!;
      remove.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    expect(useAppStore.getState().project.id).not.toBe(current.id);
    expect(useAppStore.getState().project.id).not.toBe(unreadableId);
    expect(loadProjectById(current.id)).toBeNull();
    expect(listLocalProjects().map((entry) => entry.id)).toContain(
      unreadableId,
    );
    expect(useAppStore.getState().ui.errorMessage).not.toBeNull();
  });
});

describe('App persistence guards', () => {
  it('prevents unloading when the final project save fails', async () => {
    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, key, value) {
        if (String(key).startsWith('pb2d.project.')) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, key, value);
      },
    );
    const event = new Event('beforeunload', { cancelable: true });

    try {
      expect(window.dispatchEvent(event)).toBe(false);
    } finally {
      setItem.mockRestore();
    }

    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe(false);
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

  it('preserves the exact damaged source before accepting a recoverable share', async () => {
    const shared = createEmptyProject();
    shared.name = 'Recoverable shared project';
    const recoverable = {
      ...shared,
      entities: [{ id: 'broken', type: 'polygon' }],
    } as typeof shared;
    const sourceJson = serializeProject(recoverable);
    const hash = await encodeProjectToShareHash(recoverable);
    window.location.hash = hash!;

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    const targetId = useAppStore.getState().project.id;
    expect(targetId).not.toBe(shared.id);
    expect(getProjectRecoverySourceJson(targetId)).toBe(sourceJson);
    expect(loadProjectById(targetId)?.name).toBe(shared.name);
    expect(useAppStore.getState().ui.errorMessage).toContain('1');
    expect(window.location.hash).toBe('');
  });

  it('preserves a shared source normalized by clamping and unknown-field removal', async () => {
    const shared = createEmptyProject();
    const normalizedSource = {
      ...shared,
      settings: {
        ...shared.settings,
        gridSize: 2_000_000,
      },
      futureMetadata: {
        source: 'future-version',
      },
    } as typeof shared;
    const sourceJson = serializeProject(normalizedSource);
    const hash = await encodeProjectToShareHash(normalizedSource);
    window.location.hash = hash!;

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    const target = useAppStore.getState().project;
    expect(target.id).not.toBe(shared.id);
    expect(target.settings.gridSize).not.toBe(2_000_000);
    expect('futureMetadata' in target).toBe(false);
    expect(getProjectRecoverySourceJson(target.id)).toBe(sourceJson);
    expect(window.location.hash).toBe('');
  });

  it('keeps a decodable but unsupported shared source in the URL', async () => {
    const unsupported = {
      ...createEmptyProject(),
      version: '9.0.0',
    } as unknown as Parameters<typeof encodeProjectToShareHash>[0];
    const hash = await encodeProjectToShareHash(unsupported);
    window.location.hash = hash!;

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    expect(window.location.hash).toBe(hash);
    expect(useAppStore.getState().ui.errorMessage).toContain(
      i18n.t('errors.projectDecodeReasons.unsupported-version'),
    );
  });

  it('keeps a gzip share hash when decompression is unavailable', async () => {
    const shared = createEmptyProject();
    const hash = `${SHARE_HASH_PREFIX}gz.${gzipSync(
      serializeProject(shared),
    ).toString('base64url')}`;
    window.location.hash = hash;
    const restoreDecompressionStream = replaceGlobalValue(
      'DecompressionStream',
      undefined,
    );

    try {
      await act(async () => {
        root = createRoot(host!);
        root.render(<App />);
        await flushAsyncWork();
      });
    } finally {
      restoreDecompressionStream();
    }

    expect(window.location.hash).toBe(hash);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      i18n.t('errors.shareInvalid'),
    );
  });

  it('keeps a gzip share hash when decompression temporarily fails', async () => {
    const shared = createEmptyProject();
    const hash = `${SHARE_HASH_PREFIX}gz.${gzipSync(
      serializeProject(shared),
    ).toString('base64url')}`;
    window.location.hash = hash;
    const restoreBlob = replaceGlobalValue('Blob', NodeBlob);
    const restoreDecompressionStream = replaceGlobalValue(
      'DecompressionStream',
      class {
        constructor() {
          throw new Error('Temporary decompression failure');
        }
      },
    );

    try {
      await act(async () => {
        root = createRoot(host!);
        root.render(<App />);
        await flushAsyncWork();
      });
    } finally {
      restoreDecompressionStream();
      restoreBlob();
    }

    expect(window.location.hash).toBe(hash);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      i18n.t('errors.shareInvalid'),
    );
  });

  it('clears an oversized shared hash after falling back locally', async () => {
    const hash =
      `${SHARE_HASH_PREFIX}raw.${'A'.repeat(MAX_SHARE_HASH_LENGTH)}`;
    window.location.hash = hash;

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    expect(window.location.hash).toBe('');
    expect(useAppStore.getState().ui.errorMessage).toBe(
      i18n.t('errors.shareInvalid'),
    );
  });

  it('removes a staged share recovery record when the project save fails', async () => {
    const shared = createEmptyProject();
    const recoverable = {
      ...shared,
      entities: [{ id: 'broken', type: 'polygon' }],
    } as typeof shared;
    const hash = await encodeProjectToShareHash(recoverable);
    window.location.hash = hash!;
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, key, value) {
        if (String(key).startsWith('pb2d.project.')) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, key, value);
      },
    );

    try {
      await act(async () => {
        root = createRoot(host!);
        root.render(<App />);
        await flushAsyncWork();
      });
    } finally {
      setItem.mockRestore();
    }

    const recoveryKeys = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.key(index),
    ).filter((key) => key?.startsWith('pb2d.recovery.'));
    expect(recoveryKeys).toEqual([]);
    expect(window.location.hash).toBe(hash);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      i18n.t('errors.saveFailed'),
    );
  });

  it('keeps the share error after loading a recoverable local fallback', async () => {
    const local = createEmptyProject();
    local.name = 'Recoverable local';
    expect(saveProjectToLocal(local)).toBe(true);
    const raw = JSON.parse(serializeProject(local));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    localStorage.setItem(
      `pb2d.project.${encodeURIComponent(local.id)}`,
      JSON.stringify(raw),
    );
    window.location.hash = '#pb2d=raw.not+base64';

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
    });

    expect(useAppStore.getState().project.id).toBe(local.id);
    expect(useAppStore.getState().ui.errorMessage).toContain(
      i18n.t('errors.shareInvalid'),
    );
    expect(useAppStore.getState().ui.errorMessage).toContain('1');
    expect(window.location.hash).toBe('');
  });
});

describe('recoverable local initialization', () => {
  it('warns and preserves original bytes through the first autosave', async () => {
    const saved = createEmptyProject();
    saved.name = 'Recoverable';
    expect(saveProjectToLocal(saved)).toBe(true);
    const raw = JSON.parse(serializeProject(saved));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    const source = JSON.stringify(raw);
    const key = `pb2d.project.${encodeURIComponent(saved.id)}`;
    localStorage.setItem(key, source);

    await act(async () => {
      root = createRoot(host!);
      root.render(<App />);
      await flushAsyncWork();
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    expect(useAppStore.getState().project.id).toBe(saved.id);
    expect(useAppStore.getState().ui.errorMessage).toContain('1');
    expect(localStorage.getItem(key)).toBe(source);
  });
});
