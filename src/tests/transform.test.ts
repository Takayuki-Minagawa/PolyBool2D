import { describe, expect, it } from 'vitest';
import { boundsForEntities, fitBoundsToView } from '../app/transform';
import { createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';

describe('view transforms', () => {
  it('computes bounds across polygon entities', () => {
    const a = createPolygonEntity({
      outer: rectangleToRing({ x: -10, y: -20 }, { x: 30, y: 40 }),
      holes: [],
    });
    const b = createPolygonEntity({
      outer: rectangleToRing({ x: 100, y: 50 }, { x: 120, y: 80 }),
      holes: [],
    });

    expect(boundsForEntities([a, b])).toEqual({
      minX: -10,
      minY: -20,
      maxX: 120,
      maxY: 80,
    });
  });

  it('fits world bounds into the viewport with y-up coordinates', () => {
    const view = fitBoundsToView(
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      200,
      100,
      0,
    );

    expect(view.scale).toBe(1);
    expect(view.offsetX).toBe(50);
    expect(view.offsetY).toBe(100);
  });
});
