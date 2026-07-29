import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../app/projectFactory';
import { serializeProject } from '../persistence/projectCodec';
import {
  deleteLocalProject,
  duplicateLocalProject,
  getActiveProjectId,
  listLocalProjects,
  listProjectBackups,
  loadProjectById,
  loadProjectFromLocal,
  MAX_PROJECT_BACKUPS,
  renameLocalProject,
  restoreProjectBackup,
  restoreProjectBackupResult,
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
