import { create } from 'zustand';
import * as legacy from './localProjectStore';
import { ProjectMemoryStorage, setProjectStorage } from './projectStorage';
import type { Project } from '../app/projectTypes';

export {
  MAX_PROJECT_BACKUPS,
  getActiveProjectId,
  loadProjectById,
  loadProjectByIdResult,
  loadProjectFromLocal,
  loadProjectFromLocalResult,
  listLocalProjects,
  listProjectBackups,
  getProjectRecoverySourceJson,
  getProjectRecoverySnapshot,
  type ProjectBackupSummary,
  type ProjectRecoverySnapshotSummary,
  type StoredProjectSummary,
} from './localProjectStore';

export const useSaveState = create<{
  state: 'unsaved' | 'saving' | 'saved' | 'failed';
  savedAt: string | null;
  error: string | null;
  project: Project | null;
}>(() => ({ state: 'unsaved', savedAt: null, error: null, project: null }));

let database: IDBDatabase | null = null;
let memory: ProjectMemoryStorage | null = null;
let initialization: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let startupError: unknown = null;
let revision = 0;
const deletedIds = new Set<string>();
const ownsKey = (key: string) =>
  key === 'pb2d.project' ||
  /^pb2d\.(project\.|projects\.|backups\.|recovery\.|underlays\.pending-deletes)/.test(
    key,
  );

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => {
      /* onabort is the authoritative failure */
    };
  });
}

async function commit(before: Map<string, string>): Promise<void> {
  if (!database || !memory) return;
  const changed =
    before.size !== memory.values.size ||
    [...memory.values].some(([key, value]) => before.get(key) !== value);
  const tx = database.transaction(
    'records',
    changed ? 'readwrite' : 'readonly',
  );
  const done = transactionDone(tx);
  const store = tx.objectStore('records');
  const expected = revision;
  const check = store.get('__revision');
  let conflict = false;
  check.onsuccess = () => {
    if (Number(check.result ?? 0) !== expected) {
      conflict = true;
      tx.abort();
      return;
    }
    if (!changed) return;
    for (const [key, value] of memory!.values) {
      if (before.get(key) !== value) store.put(value, key);
    }
    for (const key of before.keys())
      if (!memory!.values.has(key)) store.delete(key);
    store.put(expected + 1, '__revision');
  };
  try {
    await done;
    revision = expected + (changed ? 1 : 0);
  } catch (error) {
    if (conflict)
      throw new Error(
        'Another tab changed saved projects. Export JSON, then reload before retrying.',
      );
    throw error;
  }
}

/** The old bytes are removed only after the complete migration transaction commits. */
export function initializeProjectDatabase(): Promise<void> {
  initialization ??= (async () => {
    try {
      database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('polybool2d-projects', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('records');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error('IndexedDB blocked by another tab'));
      });
      database.onversionchange = () => database?.close();
      const tx = database.transaction('records', 'readonly');
      const done = transactionDone(tx);
      const values = new Map<string, string>();
      tx.objectStore('records').openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (cursor) {
          if (cursor.key === '__revision') revision = Number(cursor.value);
          else values.set(String(cursor.key), String(cursor.value));
          cursor.continue();
        }
      };
      await done;
      memory = new ProjectMemoryStorage(values);
      const before = new Map(values);
      const migrated: string[] = [];
      // If localStorage is disabled, IndexedDB can still be fully usable.
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index)!;
          if (!ownsKey(key)) continue;
          const raw = localStorage.getItem(key);
          if (raw !== null && !values.has(key)) {
            values.set(key, raw);
            migrated.push(key);
          } else if (raw === values.get(key)) migrated.push(key);
        }
      } catch {
        /* no legacy storage access */
      }
      setProjectStorage(memory);
      legacy.listLocalProjects();
      await commit(before);
      for (const key of migrated) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* original copy is harmless */
        }
      }
    } catch (error) {
      startupError = error;
      setProjectStorage(null);
      memory = null;
      useSaveState.setState({
        state: 'failed',
        error: describeStorageError(error),
      });
    }
  })();
  return initialization;
}

export function describeStorageError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

function durable<T>(operation: () => T, fallback: T): Promise<T> {
  const run = queue.then(async () => {
    // Unit tests and legacy consumers can use the synchronous adapter without startup.
    if (initialization) await initialization;
    if (startupError) return fallback;
    const before = memory ? new Map(memory.values) : null;
    try {
      const result = operation();
      if (before) await commit(before);
      return result;
    } catch (error) {
      if (before && memory) memory.values = before;
      useSaveState.setState({
        state: 'failed',
        error: describeStorageError(error),
      });
      return fallback;
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function saveProjectToLocal(project: Project): Promise<boolean> {
  if (deletedIds.has(project.id)) return false;
  if (startupError) {
    startupError = null;
    initialization = null;
    database?.close();
    database = null;
    await initializeProjectDatabase();
  }
  useSaveState.setState({ state: 'saving', error: null });
  const saved = await durable(
    () => !deletedIds.has(project.id) && legacy.saveProjectToLocal(project),
    false,
  );
  useSaveState.setState(
    saved
      ? {
          state: 'saved',
          savedAt: new Date().toISOString(),
          project,
          error: null,
        }
      : {
          state: 'failed',
          error:
            useSaveState.getState().error ??
            describeStorageError(startupError ?? 'Storage write failed'),
        },
  );
  return saved;
}
export const preserveProjectRecoverySource = (
  ...args: Parameters<typeof legacy.preserveProjectRecoverySource>
) => durable(() => legacy.preserveProjectRecoverySource(...args), false);
export const deleteProjectRecoverySnapshot = (id: string) =>
  durable(() => legacy.deleteProjectRecoverySnapshot(id), false);
export const setActiveProjectId = (id: string | null) =>
  durable(() => legacy.setActiveProjectId(id), false);
export const deleteLocalProject = async (id: string) => {
  deletedIds.add(id);
  const removed = await durable(() => legacy.deleteLocalProject(id), false);
  if (!removed) deletedIds.delete(id);
  else legacy.retryPendingUnderlayDeletes();
  return removed;
};
export const renameLocalProject = (id: string, name: string) =>
  durable(() => legacy.renameLocalProject(id, name), null);
export const duplicateLocalProject = (id: string) =>
  durable(() => legacy.duplicateLocalProject(id), null);
export const restoreProjectBackupResult = (id: string, backup: string) =>
  durable<legacy.ProjectBackupRestoreResult>(
    () => legacy.restoreProjectBackupResult(id, backup),
    { ok: false, reason: 'save-failed' },
  );
export const restoreProjectRecoverySnapshot = (id: string) =>
  durable<legacy.ProjectBackupRestoreResult>(
    () => legacy.restoreProjectRecoverySnapshot(id),
    { ok: false, reason: 'save-failed' },
  );
