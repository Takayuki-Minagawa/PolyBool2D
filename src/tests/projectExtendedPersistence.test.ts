import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createLinearEntity,
  createPolygonEntity,
} from '../app/projectFactory';
import { PROJECT_SCHEMA_VERSION } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';
import { decodeProject, serializeProject } from '../persistence/projectCodec';
import projectV01 from './fixtures/project-v0.1.json';
import projectV02 from './fixtures/project-v0.2.json';

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
      a: `${first.id}|outer|0`,
      b: `${first.id}|outer|1`,
      value: 25,
    }];

    const decoded = decodeProject(serializeProject(project));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.sourceWasNormalized).toBe(false);
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
    const decoded = decodeProject(JSON.stringify(projectV02));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(PROJECT_SCHEMA_VERSION).toBe('0.3.0');
    expect(decoded.project.version).toBe('0.3.0');
    expect(decoded.project.entities).toHaveLength(2);
    expect(decoded.project.entities.map((entity) => entity.type)).toEqual([
      'polygon',
      'guide-line',
    ]);
    const polygon = decoded.project.entities[0];
    expect(polygon.type === 'polygon' && polygon.geometry.holes).toHaveLength(1);
    expect(decoded.discardedItemCount).toBe(0);
    expect(decoded.project.groups).toEqual([]);
    expect(decoded.project.constraints).toEqual([]);
    expect(decoded.migrations).toEqual([
      { fromVersion: '0.2.0', toVersion: '0.3.0' },
    ]);
    expect(decoded.sourceWasNormalized).toBe(true);
  });

  it('migrates a realistic 0.1 golden project without losing entities', () => {
    const decoded = decodeProject(JSON.stringify(projectV01));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.version).toBe('0.3.0');
    expect(decoded.project.entities).toHaveLength(2);
    expect(decoded.project.entities.map((entity) => entity.name)).toEqual([
      'Legacy rectangle',
      'Legacy guide',
    ]);
    expect(decoded.project.settings.angleSnapEnabled).toBe(false);
    expect(decoded.project.settings.angleSnapIncrementDeg).toBe(15);
    expect(decoded.discardedItemCount).toBe(0);
    expect(decoded.migrations).toEqual([
      { fromVersion: '0.1.0', toVersion: '0.2.0' },
      { fromVersion: '0.2.0', toVersion: '0.3.0' },
    ]);
    expect(decoded.sourceWasNormalized).toBe(true);
  });

  it('reasonably discards groups and constraints that depend on a corrupt entity', () => {
    const project = createEmptyProject();
    const valid = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 2, y: 2 }),
      holes: [],
    });
    const secondValid = createPolygonEntity({
      outer: rectangleToRing({ x: 3, y: 0 }, { x: 5, y: 2 }),
      holes: [],
    });
    const raw = JSON.parse(serializeProject({
      ...project,
      entities: [valid, secondValid],
    }));
    delete raw.entities[0].name;
    raw.entities.push({
      id: 'broken-entity',
      type: 'polygon',
      name: 'Broken',
      layerId: 'layer-default',
    });
    raw.groups = [{
      id: 'dependent-group',
      entityIds: [valid.id, secondValid.id, 'broken-entity'],
      locked: false,
      visible: true,
    }];
    raw.constraints = [{
      id: 'dependent-constraint',
      kind: 'length',
      a: `${valid.id}|outer|0`,
      b: 'broken-entity|outer|0',
      value: 2,
    }];

    const decoded = decodeProject(JSON.stringify(raw));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.entities).toHaveLength(2);
    expect(decoded.project.entities[0].name).toBe('Polygon');
    expect(decoded.project.groups).toEqual([{
      id: 'dependent-group',
      name: 'Group',
      entityIds: [valid.id, secondValid.id],
      locked: false,
      visible: true,
    }]);
    expect(decoded.project.constraints).toEqual([]);
    expect(decoded.discardedItems).toEqual([
      { kind: 'entity', index: 2, reason: 'invalid-polygon' },
      { kind: 'group', index: 0, reason: 'missing-entity-reference' },
      { kind: 'constraint', index: 0, reason: 'missing-point-reference' },
    ]);
  });

  it('discards blank and duplicate entity IDs with stable reasons', () => {
    const project = createEmptyProject();
    const first = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 2, y: 2 }),
      holes: [],
    }, { name: 'First' });
    const duplicate = {
      ...createPolygonEntity({
        outer: rectangleToRing({ x: 3, y: 0 }, { x: 5, y: 2 }),
        holes: [],
      }, { name: 'Duplicate' }),
      id: first.id,
    };
    const blank = {
      ...createPolygonEntity({
        outer: rectangleToRing({ x: 6, y: 0 }, { x: 8, y: 2 }),
        holes: [],
      }, { name: 'Blank' }),
      id: '   ',
    };

    const decoded = decodeProject(serializeProject({
      ...project,
      entities: [first, duplicate, blank],
    }));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.entities).toEqual([first]);
    expect(decoded.discardedItems).toEqual([
      { kind: 'entity', index: 1, reason: 'duplicate-entity-id' },
      { kind: 'entity', index: 2, reason: 'invalid-entity-id' },
    ]);
  });

  it('reports defined non-array group and constraint collections as damage', () => {
    const raw = JSON.parse(serializeProject(createEmptyProject()));
    raw.groups = 'broken';
    raw.constraints = {};

    const decoded = decodeProject(JSON.stringify(raw));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.discardedItems).toEqual([
      { kind: 'group', index: -1, reason: 'invalid-group-collection' },
      {
        kind: 'constraint',
        index: -1,
        reason: 'invalid-constraint-collection',
      },
    ]);
  });

  it('lets a valid later group and constraint claim an ID rejected earlier', () => {
    const project = createEmptyProject();
    const first = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 2, y: 2 }),
      holes: [],
    });
    const second = createPolygonEntity({
      outer: rectangleToRing({ x: 3, y: 0 }, { x: 5, y: 2 }),
      holes: [],
    });
    const raw = JSON.parse(serializeProject({
      ...project,
      entities: [first, second],
    }));
    raw.groups = [
      {
        id: 'shared-group-id',
        name: 'Broken first',
        entityIds: [first.id, 'missing-entity'],
      },
      {
        id: 'shared-group-id',
        name: 'Valid second',
        entityIds: [first.id, second.id],
      },
    ];
    raw.constraints = [
      {
        id: 'shared-constraint-id',
        kind: 'length',
        a: `${first.id}|outer|0`,
        b: 'missing-entity|outer|0',
        value: 2,
      },
      {
        id: 'shared-constraint-id',
        kind: 'length',
        a: `${first.id}|outer|0`,
        b: `${first.id}|outer|1`,
        value: 2,
      },
    ];

    const decoded = decodeProject(JSON.stringify(raw));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.groups).toEqual([
      expect.objectContaining({
        id: 'shared-group-id',
        name: 'Valid second',
      }),
    ]);
    expect(decoded.project.constraints).toEqual([
      expect.objectContaining({ id: 'shared-constraint-id' }),
    ]);
    expect(decoded.discardedItems).toEqual([
      { kind: 'group', index: 0, reason: 'missing-entity-reference' },
      {
        kind: 'constraint',
        index: 0,
        reason: 'missing-point-reference',
      },
    ]);
  });

  it('diagnoses semantic normalization without flagging formatting or key order', () => {
    const canonical = JSON.parse(serializeProject(createEmptyProject()));
    const reordered = Object.fromEntries(
      Object.entries(canonical).reverse(),
    );
    const unchanged = decodeProject(JSON.stringify(reordered, null, 4));
    expect(unchanged.ok && unchanged.sourceWasNormalized).toBe(false);

    const withUnknownField = structuredClone(canonical);
    withUnknownField.futureExtension = { enabled: true };
    const unknownField = decodeProject(JSON.stringify(withUnknownField));
    expect(unknownField.ok && unknownField.sourceWasNormalized).toBe(true);

    const withClamp = structuredClone(canonical);
    withClamp.settings.gridSize = 2_000_000;
    const clamped = decodeProject(JSON.stringify(withClamp));
    expect(clamped.ok && clamped.sourceWasNormalized).toBe(true);

    const withDefault = structuredClone(canonical);
    delete withDefault.settings.snapToGrid;
    const defaulted = decodeProject(JSON.stringify(withDefault));
    expect(defaulted.ok && defaulted.sourceWasNormalized).toBe(true);

    const canonicalJson = serializeProject(createEmptyProject()).trimEnd();
    const deepUnknownValue =
      `${'{"next":'.repeat(5_000)}null${'}'.repeat(5_000)}`;
    const withDeepUnknownField =
      `${canonicalJson.slice(0, -1)},"futureDeep":${deepUnknownValue}}`;
    expect(() => decodeProject(withDeepUnknownField)).not.toThrow();
    const deeplyNormalized = decodeProject(withDeepUnknownField);
    expect(
      deeplyNormalized.ok && deeplyNormalized.sourceWasNormalized,
    ).toBe(true);
  });

  it('keeps missing legacy linear kinds but discards unknown future kinds', () => {
    const legacy = createLinearEntity(
      [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      'guide',
    );
    const raw = JSON.parse(serializeProject({
      ...createEmptyProject(),
      entities: [legacy],
    }));
    delete raw.entities[0].kind;

    const legacyDecoded = decodeProject(JSON.stringify(raw));
    expect(legacyDecoded.ok).toBe(true);
    if (!legacyDecoded.ok) return;
    expect(legacyDecoded.project.entities[0]).toMatchObject({ kind: 'guide' });

    raw.entities[0].kind = 'future-spline';
    const unknownDecoded = decodeProject(JSON.stringify(raw));
    expect(unknownDecoded.ok).toBe(true);
    if (!unknownDecoded.ok) return;
    expect(unknownDecoded.project.entities).toEqual([]);
    expect(unknownDecoded.discardedItems).toEqual([
      { kind: 'entity', index: 0, reason: 'invalid-linear-entity' },
    ]);
  });
});
