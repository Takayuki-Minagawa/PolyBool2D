import { makeId } from '../app/idUtils';

const DATABASE_NAME = 'polybool2d-assets';
const DATABASE_VERSION = 1;
const STORE_NAME = 'underlays';

export type UnderlayImage = {
  id: string;
  projectId: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
  visible: boolean;
  createdAt: string;
};

export type UnderlayTransform = Pick<
  UnderlayImage,
  'x' | 'y' | 'scale' | 'rotationDeg' | 'opacity' | 'visible'
>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnderlayImage(
  value: unknown,
  projectId?: string,
): value is UnderlayImage {
  if (!isObject(value)) return false;
  const blob = value.blob;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.projectId === 'string' &&
    value.projectId.length > 0 &&
    (projectId === undefined || value.projectId === projectId) &&
    typeof value.name === 'string' &&
    typeof Blob !== 'undefined' &&
    blob instanceof Blob &&
    blob.size > 0 &&
    blob.type.startsWith('image/') &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0 &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    typeof value.scale === 'number' &&
    Number.isFinite(value.scale) &&
    value.scale > 0 &&
    typeof value.rotationDeg === 'number' &&
    Number.isFinite(value.rotationDeg) &&
    typeof value.opacity === 'number' &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    typeof value.visible === 'boolean' &&
    typeof value.createdAt === 'string'
  );
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable');
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  return new Promise((resolve, reject) => {
    let settled = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('projectId')) {
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error('IndexedDB open failed'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB open was blocked'));
    };
  });
}

export function normalizeUnderlayTransform(
  partial: Partial<UnderlayTransform>,
): UnderlayTransform {
  return {
    x: Number.isFinite(partial.x) ? partial.x! : 0,
    y: Number.isFinite(partial.y) ? partial.y! : 0,
    scale: Number.isFinite(partial.scale) && partial.scale! > 0
      ? Math.min(1_000_000, partial.scale!)
      : 1,
    rotationDeg: Number.isFinite(partial.rotationDeg)
      ? ((partial.rotationDeg! % 360) + 360) % 360
      : 0,
    opacity: Number.isFinite(partial.opacity)
      ? Math.min(1, Math.max(0.05, partial.opacity!))
      : 0.45,
    visible: partial.visible !== false,
  };
}

export async function imageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  if (!blob.type.startsWith('image/')) return null;
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      return dimensions.width > 0 && dimensions.height > 0 ? dimensions : null;
    } catch {
      // Fall through to the HTMLImageElement implementation.
    } finally {
      try {
        bitmap?.close();
      } catch {
        // Decoded image resources are best-effort cleanup only.
      }
    }
  }
  if (
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) return null;
  let url: string;
  try {
    url = URL.createObjectURL(blob);
  } catch {
    return null;
  }
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () =>
        resolve(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? { width: image.naturalWidth, height: image.naturalHeight }
            : null,
        );
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createUnderlayImage(
  projectId: string,
  blob: Blob,
  name: string,
  transform: Partial<UnderlayTransform> = {},
): Promise<UnderlayImage | null> {
  if (!projectId || blob.size === 0 || typeof name !== 'string') return null;
  const dimensions = await imageDimensions(blob);
  if (!dimensions) return null;
  return {
    id: makeId('underlay'),
    projectId,
    name: name.trim() || 'Underlay',
    blob,
    ...dimensions,
    ...normalizeUnderlayTransform(transform),
    createdAt: new Date().toISOString(),
  };
}

export async function saveUnderlayImage(image: UnderlayImage): Promise<void> {
  if (!isUnderlayImage(image)) {
    throw new TypeError('Invalid underlay image');
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completion = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(image);
    await completion;
  } finally {
    database.close();
  }
}

export async function listUnderlayImages(projectId: string): Promise<UnderlayImage[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completion = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME)
      .index('projectId')
      .getAll(IDBKeyRange.only(projectId));
    const [result] = await Promise.all([
      requestResult(request),
      completion,
    ]);
    return (result as UnderlayImage[])
      .filter((image) => isUnderlayImage(image, projectId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    database.close();
  }
}

export async function updateUnderlayTransform(
  id: string,
  partial: Partial<UnderlayTransform>,
): Promise<boolean> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    let current: UnderlayImage | undefined;
    try {
      current = await requestResult(store.get(id)) as UnderlayImage | undefined;
    } catch (error) {
      await completion.catch(() => undefined);
      throw error;
    }
    if (!current || !isUnderlayImage(current)) {
      await completion;
      return false;
    }
    store.put({
      ...current,
      ...normalizeUnderlayTransform({ ...current, ...partial }),
    });
    await completion;
    return true;
  } finally {
    database.close();
  }
}

export async function deleteUnderlayImage(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completion = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await completion;
  } finally {
    database.close();
  }
}

export const UNDERLAYS_CHANGED_EVENT = 'polybool2d:underlays-changed';

export function notifyUnderlaysChanged(projectId: string): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(UNDERLAYS_CHANGED_EVENT, { detail: { projectId } }),
  );
}
