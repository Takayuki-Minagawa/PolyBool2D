import { makeId } from '../app/idUtils';
import type { Project } from '../app/projectTypes';
import {
  decodeProject,
  serializeProject,
  type ProjectDecodeFailure,
  type ProjectDecodeFailureReason,
  type ProjectDecodeResult,
  type ProjectDecodeSuccess,
} from './projectCodec';
import { deleteUnderlaysForProject } from './underlayStore';

const LEGACY_PROJECT_KEY = 'pb2d.project';
const PROJECT_KEY_PREFIX = 'pb2d.project.';
const BACKUP_KEY_PREFIX = 'pb2d.backups.';
const INDEX_KEY = 'pb2d.projects.index';
const ACTIVE_PROJECT_KEY = 'pb2d.projects.active';
const MIGRATION_KEY = 'pb2d.projects.migrated';
const PENDING_UNDERLAY_DELETES_KEY = 'pb2d.underlays.pending-deletes';
const STORAGE_INDEX_VERSION = 1;
const UNREADABLE_PROJECT_DATE = '1970-01-01T00:00:00.000Z';

export const MAX_PROJECT_BACKUPS = 10;

export type StoredProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectBackupSummary = {
  id: string;
  savedAt: string;
  projectUpdatedAt: string;
  name: string;
  entityCount: number;
  discardedItemCount: number;
  discardedReasons: string[];
  decodeFailureReason?: ProjectDecodeFailureReason;
};

export type LocalProjectLoadResult = {
  id: string;
  decodeResult: ProjectDecodeResult;
};

export type ProjectBackupRestoreResult =
  | {
      ok: true;
      project: Project;
      decodeResult: ProjectDecodeSuccess;
    }
  | {
      ok: false;
      reason:
        | 'backup-not-found'
        | 'decode-failed'
        | 'project-id-mismatch'
        | 'save-failed';
      decodeResult?: ProjectDecodeFailure;
    };

type ProjectIndex = {
  version: typeof STORAGE_INDEX_VERSION;
  projects: StoredProjectSummary[];
};

type ProjectBackup = {
  id: string;
  savedAt: string;
  projectJson: string;
};

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

let underlayCleanupInFlight = false;

function readPendingUnderlayDeletes(): string[] {
  if (!storageAvailable()) return [];
  try {
    const raw = localStorage.getItem(PENDING_UNDERLAY_DELETES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ))]
      : [];
  } catch {
    return [];
  }
}

function writePendingUnderlayDeletes(ids: readonly string[]): boolean {
  if (!storageAvailable()) return false;
  try {
    const unique = [...new Set(ids)].filter((id) => id.length > 0);
    if (unique.length === 0) {
      localStorage.removeItem(PENDING_UNDERLAY_DELETES_KEY);
    } else {
      localStorage.setItem(PENDING_UNDERLAY_DELETES_KEY, JSON.stringify(unique));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Retry durable underlay-deletion tombstones. A transient IndexedDB failure
 * must not turn a project deletion into a permanent orphaned Blob.
 */
function retryPendingUnderlayDeletes(): void {
  if (!storageAvailable() || underlayCleanupInFlight) return;
  const pending = readPendingUnderlayDeletes();
  if (pending.length === 0) return;
  const attempted = new Set(pending);
  underlayCleanupInFlight = true;
  void Promise.all(
    pending.map(async (projectId) => {
      try {
        await deleteUnderlaysForProject(projectId);
        return projectId;
      } catch {
        return null;
      }
    }),
  )
    .then((completed) => {
      const removed = new Set(
        completed.filter((id): id is string => id !== null),
      );
      writePendingUnderlayDeletes(
        readPendingUnderlayDeletes().filter((id) => !removed.has(id)),
      );
    })
    .finally(() => {
      underlayCleanupInFlight = false;
      // Process IDs queued while this batch was running, but avoid an
      // immediate retry loop for failures from the batch just attempted.
      if (readPendingUnderlayDeletes().some((id) => !attempted.has(id))) {
        retryPendingUnderlayDeletes();
      }
    });
}

function scheduleUnderlayCleanup(projectId: string): void {
  if (!projectId) return;
  const pending = [...readPendingUnderlayDeletes(), projectId];
  if (!writePendingUnderlayDeletes(pending)) {
    void deleteUnderlaysForProject(projectId).catch(() => undefined);
    return;
  }
  retryPendingUnderlayDeletes();
}

function projectKey(id: string): string {
  return `${PROJECT_KEY_PREFIX}${encodeURIComponent(id)}`;
}

function backupKey(id: string): string {
  return `${BACKUP_KEY_PREFIX}${encodeURIComponent(id)}`;
}

function projectSummary(project: Project): StoredProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function isSummary(value: unknown): value is StoredProjectSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  );
}

function readIndex(): StoredProjectSummary[] {
  if (!storageAvailable()) return [];
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectIndex>;
    if (parsed.version !== STORAGE_INDEX_VERSION || !Array.isArray(parsed.projects)) return [];
    return parsed.projects.filter(isSummary);
  } catch {
    return [];
  }
}

function writeIndex(projects: StoredProjectSummary[]): boolean {
  if (!storageAvailable()) return false;
  const unique = new Map(projects.map((project) => [project.id, project]));
  const sorted = [...unique.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  try {
    localStorage.setItem(
      INDEX_KEY,
      JSON.stringify({ version: STORAGE_INDEX_VERSION, projects: sorted } satisfies ProjectIndex),
    );
    return true;
  } catch {
    return false;
  }
}

function upsertIndex(project: Project): boolean {
  const projects = readIndex().filter((entry) => entry.id !== project.id);
  projects.push(projectSummary(project));
  return writeIndex(projects);
}

function readBackups(projectId: string): ProjectBackup[] {
  if (!storageAvailable()) return [];
  const raw = localStorage.getItem(backupKey(projectId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ProjectBackup => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
      const item = entry as Record<string, unknown>;
      return (
        typeof item.id === 'string' &&
        typeof item.savedAt === 'string' &&
        typeof item.projectJson === 'string'
      );
    });
  } catch {
    return [];
  }
}

function writeBackups(projectId: string, backups: ProjectBackup[]): boolean {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(backupKey(projectId), JSON.stringify(backups.slice(0, MAX_PROJECT_BACKUPS)));
    return true;
  } catch {
    return false;
  }
}

function retainPreviousVersion(projectId: string, projectJson: string): boolean {
  if (!decodeProject(projectJson).ok) return true;
  const backups = readBackups(projectId);
  if (backups[0]?.projectJson === projectJson) return true;
  const next = [{
    id: makeId('backup'),
    savedAt: new Date().toISOString(),
    projectJson,
  }, ...backups].slice(0, MAX_PROJECT_BACKUPS);
  // Quota pressure should reduce retained history before giving up. Replacing
  // the backup blob with a shorter list can succeed without extra free space.
  for (let length = next.length; length >= 1; length -= 1) {
    if (writeBackups(projectId, next.slice(0, length))) return true;
  }
  return false;
}

/** Move the original single-project key into the indexed store at most once. */
function migrateLegacyProject(): void {
  if (!storageAvailable()) return;
  retryPendingUnderlayDeletes();
  if (localStorage.getItem(MIGRATION_KEY) !== null) return;

  const legacyJson = localStorage.getItem(LEGACY_PROJECT_KEY);
  const legacyDecode = legacyJson ? decodeProject(legacyJson) : null;
  const legacyProject = legacyDecode?.ok ? legacyDecode.project : null;
  let migrated = legacyProject === null;

  if (legacyProject && legacyJson) {
    try {
      if (localStorage.getItem(projectKey(legacyProject.id)) === null) {
        localStorage.setItem(projectKey(legacyProject.id), legacyJson);
      }
      migrated = upsertIndex(legacyProject);
      if (migrated) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, legacyProject.id);
        localStorage.removeItem(LEGACY_PROJECT_KEY);
      }
    } catch {
      migrated = false;
    }
  }

  if (migrated) {
    try {
      localStorage.setItem(MIGRATION_KEY, '1');
    } catch {
      // A failed marker write only causes another idempotent migration attempt.
    }
  }
}

type ScannedProject = {
  storageId: string;
  decodeResult: ProjectDecodeResult;
};

function storageIdFromProjectKey(key: string): string {
  const encoded = key.slice(PROJECT_KEY_PREFIX.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function scanStoredProjects(): ScannedProject[] {
  if (!storageAvailable()) return [];
  const projects: ScannedProject[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PROJECT_KEY_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    projects.push({
      storageId: storageIdFromProjectKey(key),
      decodeResult: decodeProject(raw),
    });
  }
  return projects;
}

function unreadableProjectSummary(storageId: string): StoredProjectSummary {
  return {
    id: storageId,
    name: `Unreadable project (${storageId})`,
    createdAt: UNREADABLE_PROJECT_DATE,
    updatedAt: UNREADABLE_PROJECT_DATE,
  };
}

/** List locally saved projects, repairing a missing/stale index when possible. */
export function listLocalProjects(): StoredProjectSummary[] {
  if (!storageAvailable()) return [];
  migrateLegacyProject();

  const indexed = readIndex();
  const indexedById = new Map(indexed.map((summary) => [summary.id, summary]));
  const summaries = scanStoredProjects().flatMap(({ storageId, decodeResult }) => {
    if (decodeResult.ok) return [projectSummary(decodeResult.project)];
    const preserved = indexedById.get(storageId);
    return [preserved ?? unreadableProjectSummary(storageId)];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (JSON.stringify(indexed) !== JSON.stringify(summaries)) writeIndex(summaries);
  return summaries;
}

export function getActiveProjectId(): string | null {
  if (!storageAvailable()) return null;
  migrateLegacyProject();
  const id = localStorage.getItem(ACTIVE_PROJECT_KEY);
  return id && localStorage.getItem(projectKey(id)) !== null ? id : null;
}

export function setActiveProjectId(id: string | null): boolean {
  if (!storageAvailable()) return false;
  migrateLegacyProject();
  try {
    if (id === null) localStorage.removeItem(ACTIVE_PROJECT_KEY);
    else if (localStorage.getItem(projectKey(id)) !== null) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else return false;
    return true;
  } catch {
    return false;
  }
}

export function loadProjectByIdResult(id: string): ProjectDecodeResult | null {
  if (!storageAvailable()) return null;
  migrateLegacyProject();
  const raw = localStorage.getItem(projectKey(id));
  return raw ? decodeProject(raw) : null;
}

export function loadProjectById(id: string): Project | null {
  const result = loadProjectByIdResult(id);
  return result?.ok ? result.project : null;
}

/** Load the last active project, falling back to the most recently updated one. */
export function loadProjectFromLocalResult(): LocalProjectLoadResult | null {
  if (!storageAvailable()) return null;
  migrateLegacyProject();
  const activeId = getActiveProjectId();
  if (activeId) {
    const active = loadProjectByIdResult(activeId);
    if (active) return { id: activeId, decodeResult: active };
  }
  const first = listLocalProjects()[0];
  if (!first) return null;
  setActiveProjectId(first.id);
  const decodeResult = loadProjectByIdResult(first.id);
  return decodeResult ? { id: first.id, decodeResult } : null;
}

export function loadProjectFromLocal(): Project | null {
  const result = loadProjectFromLocalResult();
  return result?.decodeResult.ok ? result.decodeResult.project : null;
}

/** Save a project and retain the previously saved value as a per-project backup. */
export function saveProjectToLocal(project: Project): boolean {
  if (!storageAvailable()) return false;
  migrateLegacyProject();
  const nextJson = serializeProject(project);
  const key = projectKey(project.id);
  const previousJson = localStorage.getItem(key);
  if (previousJson === nextJson) {
    // The project body is already durable. Index and active-project metadata
    // are repairable hints and must not turn this into a false save failure.
    upsertIndex(project);
    setActiveProjectId(project.id);
    return true;
  }
  if (previousJson !== null) {
    const previous = decodeProject(previousJson);
    if (
      previous.ok &&
      previous.discardedItemCount > 0 &&
      serializeProject(previous.project) === nextJson
    ) {
      // Loading a recoverable file normalizes it in memory. Do not let the
      // first autosave silently erase the malformed records before the user
      // has made an intentional edit; the original bytes remain available.
      upsertIndex(project);
      setActiveProjectId(project.id);
      return true;
    }
  }

  // Backups are best effort. If quota pressure prevents even a single
  // snapshot, saving the user's current work still takes priority.
  if (previousJson !== null) retainPreviousVersion(project.id, previousJson);
  try {
    localStorage.setItem(key, nextJson);
  } catch {
    return false;
  }
  // listLocalProjects() can reconstruct a stale/missing index by scanning the
  // project keys, so these secondary writes are deliberately best effort.
  upsertIndex(project);
  setActiveProjectId(project.id);
  return true;
}

export function deleteLocalProject(id: string): boolean {
  if (!storageAvailable()) return false;
  migrateLegacyProject();
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    return false;
  }
  // The project body is the authoritative delete. IndexedDB underlays are
  // cleaned asynchronously so callers can synchronously switch away before
  // autosave has any chance to recreate the deleted project. A localStorage
  // tombstone makes transient IndexedDB failures retryable on later activity.
  scheduleUnderlayCleanup(id);

  // Once the project body is gone, all metadata is repairable. Quota/security
  // errors while pruning backups or hints must not report a false deletion
  // failure to the caller.
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    // Best effort.
  }
  let remaining: StoredProjectSummary[] = [];
  try {
    remaining = readIndex().filter((entry) => entry.id !== id);
    writeIndex(remaining);
  } catch {
    // Best effort.
  }
  try {
    if (localStorage.getItem(ACTIVE_PROJECT_KEY) === id) {
      if (remaining[0]) localStorage.setItem(ACTIVE_PROJECT_KEY, remaining[0].id);
      else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  } catch {
    // listLocalProjects/loadProjectFromLocal can repair this hint later.
  }
  return true;
}

export function duplicateLocalProject(id: string, name?: string): Project | null {
  const source = loadProjectById(id);
  if (!source) return null;
  const activeId = getActiveProjectId();
  const now = new Date().toISOString();
  const duplicate: Project = {
    ...source,
    id: makeId('project'),
    name: name?.trim() || `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
    settings: { ...source.settings },
    layers: source.layers.map((layer) => ({ ...layer })),
    entities: structuredClone(source.entities),
  };
  const saved = saveProjectToLocal(duplicate);
  setActiveProjectId(activeId);
  return saved ? duplicate : null;
}

export function renameLocalProject(id: string, name: string): Project | null {
  const project = loadProjectById(id);
  const trimmed = name.trim();
  if (!project || trimmed.length === 0) return null;
  const activeId = getActiveProjectId();
  const renamed = { ...project, name: trimmed, updatedAt: new Date().toISOString() };
  const saved = saveProjectToLocal(renamed);
  setActiveProjectId(activeId);
  return saved ? renamed : null;
}

export function listProjectBackups(projectId: string): ProjectBackupSummary[] {
  migrateLegacyProject();
  return readBackups(projectId).map((backup) => {
    const result = decodeProject(backup.projectJson);
    if (!result.ok) {
      return {
        id: backup.id,
        savedAt: backup.savedAt,
        projectUpdatedAt: backup.savedAt,
        name: 'Unreadable backup',
        entityCount: 0,
        discardedItemCount: 0,
        discardedReasons: [],
        decodeFailureReason: result.reason,
      };
    }
    return {
      id: backup.id,
      savedAt: backup.savedAt,
      projectUpdatedAt: result.project.updatedAt,
      name: result.project.name,
      entityCount: result.project.entities.length,
      discardedItemCount: result.discardedItemCount,
      discardedReasons: [...new Set(
        result.discardedItems.map((item) => item.reason),
      )],
    };
  });
}

/** Restore a snapshot while first backing up the project's current saved value. */
export function restoreProjectBackupResult(
  projectId: string,
  backupId: string,
): ProjectBackupRestoreResult {
  migrateLegacyProject();
  const backup = readBackups(projectId).find((entry) => entry.id === backupId);
  if (!backup) return { ok: false, reason: 'backup-not-found' };
  const decodeResult = decodeProject(backup.projectJson);
  if (!decodeResult.ok) {
    return { ok: false, reason: 'decode-failed', decodeResult };
  }
  if (decodeResult.project.id !== projectId) {
    return { ok: false, reason: 'project-id-mismatch' };
  }
  const restored = {
    ...decodeResult.project,
    updatedAt: new Date().toISOString(),
  };
  if (!saveProjectToLocal(restored)) return { ok: false, reason: 'save-failed' };
  return { ok: true, project: restored, decodeResult };
}

export function restoreProjectBackup(projectId: string, backupId: string): Project | null {
  const result = restoreProjectBackupResult(projectId, backupId);
  return result.ok ? result.project : null;
}

/** Compatibility helper: remove the currently active saved project. */
export function clearLocalProject(): void {
  if (!storageAvailable()) return;
  migrateLegacyProject();
  const activeId = getActiveProjectId();
  if (activeId) deleteLocalProject(activeId);
  else localStorage.removeItem(LEGACY_PROJECT_KEY);
}
