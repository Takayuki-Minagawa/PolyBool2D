import { describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';

describe('appStore selection commands', () => {
  it('selects all polygon entities', () => {
    useAppStore.getState().resetProject();
    const first = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    const second = createPolygonEntity({
      outer: rectangleToRing({ x: 20, y: 20 }, { x: 30, y: 30 }),
      holes: [],
    });

    useAppStore.setState((s) => ({
      project: { ...s.project, entities: [first, second] },
    }));

    useAppStore.getState().selectAll();

    expect(useAppStore.getState().selectedEntityIds).toEqual([
      first.id,
      second.id,
    ]);
  });
});
