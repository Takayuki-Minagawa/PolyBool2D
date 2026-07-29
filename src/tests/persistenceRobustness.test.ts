import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { APP_VERSION } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';
import {
  decodeProject,
  deserializeProject,
  serializeProject,
} from '../persistence/projectCodec';
import {
  deleteLocalProject,
  loadProjectById,
  saveProjectToLocal,
} from '../persistence/localProjectStore';

describe('reasoned project decoding and migrations', () => {
  it('reports stable failure reasons while preserving the nullable API', () => {
    expect(decodeProject('{')).toEqual({ ok: false, reason: 'invalid-json' });
    expect(decodeProject('[]')).toEqual({ ok: false, reason: 'invalid-root' });
    expect(decodeProject('{}')).toEqual({ ok: false, reason: 'missing-version' });
    expect(decodeProject('{"version":"999.0.0"}')).toEqual({
      ok: false,
      reason: 'unsupported-version',
      version: '999.0.0',
    });
    expect(deserializeProject('{')).toBeNull();
  });

  it('runs the 0.1 migration chain and reports discarded entities', () => {
    const project = createEmptyProject();
    project.entities = [createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 2, y: 2 }),
      holes: [],
    })];
    const legacy = JSON.parse(serializeProject(project));
    legacy.version = '0.1.0';
    delete legacy.settings.angleSnapEnabled;
    delete legacy.settings.angleSnapIncrementDeg;
    legacy.entities.push({ type: 'polygon', id: 'broken' });

    const decoded = decodeProject(JSON.stringify(legacy));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.version).toBe(APP_VERSION);
    expect(decoded.project.settings.angleSnapEnabled).toBe(false);
    expect(decoded.migrations).toEqual([
      { fromVersion: '0.1.0', toVersion: '0.2.0' },
      ...(APP_VERSION === '0.2.0'
        ? []
        : [{ fromVersion: '0.2.0', toVersion: APP_VERSION }]),
    ]);
    expect(decoded.discardedEntityCount).toBe(1);
  });
});

describe('best-effort local project deletion', () => {
  beforeEach(() => localStorage.clear());

  it('reports success when the body was deleted but the index update fails', () => {
    const project = createEmptyProject();
    expect(saveProjectToLocal(project)).toBe(true);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (String(key) === 'pb2d.projects.index') throw new DOMException('Quota exceeded');
      return nativeSetItem.call(this, key, value);
    });

    try {
      expect(deleteLocalProject(project.id)).toBe(true);
    } finally {
      setItem.mockRestore();
    }
    expect(loadProjectById(project.id)).toBeNull();
  });
});
