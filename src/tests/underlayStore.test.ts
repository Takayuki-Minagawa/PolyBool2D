import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../app/projectFactory';
import {
  deleteLocalProject,
  listLocalProjects,
  saveProjectToLocal,
} from '../persistence/localProjectStore';
import {
  deleteUnderlayImage,
  deleteUnderlaysForProject,
  imageDimensions,
  listUnderlayImages,
  normalizeUnderlayTransform,
  saveUnderlayImage,
  type UnderlayImage,
} from '../persistence/underlayStore';

type FakeRequest<T> = {
  result: T;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
};

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private completionQueued = false;

  constructor(private readonly records: Map<IDBValidKey, UnderlayImage>) {}

  objectStore() {
    return {
      put: (image: UnderlayImage) => {
        this.records.set(image.id, image);
        this.queueCompletion();
      },
      delete: (key: IDBValidKey) => {
        this.records.delete(key);
        this.queueCompletion();
      },
      index: () => ({
        getAll: (projectId: string) => this.request(
          [...this.records.values()].filter((image) => image.projectId === projectId),
        ),
        getAllKeys: (projectId: string) => this.request(
          [...this.records.values()]
            .filter((image) => image.projectId === projectId)
            .map((image) => image.id),
        ),
      }),
    };
  }

  private request<T>(result: T): FakeRequest<T> {
    const request: FakeRequest<T> = {
      result,
      error: null,
      onsuccess: null,
      onerror: null,
    };
    queueMicrotask(() => {
      request.onsuccess?.();
      this.queueCompletion();
    });
    return request;
  }

  private queueCompletion() {
    if (this.completionQueued) return;
    this.completionQueued = true;
    queueMicrotask(() => this.oncomplete?.());
  }
}

function installFakeIndexedDb() {
  const records = new Map<IDBValidKey, UnderlayImage>();
  let storeCreated = false;
  let failOpen = false;
  const database = {
    objectStoreNames: {
      contains: () => storeCreated,
    },
    createObjectStore: () => {
      storeCreated = true;
      return {
        indexNames: { contains: () => false },
        createIndex: vi.fn(),
      };
    },
    transaction: () => new FakeTransaction(records),
    close: vi.fn(),
  };
  vi.stubGlobal('IDBKeyRange', { only: (value: string) => value });
  vi.stubGlobal('indexedDB', {
    open: () => {
      if (failOpen) throw new Error('Transient IndexedDB failure');
      const request = {
        result: database,
        error: null,
        transaction: null,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };
      queueMicrotask(() => {
        if (!storeCreated) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });
  return {
    setFailOpen(value: boolean) {
      failOpen = value;
    },
  };
}

function underlay(
  id: string,
  projectId: string,
  createdAt: string,
): UnderlayImage {
  return {
    id,
    projectId,
    name: id,
    blob: new Blob(['image'], { type: 'image/png' }),
    width: 100,
    height: 50,
    x: 0,
    y: 0,
    scale: 1,
    rotationDeg: 0,
    opacity: 0.5,
    visible: true,
    createdAt,
  };
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('underlay IndexedDB persistence', () => {
  it('saves, lists and deletes images without touching another project', async () => {
    installFakeIndexedDb();
    const first = underlay('first', 'project-a', '2026-01-02T00:00:00.000Z');
    const earlier = underlay('earlier', 'project-a', '2026-01-01T00:00:00.000Z');
    const other = underlay('other', 'project-b', '2026-01-03T00:00:00.000Z');

    await saveUnderlayImage(first);
    await saveUnderlayImage(earlier);
    await saveUnderlayImage(other);

    await expect(listUnderlayImages('project-a')).resolves.toEqual([earlier, first]);
    await deleteUnderlayImage(first.id);
    await expect(listUnderlayImages('project-a')).resolves.toEqual([earlier]);

    await deleteUnderlaysForProject('project-a');
    await expect(listUnderlayImages('project-a')).resolves.toEqual([]);
    await expect(listUnderlayImages('project-b')).resolves.toEqual([other]);
  });

  it('retries project underlay cleanup after a transient IndexedDB failure', async () => {
    localStorage.clear();
    const database = installFakeIndexedDb();
    const project = createEmptyProject();
    project.id = 'project-retry';
    expect(saveProjectToLocal(project)).toBe(true);
    await saveUnderlayImage(
      underlay('retry-underlay', project.id, '2026-01-01T00:00:00.000Z'),
    );

    database.setFailOpen(true);
    expect(deleteLocalProject(project.id)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem('pb2d.underlays.pending-deletes')).toContain(
      project.id,
    );

    database.setFailOpen(false);
    listLocalProjects();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(listUnderlayImages(project.id)).resolves.toEqual([]);
    expect(localStorage.getItem('pb2d.underlays.pending-deletes')).toBeNull();
  });
});

describe('underlay transforms', () => {
  it('normalizes unsafe image transform input', () => {
    expect(normalizeUnderlayTransform({
      x: Number.NaN,
      y: 20,
      scale: -1,
      rotationDeg: 450,
      opacity: 2,
      visible: false,
    })).toEqual({
      x: 0,
      y: 20,
      scale: 1,
      rotationDeg: 90,
      opacity: 1,
      visible: false,
    });
    expect(normalizeUnderlayTransform({ rotationDeg: -90 }).rotationDeg).toBe(270);
  });

  it('always closes decoded ImageBitmap resources', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 12,
      height: 34,
      close,
    })));

    await expect(imageDimensions(
      new Blob(['image'], { type: 'image/png' }),
    )).resolves.toEqual({ width: 12, height: 34 });
    expect(close).toHaveBeenCalledOnce();
  });
});
