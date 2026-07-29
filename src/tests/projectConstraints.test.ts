import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createLinearEntity,
  createPolygonEntity,
} from '../app/projectFactory';
import {
  parseProjectPointKey,
  projectPointKey,
  sanitizeProjectConstraints,
  solveProjectConstraints,
} from '../app/projectConstraints';

describe('project constraints', () => {
  it('maps stable vertex references into an immutable solved project', () => {
    const entity = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: 8, y: 2 },
        { x: 8, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [],
    });
    const project = { ...createEmptyProject(), entities: [entity] };
    const a = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 0 });
    const b = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 1 });
    const result = solveProjectConstraints(
      project,
      [
        { id: 'horizontal', kind: 'horizontal', a, b },
        { id: 'length', kind: 'length', a, b, value: 10 },
      ],
      { fixed: [a] },
    );

    expect(result.ok).toBe(true);
    expect(project.entities[0]).toBe(entity);
    const solved = result.project.entities[0];
    expect(solved.type).toBe('polygon');
    if (solved.type === 'polygon') {
      expect(solved.geometry.outer[1]).toEqual(
        expect.objectContaining({ x: expect.closeTo(10, 5), y: expect.closeTo(0, 5) }),
      );
    }
  });

  it('round-trips entity IDs containing the key delimiter and rejects bad indices', () => {
    const outer = {
      entityId: 'imported|entity|42',
      ring: 'outer' as const,
      pointIndex: 3,
    };
    const hole = {
      entityId: 'imported|entity|42',
      ring: 'hole' as const,
      holeIndex: 2,
      pointIndex: 5,
    };
    expect(parseProjectPointKey(projectPointKey(outer))).toEqual(outer);
    expect(parseProjectPointKey(projectPointKey(hole))).toEqual(hole);
    expect(parseProjectPointKey('entity|outer|')).toBeNull();
    expect(parseProjectPointKey('entity|outer|9007199254740992')).toBeNull();
  });

  it('returns immediately for an empty constraint list without scanning entities', () => {
    const project = createEmptyProject();
    const inaccessibleEntities = new Proxy(project.entities, {
      get() {
        throw new Error('entities should not be inspected');
      },
    });

    expect(
      sanitizeProjectConstraints(
        { ...project, entities: inaccessibleEntities },
        [],
      ),
    ).toEqual([]);
  });

  it('validates point references on polyline and arc entities directly', () => {
    const polyline = createLinearEntity(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      'polyline',
    );
    const arc = createLinearEntity(
      [{ x: 0, y: 10 }, { x: 10, y: 10 }],
      'arc',
    );
    const project = {
      ...createEmptyProject(),
      entities: [polyline, arc],
    };
    const constraint = {
      id: 'parallel',
      kind: 'parallel' as const,
      a1: projectPointKey({
        entityId: polyline.id,
        ring: 'linear',
        pointIndex: 0,
      }),
      a2: projectPointKey({
        entityId: polyline.id,
        ring: 'linear',
        pointIndex: 1,
      }),
      b1: projectPointKey({
        entityId: arc.id,
        ring: 'linear',
        pointIndex: 0,
      }),
      b2: projectPointKey({
        entityId: arc.id,
        ring: 'linear',
        pointIndex: 1,
      }),
    };

    expect(sanitizeProjectConstraints(project, [constraint])).toEqual([
      constraint,
    ]);
  });
});
