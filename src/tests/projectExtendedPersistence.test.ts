import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createPolygonEntity,
} from '../app/projectFactory';
import { APP_VERSION } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';
import { decodeProject, serializeProject } from '../persistence/projectCodec';

describe('extended project schema persistence', () => {
  it('round-trips safe groups/constraints and treats old files as empty', () => {
    const project = createEmptyProject();
    const first = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 2, y: 2 }),
      holes: [],
    });
    const second = createPolygonEntity({
      outer: rectangleToRing({ x: 3, y: 0 }, { x: 5, y: 2 }),
      holes: [],
    });
    project.entities = [first, second];
    project.groups = [{
      id: 'group-1',
      name: 'Pair',
      entityIds: [first.id, second.id],
      locked: true,
      visible: true,
    }];
    project.constraints = [{
      id: 'length-1',
      kind: 'length',
      a: `${first.id}:outer:0`,
      b: `${first.id}:outer:1`,
      value: 25,
    }];

    const decoded = decodeProject(serializeProject(project));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.groups).toEqual(project.groups);
    expect(decoded.project.constraints).toEqual(project.constraints);

    const old = JSON.parse(serializeProject(project));
    delete old.groups;
    delete old.constraints;
    const oldDecoded = decodeProject(JSON.stringify(old));
    expect(oldDecoded.ok && oldDecoded.project.groups).toEqual([]);
    expect(oldDecoded.ok && oldDecoded.project.constraints).toEqual([]);
  });

  it('migrates a 0.2 project through the explicit chain when required', () => {
    const raw = JSON.parse(serializeProject(createEmptyProject()));
    raw.version = '0.2.0';
    delete raw.groups;
    delete raw.constraints;

    const decoded = decodeProject(JSON.stringify(raw));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.version).toBe(APP_VERSION);
    expect(decoded.project.groups).toEqual([]);
    expect(decoded.project.constraints).toEqual([]);
    expect(decoded.migrations).toEqual(
      APP_VERSION === '0.2.0'
        ? []
        : [{ fromVersion: '0.2.0', toVersion: APP_VERSION }],
    );
  });
});
