import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { rectangleToRing } from '../geometry/circle';

describe('DXF store import', () => {
  beforeEach(() => {
    useAppStore.getState().resetProject();
  });

  it('adds polygon and linear geometry in one undo transaction', () => {
    const imported = useAppStore.getState().importDrawingGeometries(
      [{ outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }), holes: [] }],
      [{
        points: [{ x: 20, y: 0 }, { x: 30, y: 5 }],
        kind: 'polyline',
      }],
    );

    expect(imported).toHaveLength(2);
    expect(useAppStore.getState().project.entities).toHaveLength(2);
    expect(useAppStore.getState().history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities).toHaveLength(0);
  });
});
