import { describe, expect, it } from 'vitest';
import { createPolygonEntity } from '../app/projectFactory';
import {
  createEntityGroup,
  expandGroupedSelection,
  removeEntitiesFromGroups,
  sanitizeGroups,
} from '../app/groups';
import {
  createEntityTemplate,
  instantiateEntityTemplate,
  readEntityTemplates,
  saveEntityTemplate,
} from '../persistence/templateLibrary';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('entity groups', () => {
  it('expands transitive grouped selection and removes collapsed groups', () => {
    const first = createEntityGroup(['a', 'b'], 'First')!;
    const second = createEntityGroup(['b', 'c'], 'Second')!;
    expect(new Set(expandGroupedSelection(['a'], [first, second]))).toEqual(
      new Set(['a', 'b', 'c']),
    );
    expect(removeEntitiesFromGroups([first, second], new Set(['b']))).toEqual([]);
  });

  it('sanitizes malformed persisted groups without suppressing later valid data', () => {
    const groups = sanitizeGroups([
      { id: 'same', name: 42, entityIds: null },
      {
        id: 'same',
        name: ' Valid ',
        entityIds: ['a', 'a', 'b', 12],
        locked: true,
      },
      { id: '', name: 'Empty id', entityIds: ['a', 'b'] },
    ], new Set(['a', 'b']));

    expect(groups).toEqual([{
      id: 'same',
      name: 'Valid',
      entityIds: ['a', 'b'],
      locked: true,
      visible: true,
    }]);
  });
});

describe('entity template library', () => {
  it('persists and instantiates templates with new IDs at a target', () => {
    const entity = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [],
    });
    const template = createEntityTemplate('Square', [entity])!;
    const storage = memoryStorage();
    expect(saveEntityTemplate(template, storage)).toBe(true);
    expect(readEntityTemplates(storage)).toHaveLength(1);

    const [instance] = instantiateEntityTemplate(template, { x: 100, y: 50 });
    expect(instance.id).not.toBe(entity.id);
    expect(instance.type).toBe('polygon');
    if (instance.type === 'polygon') {
      expect(instance.geometry.outer[0]).toEqual({ x: 95, y: 45 });
      expect(instance.geometry.outer[2]).toEqual({ x: 105, y: 55 });
    }
  });

  it('ignores corrupt stored entities and refuses overflowing instances', () => {
    const entity = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [],
    });
    const valid = createEntityTemplate('Valid', [entity])!;
    const corruptStorage = {
      getItem: () => JSON.stringify([
        {
          id: 'bad',
          name: 'Bad',
          createdAt: 'invalid',
          entities: [null],
        },
        valid,
      ]),
    };
    expect(readEntityTemplates(corruptStorage)).toEqual([
      expect.objectContaining({ id: valid.id, name: 'Valid' }),
    ]);

    const hugeEntity = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: Number.MAX_VALUE, y: 0 },
        { x: Number.MAX_VALUE, y: 1 },
        { x: 0, y: 1 },
      ],
      holes: [],
    });
    const huge = createEntityTemplate('Huge', [hugeEntity])!;
    expect(instantiateEntityTemplate(
      huge,
      { x: -Number.MAX_VALUE, y: 0 },
    )).toEqual([]);
  });
});
