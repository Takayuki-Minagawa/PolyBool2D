import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../app/projectFactory';
import { serializeProject } from '../persistence/projectCodec';
import {
  deleteLocalProject,
  deleteProjectRecoverySnapshot,
  duplicateLocalProject,
  getProjectRecoverySourceJson,
  getProjectRecoverySnapshot,
  getActiveProjectId,
  listLocalProjects,
  listProjectBackups,
  loadProjectById,
  loadProjectByIdResult,
  loadProjectFromLocal,
  loadProjectFromLocalResult,
  MAX_PROJECT_BACKUPS,
  preserveProjectRecoverySource,
  renameLocalProject,
  restoreProjectBackup,
  restoreProjectBackupResult,
  restoreProjectRecoverySnapshot,
  saveProjectToLocal,
  setActiveProjectId,
} from '../persistence/localProjectStore';

function project(name: string, updatedAt: string) {
  const value = createEmptyProject();
  return { ...value, name, updatedAt };
}

describe('multi-project local storage', () => {
  beforeEach(() => localStorage.clear());

  it('saves, lists, loads and selects multiple projects', () => {
    const older = project('Older', '2026-01-01T00:00:00.000Z');
    const newer = project('Newer', '2026-02-01T00:00:00.000Z');

    expect(saveProjectToLocal(older)).toBe(true);
    expect(saveProjectToLocal(newer)).toBe(true);

    expect(listLocalProjects().map((entry) => entry.id)).toEqual([newer.id, older.id]);
    expect(loadProjectById(older.id)?.name).toBe('Older');
    expect(getActiveProjectId()).toBe(newer.id);
    expect(setActiveProjectId(older.id)).toBe(true);
    expect(loadProjectFromLocal()?.id).toBe(older.id);
  });

  it('keeps an unreadable project visible and deletable when the index is missing', () => {
    const id = 'fatal-project';
    const key = `pb2d.project.${encodeURIComponent(id)}`;
    localStorage.setItem(key, '{broken-json');
    localStorage.setItem('pb2d.projects.index', '{broken-index');

    expect(listLocalProjects()).toEqual([
      expect.objectContaining({
        id,
        name: `Unreadable project (${id})`,
      }),
    ]);
    expect(loadProjectById(id)).toBeNull();
    expect(deleteLocalProject(id)).toBe(true);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('rejects a storage-key/body project ID mismatch without exposing the foreign body', () => {
    const healthy = project('Healthy B', '2026-02-01T00:00:00.000Z');
    expect(saveProjectToLocal(healthy)).toBe(true);
    const storageId = 'project-a';
    localStorage.setItem(
      `pb2d.project.${encodeURIComponent(storageId)}`,
      serializeProject(healthy),
    );
    expect(setActiveProjectId(storageId)).toBe(true);

    expect(loadProjectByIdResult(storageId)).toEqual({
      ok: false,
      reason: 'project-id-mismatch',
      version: healthy.version,
    });
    expect(loadProjectById(storageId)).toBeNull();
    expect(loadProjectFromLocalResult()).toEqual({
      id: storageId,
      decodeResult: {
        ok: false,
        reason: 'project-id-mismatch',
        version: healthy.version,
      },
    });
    expect(listLocalProjects()).toContainEqual(
      expect.objectContaining({
        id: storageId,
        name: `Unreadable project (${storageId})`,
      }),
    );
    expect(loadProjectById(healthy.id)?.name).toBe('Healthy B');
  });

  it('migrates the legacy singleton key exactly once', () => {
    const legacy = project('Legacy', '2026-01-01T00:00:00.000Z');
    localStorage.setItem('pb2d.project', serializeProject(legacy));

    expect(loadProjectFromLocal()?.id).toBe(legacy.id);
    expect(localStorage.getItem('pb2d.project')).toBeNull();
    expect(localStorage.getItem(`pb2d.project.${encodeURIComponent(legacy.id)}`)).not.toBeNull();

    const lateLegacy = project('Late legacy', '2026-03-01T00:00:00.000Z');
    localStorage.setItem('pb2d.project', serializeProject(lateLegacy));
    expect(listLocalProjects().map((entry) => entry.id)).toEqual([legacy.id]);
  });

  it('duplicates, renames and deletes projects without sharing nested data', () => {
    const original = project('Plan', '2026-01-01T00:00:00.000Z');
    original.layers[0].name = 'Original layer';
    saveProjectToLocal(original);

    const duplicate = duplicateLocalProject(original.id, 'Plan B');
    expect(duplicate).not.toBeNull();
    expect(duplicate!.id).not.toBe(original.id);
    expect(getActiveProjectId()).toBe(original.id);
    duplicate!.layers[0].name = 'Changed in memory';
    expect(loadProjectById(original.id)?.layers[0].name).toBe('Original layer');

    const renamed = renameLocalProject(original.id, 'Renamed');
    expect(renamed?.name).toBe('Renamed');
    expect(loadProjectById(original.id)?.name).toBe('Renamed');

    expect(deleteLocalProject(duplicate!.id)).toBe(true);
    expect(loadProjectById(duplicate!.id)).toBeNull();
    expect(listLocalProjects()).toHaveLength(1);
  });
});

describe('local project backups', () => {
  beforeEach(() => localStorage.clear());

  it('keeps at most ten distinct previous saves and can restore one', () => {
    let value = project('v0', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(value)).toBe(true);
    for (let i = 1; i <= 12; i += 1) {
      value = {
        ...value,
        name: `v${i}`,
        updatedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      };
      expect(saveProjectToLocal(value)).toBe(true);
    }

    const backups = listProjectBackups(value.id);
    expect(backups).toHaveLength(MAX_PROJECT_BACKUPS);
    expect(backups[0].name).toBe('v11');
    expect(backups.at(-1)?.name).toBe('v2');

    const restored = restoreProjectBackup(value.id, backups.at(-1)!.id);
    expect(restored?.name).toBe('v2');
    expect(loadProjectById(value.id)?.name).toBe('v2');
    expect(listProjectBackups(value.id)).toHaveLength(MAX_PROJECT_BACKUPS);
  });

  it('does not create a backup when serialized content did not change', () => {
    const value = project('Same', '2026-01-01T00:00:00.000Z');
    saveProjectToLocal(value);
    saveProjectToLocal(value);
    expect(listProjectBackups(value.id)).toEqual([]);
  });

  it('lists and reports recovery diagnostics for a damaged backup', () => {
    const value = project('Current', '2026-01-02T00:00:00.000Z');
    expect(saveProjectToLocal(value)).toBe(true);
    const raw = JSON.parse(serializeProject(value));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    localStorage.setItem(
      `pb2d.backups.${encodeURIComponent(value.id)}`,
      JSON.stringify([{
        id: 'damaged-backup',
        savedAt: '2026-01-03T00:00:00.000Z',
        projectJson: JSON.stringify(raw),
      }]),
    );

    expect(listProjectBackups(value.id)).toEqual([
      expect.objectContaining({
        id: 'damaged-backup',
        discardedItemCount: 1,
        discardedReasons: ['invalid-polygon'],
      }),
    ]);
    const restored = restoreProjectBackupResult(value.id, 'damaged-backup');
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.decodeResult.discardedItems).toEqual([
      { kind: 'entity', index: 0, reason: 'invalid-polygon' },
    ]);
  });

  it('preserves a recoverable source outside the ten-item ring across later saves', () => {
    const original = project('Damaged original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const raw = JSON.parse(serializeProject(original));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    const sourceJson = JSON.stringify(raw);
    const projectStorageKey =
      `pb2d.project.${encodeURIComponent(original.id)}`;
    const recoveryStorageKey =
      `pb2d.recovery.${encodeURIComponent(original.id)}`;
    localStorage.setItem(projectStorageKey, sourceJson);

    const loaded = loadProjectByIdResult(original.id);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) return;
    // The normalization-only autosave leaves the source in place and does
    // not need a second copy yet.
    expect(saveProjectToLocal(loaded.project)).toBe(true);
    expect(localStorage.getItem(recoveryStorageKey)).toBeNull();

    let edited = {
      ...loaded.project,
      name: 'Edited 0',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    expect(saveProjectToLocal(edited)).toBe(true);
    const preserved = JSON.parse(localStorage.getItem(recoveryStorageKey)!);
    expect(preserved.projectJson).toBe(sourceJson);

    for (let index = 1; index <= 12; index += 1) {
      edited = {
        ...edited,
        name: `Edited ${index}`,
        updatedAt: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      };
      expect(saveProjectToLocal(edited)).toBe(true);
    }

    expect(listProjectBackups(original.id)).toHaveLength(MAX_PROJECT_BACKUPS);
    expect(
      listProjectBackups(original.id).some(
        (backup) => backup.name === 'Damaged original',
      ),
    ).toBe(false);
    expect(
      JSON.parse(localStorage.getItem(recoveryStorageKey)!).projectJson,
    ).toBe(sourceJson);
    expect(getProjectRecoverySnapshot(original.id)).toEqual(
      expect.objectContaining({
        name: 'Damaged original',
        discardedItemCount: 1,
        discardedReasons: ['invalid-polygon'],
      }),
    );

    const restored = restoreProjectRecoverySnapshot(original.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.project.name).toBe('Damaged original');
    expect(restored.decodeResult.discardedItemCount).toBe(1);
    expect(getProjectRecoverySnapshot(original.id)).not.toBeNull();

    expect(deleteProjectRecoverySnapshot(original.id)).toBe(true);
    expect(getProjectRecoverySnapshot(original.id)).toBeNull();
  });

  it('preserves a normalized source even when no item was discarded', () => {
    const original = project('Extended source', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const raw = JSON.parse(serializeProject(original));
    raw.futureExtension = { mode: 'keep-exactly' };
    const sourceJson = JSON.stringify(raw);
    const projectStorageKey =
      `pb2d.project.${encodeURIComponent(original.id)}`;
    localStorage.setItem(projectStorageKey, sourceJson);

    const loaded = loadProjectByIdResult(original.id);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) return;
    expect(loaded.discardedItemCount).toBe(0);
    expect(loaded.sourceWasNormalized).toBe(true);

    expect(saveProjectToLocal(loaded.project)).toBe(true);
    expect(localStorage.getItem(projectStorageKey)).toBe(sourceJson);
    expect(getProjectRecoverySourceJson(original.id)).toBeNull();

    expect(saveProjectToLocal({
      ...loaded.project,
      name: 'Intentional edit',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })).toBe(true);
    expect(getProjectRecoverySourceJson(original.id)).toBe(sourceJson);
  });

  it('permanently preserves an unreadable current body before overwriting it', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const key = `pb2d.project.${encodeURIComponent(original.id)}`;
    const unreadable = '{"id":"truncated"';
    localStorage.setItem(key, unreadable);

    expect(saveProjectToLocal({
      ...original,
      name: 'Recovered work',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })).toBe(true);

    expect(getProjectRecoverySourceJson(original.id)).toBe(unreadable);
    expect(getProjectRecoverySnapshot(original.id)).toEqual(
      expect.objectContaining({
        sourceProjectId: original.id,
        decodeFailureReason: 'invalid-json',
      }),
    );
    expect(loadProjectById(original.id)?.name).toBe('Recovered work');
  });

  it('refuses an unreadable overwrite when exact permanent preservation fails', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const key = `pb2d.project.${encodeURIComponent(original.id)}`;
    const unreadable = '{broken-json';
    localStorage.setItem(key, unreadable);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, storageKey, value) {
        if (String(storageKey).startsWith('pb2d.recovery.')) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, storageKey, value);
      },
    );

    try {
      expect(saveProjectToLocal({
        ...original,
        name: 'Must not replace raw',
        updatedAt: '2026-02-01T00:00:00.000Z',
      })).toBe(false);
    } finally {
      setItem.mockRestore();
    }

    expect(localStorage.getItem(key)).toBe(unreadable);
    expect(getProjectRecoverySourceJson(original.id)).toBeNull();
  });

  it('does not claim a different recovery raw was preserved', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const damaged = JSON.parse(serializeProject(original));
    damaged.entities.push({ id: 'first-broken', type: 'polygon' });
    const firstSource = JSON.stringify(damaged);
    const secondSource = '{different-broken-source';
    expect(preserveProjectRecoverySource(original.id, firstSource)).toBe(true);
    expect(preserveProjectRecoverySource(original.id, secondSource)).toBe(false);

    const key = `pb2d.project.${encodeURIComponent(original.id)}`;
    localStorage.setItem(key, secondSource);
    expect(saveProjectToLocal({
      ...original,
      name: 'Blocked edit',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })).toBe(false);

    expect(localStorage.getItem(key)).toBe(secondSource);
    expect(getProjectRecoverySourceJson(original.id)).toBe(firstSource);
  });

  it('does not overwrite an unreadable recovery envelope', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    const key = `pb2d.recovery.${encodeURIComponent(original.id)}`;
    const unreadableEnvelope = '{"savedAt":"truncated"';
    localStorage.setItem(key, unreadableEnvelope);

    expect(
      preserveProjectRecoverySource(original.id, serializeProject(original)),
    ).toBe(false);
    expect(localStorage.getItem(key)).toBe(unreadableEnvelope);
  });

  it('exposes and discards a malformed recovery envelope to unblock saving', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const damaged = JSON.parse(serializeProject(original));
    damaged.entities.push({ id: 'broken', type: 'polygon' });
    const sourceJson = JSON.stringify(damaged);
    const projectStorageKey =
      `pb2d.project.${encodeURIComponent(original.id)}`;
    const recoveryStorageKey =
      `pb2d.recovery.${encodeURIComponent(original.id)}`;
    const malformedEnvelope = '{"savedAt":"truncated"';
    localStorage.setItem(projectStorageKey, sourceJson);
    localStorage.setItem(recoveryStorageKey, malformedEnvelope);

    expect(getProjectRecoverySnapshot(original.id)).toEqual(
      expect.objectContaining({
        malformedEnvelope: true,
        decodeFailureReason: 'invalid-json',
      }),
    );
    expect(getProjectRecoverySourceJson(original.id)).toBe(malformedEnvelope);
    const loaded = loadProjectByIdResult(original.id);
    if (!loaded?.ok) throw new Error('Expected recoverable project body');
    const edited = {
      ...loaded.project,
      name: 'Edited after recovery cleanup',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    expect(saveProjectToLocal(edited)).toBe(false);
    expect(localStorage.getItem(projectStorageKey)).toBe(sourceJson);

    expect(deleteProjectRecoverySnapshot(original.id)).toBe(true);
    expect(saveProjectToLocal(edited)).toBe(true);
    expect(getProjectRecoverySourceJson(original.id)).toBe(sourceJson);
  });

  it('refuses a backup restore when the current version cannot be retained', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const current = {
      ...original,
      name: 'Current work',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    expect(saveProjectToLocal(current)).toBe(true);
    const backup = listProjectBackups(original.id).find(
      (entry) => entry.name === 'Original',
    );
    expect(backup).toBeDefined();
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, storageKey, value) {
        if (String(storageKey).startsWith('pb2d.backups.')) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, storageKey, value);
      },
    );

    try {
      expect(restoreProjectBackupResult(original.id, backup!.id)).toEqual({
        ok: false,
        reason: 'save-failed',
      });
    } finally {
      setItem.mockRestore();
    }

    expect(loadProjectById(original.id)?.name).toBe('Current work');
  });

  it('refuses a recovery restore when the current version cannot be retained', () => {
    const current = project('Current work', '2026-02-01T00:00:00.000Z');
    expect(saveProjectToLocal(current)).toBe(true);
    const recoverySource = serializeProject({
      ...current,
      name: 'Older recovery',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(
      preserveProjectRecoverySource(current.id, recoverySource),
    ).toBe(true);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, storageKey, value) {
        if (String(storageKey).startsWith('pb2d.backups.')) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, storageKey, value);
      },
    );

    try {
      expect(restoreProjectRecoverySnapshot(current.id)).toEqual({
        ok: false,
        reason: 'save-failed',
      });
    } finally {
      setItem.mockRestore();
    }

    expect(loadProjectById(current.id)?.name).toBe('Current work');
    expect(getProjectRecoverySourceJson(current.id)).toBe(recoverySource);
  });

  it('protects a partially recoverable oldest backup before ring rotation', () => {
    const current = project('Current', '2026-02-01T00:00:00.000Z');
    expect(saveProjectToLocal(current)).toBe(true);
    const damaged = JSON.parse(serializeProject(current));
    damaged.name = 'Damaged oldest';
    damaged.entities.push({ id: 'broken-oldest', type: 'polygon' });
    const selectedSource = JSON.stringify(damaged);
    const selectedBackupId = 'selected-oldest';
    const backups = Array.from({ length: MAX_PROJECT_BACKUPS }, (_, index) => ({
      id: index === MAX_PROJECT_BACKUPS - 1
        ? selectedBackupId
        : `backup-${index}`,
      savedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      projectJson: index === MAX_PROJECT_BACKUPS - 1
        ? selectedSource
        : serializeProject({
            ...current,
            name: `Backup ${index}`,
            updatedAt:
              `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          }),
    }));
    localStorage.setItem(
      `pb2d.backups.${encodeURIComponent(current.id)}`,
      JSON.stringify(backups),
    );

    const restored = restoreProjectBackupResult(
      current.id,
      selectedBackupId,
    );

    expect(restored.ok).toBe(true);
    expect(getProjectRecoverySourceJson(current.id)).toBe(selectedSource);
    expect(
      listProjectBackups(current.id).some(
        (backup) => backup.id === selectedBackupId,
      ),
    ).toBe(false);
  });

  it('keeps the selected oldest backup when the restored body write fails', () => {
    const current = project('Current', '2026-02-01T00:00:00.000Z');
    expect(saveProjectToLocal(current)).toBe(true);
    const selectedBackupId = 'selected-oldest';
    const selectedSource = serializeProject({
      ...current,
      name: 'Selected oldest',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const backups = Array.from({ length: MAX_PROJECT_BACKUPS }, (_, index) => ({
      id: index === MAX_PROJECT_BACKUPS - 1
        ? selectedBackupId
        : `backup-${index}`,
      savedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      projectJson: index === MAX_PROJECT_BACKUPS - 1
        ? selectedSource
        : serializeProject({
            ...current,
            name: `Backup ${index}`,
            updatedAt:
              `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          }),
    }));
    const backupStorageKey =
      `pb2d.backups.${encodeURIComponent(current.id)}`;
    const projectStorageKey =
      `pb2d.project.${encodeURIComponent(current.id)}`;
    localStorage.setItem(backupStorageKey, JSON.stringify(backups));
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, storageKey, value) {
        if (String(storageKey) === projectStorageKey) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, storageKey, value);
      },
    );

    try {
      expect(
        restoreProjectBackupResult(current.id, selectedBackupId),
      ).toEqual({ ok: false, reason: 'save-failed' });
    } finally {
      setItem.mockRestore();
    }

    expect(loadProjectById(current.id)?.name).toBe('Current');
    expect(
      listProjectBackups(current.id).map((backup) => backup.id),
    ).toContain(selectedBackupId);
  });

  it('refuses partial backup restore when another recovery raw occupies the slot', () => {
    const current = project('Current', '2026-02-01T00:00:00.000Z');
    expect(saveProjectToLocal(current)).toBe(true);
    const first = JSON.parse(serializeProject(current));
    first.entities.push({ id: 'first-broken', type: 'polygon' });
    const firstSource = JSON.stringify(first);
    expect(preserveProjectRecoverySource(current.id, firstSource)).toBe(true);

    const selected = JSON.parse(serializeProject(current));
    selected.name = 'Other damaged backup';
    selected.entities.push({ id: 'second-broken', type: 'polygon' });
    const selectedSource = JSON.stringify(selected);
    const backupStorageKey =
      `pb2d.backups.${encodeURIComponent(current.id)}`;
    const backups = Array.from({ length: MAX_PROJECT_BACKUPS }, (_, index) => ({
      id: index === MAX_PROJECT_BACKUPS - 1
        ? 'other-damaged'
        : `healthy-${index}`,
      savedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      projectJson: index === MAX_PROJECT_BACKUPS - 1
        ? selectedSource
        : serializeProject({
            ...current,
            name: `Healthy ${index}`,
          }),
    }));
    const originalRingJson = JSON.stringify(backups);
    localStorage.setItem(backupStorageKey, originalRingJson);

    expect(restoreProjectBackupResult(current.id, 'other-damaged')).toEqual({
      ok: false,
      reason: 'save-failed',
    });
    expect(getProjectRecoverySourceJson(current.id)).toBe(firstSource);
    expect(localStorage.getItem(backupStorageKey)).toBe(originalRingJson);
    expect(
      listProjectBackups(current.id).map((backup) => backup.id),
    ).toContain('other-damaged');
    expect(loadProjectById(current.id)?.name).toBe('Current');
  });

  it('remaps a preserved shared source ID onto its local recovery target', () => {
    const target = project('Local target', '2026-02-01T00:00:00.000Z');
    const source = project('Shared damaged source', '2026-01-01T00:00:00.000Z');
    expect(source.id).not.toBe(target.id);
    expect(saveProjectToLocal(target)).toBe(true);
    const damaged = JSON.parse(serializeProject(source));
    damaged.entities.push({ id: 'shared-broken', type: 'polygon' });
    const sourceJson = JSON.stringify(damaged);

    expect(preserveProjectRecoverySource(target.id, sourceJson)).toBe(true);
    expect(getProjectRecoverySnapshot(target.id)).toEqual(
      expect.objectContaining({ sourceProjectId: source.id }),
    );
    expect(getProjectRecoverySourceJson(target.id)).toBe(sourceJson);

    const restored = restoreProjectRecoverySnapshot(target.id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.decodeResult.project.id).toBe(source.id);
    expect(restored.project.id).toBe(target.id);
    expect(restored.project.name).toBe('Shared damaged source');
    expect(loadProjectById(target.id)?.id).toBe(target.id);
    expect(getProjectRecoverySourceJson(target.id)).toBe(sourceJson);
  });

  it('removes the permanent recovery snapshot with its project', () => {
    const original = project('Damaged', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const raw = JSON.parse(serializeProject(original));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    const key = `pb2d.project.${encodeURIComponent(original.id)}`;
    localStorage.setItem(key, JSON.stringify(raw));
    const loaded = loadProjectByIdResult(original.id);
    if (!loaded?.ok) throw new Error('Expected recoverable fixture');
    expect(saveProjectToLocal({
      ...loaded.project,
      name: 'Edited',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })).toBe(true);
    expect(getProjectRecoverySnapshot(original.id)).not.toBeNull();

    expect(deleteLocalProject(original.id)).toBe(true);
    expect(getProjectRecoverySnapshot(original.id)).toBeNull();
  });

  it('refuses to overwrite a recoverable source when permanent preservation fails', () => {
    const original = project('Damaged', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const raw = JSON.parse(serializeProject(original));
    raw.entities.push({ id: 'broken', type: 'polygon' });
    const sourceJson = JSON.stringify(raw);
    const key = `pb2d.project.${encodeURIComponent(original.id)}`;
    localStorage.setItem(key, sourceJson);
    const loaded = loadProjectByIdResult(original.id);
    if (!loaded?.ok) throw new Error('Expected recoverable fixture');
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      function (this: Storage, storageKey, value) {
        if (String(storageKey).startsWith('pb2d.recovery.')) {
          throw new DOMException('Quota exceeded');
        }
        return nativeSetItem.call(this, storageKey, value);
      },
    );

    try {
      expect(saveProjectToLocal({
        ...loaded.project,
        name: 'Edited',
        updatedAt: '2026-02-01T00:00:00.000Z',
      })).toBe(false);
    } finally {
      setItem.mockRestore();
    }
    expect(localStorage.getItem(key)).toBe(sourceJson);
    expect(getProjectRecoverySnapshot(original.id)).toBeNull();
  });

  it('keeps saving current work when its safety backup cannot be saved', () => {
    const original = project('Original', '2026-01-01T00:00:00.000Z');
    expect(saveProjectToLocal(original)).toBe(true);
    const updated = { ...original, name: 'Updated', updatedAt: '2026-01-02T00:00:00.000Z' };
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (String(key).startsWith('pb2d.backups.')) throw new DOMException('Quota exceeded');
      return nativeSetItem.call(this, key, value);
    });

    try {
      expect(saveProjectToLocal(updated)).toBe(true);
    } finally {
      setItem.mockRestore();
    }
    expect(loadProjectById(original.id)?.name).toBe('Updated');
    expect(listProjectBackups(original.id)).toEqual([]);
  });

  it.each(['pb2d.projects.index', 'pb2d.projects.active'])(
    'does not report a body save failure when %s metadata cannot be updated',
    (failingKey) => {
      const original = project('Original', '2026-01-01T00:00:00.000Z');
      expect(saveProjectToLocal(original)).toBe(true);
      const updated = { ...original, name: 'Updated', updatedAt: '2026-01-02T00:00:00.000Z' };
      const nativeSetItem = Storage.prototype.setItem;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key,
        value,
      ) {
        if (String(key) === failingKey) throw new DOMException('Quota exceeded');
        return nativeSetItem.call(this, key, value);
      });

      try {
        expect(saveProjectToLocal(updated)).toBe(true);
      } finally {
        setItem.mockRestore();
      }
      expect(loadProjectById(original.id)?.name).toBe('Updated');
    },
  );
});
