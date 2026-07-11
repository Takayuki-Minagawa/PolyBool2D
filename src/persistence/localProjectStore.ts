import { makeId } from '../app/idUtils';
import type { Project } from '../app/projectTypes';
import { deserializeProject, serializeProject } from './projectCodec';

const LEGACY_PROJECT_KEY = 'pb2d.project';
const PROJECT_KEY_PREFIX = 'pb2d.project.';
const BACKUP_KEY_PREFIX = 'pb2d.backups.';
const INDEX_KEY = 'pb2d.projects.index';
const ACTIVE_PROJECT_KEY = 'pb2d.projects.active';
const MIGRATION_KEY = 'pb2d.projects.migrated';
const STORAGE_INDEX_VERSION = 1;

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
  if (!deserializeProject(projectJson)) return true;
  const backups = readBackups(projectId);
  if (backups[0]?.projectJson === projectJson) return true;
  backups.unshift({
    id: makeId('backup'),
    savedAt: new Date().toISOString(),
    projectJson,
  });
  return writeBackups(projectId, backups);
}

/** Move the original single-project key into the indexed store at most once. */
function migrateLegacyProject(): void {
  if (!storageAvailable() || localStorage.getItem(MIGRATION_KEY) !== null) return;

  const legacyJson = localStorage.getItem(LEGACY_PROJECT_KEY);
  const legacyProject = legacyJson ? deserializeProject(legacyJson) : null;
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

function scanStoredProjects(): Project[] {
  if (!storageAvailable()) return [];
  const projects: Project[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PROJECT_KEY_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    const project = raw ? deserializeProject(raw) : null;
    if (project) projects.push(project);
  }
  return projects;
}

/** List locally saved projects, repairing a missing/stale index when possible. */
export function listLocalProjects(): StoredProjectSummary[] {
  if (!storageAvailable()) return [];
  migrateLegacyProject();

  const stored = scanStoredProjects();
  const summaries = stored.map(projectSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const indexed = readIndex();
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

export function loadProjectById(id: string): Project | null {
  if (!storageAvailable()) return null;
  migrateLegacyProject();
  const raw = localStorage.getItem(projectKey(id));
  return raw ? deserializeProject(raw) : null;
}

/** Load the last active project, falling back to the most recently updated one. */
export function loadProjectFromLocal(): Project | null {
  if (!storageAvailable()) return null;
  migrateLegacyProject();
  const activeId = getActiveProjectId();
  if (activeId) {
    const active = loadProjectById(activeId);
    if (active) return active;
  }
  const first = listLocalProjects()[0];
  if (!first) return null;
  setActiveProjectId(first.id);
  return loadProjectById(first.id);
}

/** Save a project and retain the previously saved value as a per-project backup. */
export function saveProjectToLocal(project: Project): boolean {
  if (!storageAvailable()) return false;
  migrateLegacyProject();
  const nextJson = serializeProject(project);
  const key = projectKey(project.id);
  const previousJson = localStorage.getItem(key);
  if (previousJson === nextJson) {
    setActiveProjectId(project.id);
    return upsertIndex(project);
  }

  const backupSaved = previousJson === null || retainPreviousVersion(project.id, previousJson);
  // Never replace the only current copy if the safety snapshot could not be
  // persisted (for example because localStorage has reached its quota).
  if (!backupSaved) return false;
  try {
    localStorage.setItem(key, nextJson);
  } catch {
    return false;
  }
  const indexSaved = upsertIndex(project);
  const activeSaved = setActiveProjectId(project.id);
  return indexSaved && activeSaved;
}

export function deleteLocalProject(id: string): boolean {
  if (!storageAvailable()) return false;
  migrateLegacyProject();
  try {
    localStorage.removeItem(projectKey(id));
    localStorage.removeItem(backupKey(id));
    const remaining = readIndex().filter((entry) => entry.id !== id);
    const indexSaved = writeIndex(remaining);
    if (localStorage.getItem(ACTIVE_PROJECT_KEY) === id) {
      if (remaining[0]) localStorage.setItem(ACTIVE_PROJECT_KEY, remaining[0].id);
      else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    return indexSaved;
  } catch {
    return false;
  }
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
  return readBackups(projectId).flatMap((backup) => {
    const project = deserializeProject(backup.projectJson);
    return project
      ? [{
          id: backup.id,
          savedAt: backup.savedAt,
          projectUpdatedAt: project.updatedAt,
          name: project.name,
          entityCount: project.entities.length,
        }]
      : [];
  });
}

/** Restore a snapshot while first backing up the project's current saved value. */
export function restoreProjectBackup(projectId: string, backupId: string): Project | null {
  migrateLegacyProject();
  const backup = readBackups(projectId).find((entry) => entry.id === backupId);
  const snapshot = backup ? deserializeProject(backup.projectJson) : null;
  if (!snapshot || snapshot.id !== projectId) return null;
  const restored = { ...snapshot, updatedAt: new Date().toISOString() };
  return saveProjectToLocal(restored) ? restored : null;
}

/** Compatibility helper: remove the currently active saved project. */
export function clearLocalProject(): void {
  if (!storageAvailable()) return;
  migrateLegacyProject();
  const activeId = getActiveProjectId();
  if (activeId) deleteLocalProject(activeId);
  else localStorage.removeItem(LEGACY_PROJECT_KEY);
}
