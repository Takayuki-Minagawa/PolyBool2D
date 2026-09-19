import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createEmptyProject, createLinearEntity } from '../app/projectFactory';
import { cleanDrawingLines } from '../geometry/lineCleanup';
import { buildSvg } from '../persistence/svgExport';
import { decodeProject, serializeProject } from '../persistence/projectCodec';
import { DEFAULT_PRINT_LAYOUT, printBounds } from '../persistence/printLayout';
import { clipPdfSegment } from '../persistence/pdfImport';

describe('large drawing persistence', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
  });
  it('migrates legacy bytes, saves a 32,222-entity drawing, edits, restores and switches atomically', async () => {
    const project = createEmptyProject();
    project.name = 'Large drawing';
    project.entities = Array.from({ length: 32_222 }, (_, i) => ({
      ...createLinearEntity(
        [
          { x: i, y: 0 },
          { x: i, y: 6000 },
        ],
        'polyline',
      ),
      id: `line-${i}`,
    }));
    const key = `pb2d.project.${encodeURIComponent(project.id)}`;
    localStorage.setItem(
      key,
      serializeProject({ ...project, entities: project.entities.slice(0, 10) }),
    );
    const store = await import('../persistence/durableProjectStore');
    await store.initializeProjectDatabase();
    expect(localStorage.getItem(key)).toBeNull();
    expect(store.loadProjectById(project.id)?.entities).toHaveLength(10);
    expect(await store.saveProjectToLocal(project)).toBe(true);
    const edited = {
      ...project,
      name: 'Edited',
      updatedAt: new Date().toISOString(),
    };
    expect(await store.saveProjectToLocal(edited)).toBe(true);
    expect(store.listProjectBackups(project.id)).toHaveLength(2);
    const second = createEmptyProject();
    expect(await store.saveProjectToLocal(second)).toBe(true);
    expect(store.getActiveProjectId()).toBe(second.id);
    expect(store.loadProjectById(project.id)?.name).toBe('Edited');
    const result = await store.restoreProjectBackupResult(
      project.id,
      store.listProjectBackups(project.id)[0].id,
    );
    expect(result.ok).toBe(true);
    expect(store.loadProjectById(project.id)?.entities).toHaveLength(32_222);
  }, 30_000);
  it('does not recreate a deleted project from a queued autosave', async () => {
    const store = await import('../persistence/durableProjectStore');
    await store.initializeProjectDatabase();
    const project = createEmptyProject();
    await store.saveProjectToLocal(project);
    const deletion = store.deleteLocalProject(project.id);
    const lateSave = store.saveProjectToLocal(project);
    expect(await deletion).toBe(true);
    expect(await lateSave).toBe(false);
    expect(store.loadProjectById(project.id)).toBeNull();
  });
  it('reports failed transactions and rolls the in-memory project back', async () => {
    const store = await import('../persistence/durableProjectStore');
    await store.initializeProjectDatabase();
    const project = createEmptyProject();
    await store.saveProjectToLocal(project);
    const { IDBDatabase } = await import('fake-indexeddb');
    const transaction = vi
      .spyOn(IDBDatabase.prototype, 'transaction')
      .mockImplementation(() => {
        throw new DOMException('Quota', 'QuotaExceededError');
      });
    expect(
      await store.saveProjectToLocal({ ...project, name: 'Unsaved edit' }),
    ).toBe(false);
    expect(store.loadProjectById(project.id)?.name).toBe(project.name);
    expect(store.useSaveState.getState().error).toContain('QuotaExceededError');
    transaction.mockRestore();
    expect(
      await store.saveProjectToLocal({ ...project, name: 'Retried' }),
    ).toBe(true);
  });
  it('retains the original localStorage copy when migration cannot commit', async () => {
    const project = createEmptyProject();
    const key = `pb2d.project.${encodeURIComponent(project.id)}`;
    const original = serializeProject(project);
    localStorage.setItem(key, original);
    const { IDBDatabase } = await import('fake-indexeddb');
    const originalTransaction = IDBDatabase.prototype.transaction;
    const transaction = vi
      .spyOn(IDBDatabase.prototype, 'transaction')
      .mockImplementation(function (this: IDBDatabase, ...args) {
        if (args[1] === 'readwrite') throw new Error('Storage disabled');
        return originalTransaction.apply(this, args);
      });
    const store = await import('../persistence/durableProjectStore');
    await store.initializeProjectDatabase();
    expect(localStorage.getItem(key)).toBe(original);
    expect(store.useSaveState.getState().state).toBe('failed');
    transaction.mockRestore();
    expect(await store.saveProjectToLocal(project)).toBe(true);
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('rejects writes after another tab changed storage', async () => {
    const store = await import('../persistence/durableProjectStore');
    await store.initializeProjectDatabase();
    const project = createEmptyProject();
    await store.saveProjectToLocal(project);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('polybool2d-projects', 1);
      open.onsuccess = () => {
        const tx = open.result.transaction('records', 'readwrite');
        tx.objectStore('records').put(999, '__revision');
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    expect(
      await store.saveProjectToLocal({ ...project, name: 'Conflict' }),
    ).toBe(false);
    expect(store.useSaveState.getState().error).toContain('Another tab');
    expect(store.loadProjectById(project.id)?.name).toBe(project.name);
  });
});

describe('paper and line workflows', () => {
  it.each(['mm', 'cm', 'm'] as const)(
    'maps a 6000 mm line to 120 mm at 1/50 for %s coordinates',
    (unit) => {
      const project = createEmptyProject();
      project.unit = unit;
      const units = unit === 'm' ? 6 : unit === 'cm' ? 600 : 6000;
      project.entities = [
        createLinearEntity(
          [
            { x: 0, y: 0 },
            { x: units, y: 0 },
          ],
          'polyline',
        ),
      ];
      const bounds = printBounds(project, DEFAULT_PRINT_LAYOUT);
      expect((units / (bounds.maxX - bounds.minX)) * 420).toBeCloseTo(120, 10);
      const svg = buildSvg(project, DEFAULT_PRINT_LAYOUT);
      expect(svg).toContain('width="420mm" height="297mm"');
    },
  );
  it('round trips paper and dash attributes without normalization or data loss', () => {
    const project = createEmptyProject();
    const line = createLinearEntity(
      [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
      ],
      'polyline',
    );
    line.style = {
      ...line.style,
      dashArray: [20, 10, 1, 10],
      dashOffset: 3,
      lineCap: 'butt',
      lineJoin: 'bevel',
    };
    project.entities = [line];
    project.printLayout = DEFAULT_PRINT_LAYOUT;
    const decoded = decodeProject(serializeProject(project));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.sourceWasNormalized).toBe(false);
      expect(decoded.project.entities[0].style).toEqual(line.style);
    }
    expect(buildSvg(project)).toContain('stroke-dasharray="20 10 1 10"');
  });
  it('removes reversed duplicate lines, joins chains, and protects branches, dashes and locks', () => {
    const project = createEmptyProject();
    const line = (a: number, b: number) =>
      createLinearEntity(
        [
          { x: a, y: 0 },
          { x: b, y: 0 },
        ],
        'polyline',
      );
    const a = line(0, 1),
      b = line(1, 2),
      duplicate = line(1, 0),
      locked = { ...line(2, 3), locked: true };
    project.entities = [a, b, duplicate, locked];
    const result = cleanDrawingLines(project, true);
    expect(result.removed).toBe(1);
    expect(result.joined).toBe(1);
    expect(result.entities).toHaveLength(2);
    expect(result.entities).toContain(locked);
    const branch = createLinearEntity(
      [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      'polyline',
    );
    project.entities = [a, b, branch];
    expect(cleanDrawingLines(project, true).joined).toBe(0);
    a.style.dashArray = [1, 1];
    b.style.dashArray = [1, 1];
    project.entities = [a, b];
    expect(cleanDrawingLines(project, true).joined).toBe(0);
  });
  it('clips PDF line segments at the exact crop boundary', () => {
    expect(
      clipPdfSegment(
        { x: -5, y: 5 },
        { x: 15, y: 5 },
        { x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(
      clipPdfSegment(
        { x: -5, y: -5 },
        { x: 15, y: -5 },
        { x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toEqual([]);
  });
});
