import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { rectangleToRing } from '../geometry/circle';

describe('store import validation', () => {
  beforeEach(() => {
    useAppStore.getState().resetProject();
  });

  it('imports valid polygons from a mixed batch and reports the rejected shape', () => {
    const imported = useAppStore.getState().importDrawingGeometries(
      [
        {
          outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
          holes: [],
        },
        {
          outer: [
            { x: 20, y: 0 },
            { x: 30, y: 10 },
            { x: 20, y: 10 },
            { x: 30, y: 0 },
          ],
          holes: [],
        },
      ],
      [],
    );

    expect(imported).toHaveLength(1);
    expect(useAppStore.getState().project.entities).toHaveLength(1);
    expect(useAppStore.getState().history.past).toHaveLength(1);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      'errors.validation.self-intersection',
    );

    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities).toHaveLength(0);
  });

  it('reports invalid line records while retaining valid imported geometry', () => {
    const imported = useAppStore.getState().importDrawingGeometries(
      [{
        outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
        holes: [],
      }],
      [{
        points: [{ x: 20, y: 20 }, { x: 20, y: 20 }],
        kind: 'polyline',
      }],
    );

    expect(imported).toHaveLength(1);
    expect(useAppStore.getState().ui.errorMessage).toBe(
      'errors.invalidImportedLine',
    );
  });
});
