import { describe, expect, it } from 'vitest';
import {
  nearestEdgePoint,
  nearestVertex,
  snapToGrid,
} from '../geometry/snap';
import {
  translatePolygon,
  translationBetween,
} from '../geometry/translate';

describe('geometry snap helpers directly', () => {
  it('snaps to a grid and preserves points for a disabled grid', () => {
    expect(snapToGrid({ x: 2.4, y: -3.6 }, 1)).toEqual({ x: 2, y: -4 });
    const point = { x: 2.4, y: -3.6 };
    expect(snapToGrid(point, 0)).toBe(point);
  });

  it('finds nearest vertices and projected edge points', () => {
    expect(
      nearestVertex(
        { x: 2, y: 1 },
        [{ x: 0, y: 0 }, { x: 3, y: 1 }],
      ),
    ).toEqual({ point: { x: 3, y: 1 }, distance: 1 });

    const edge = nearestEdgePoint(
      { x: 7, y: 3 },
      [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }],
    );
    expect(edge?.point).toEqual({ x: 7, y: 0 });
    expect(edge?.midpoint).toEqual({ x: 5, y: 0 });
    expect(edge?.distance).toBe(3);
  });
});

describe('geometry translation helpers directly', () => {
  it('translates outer and hole rings without mutating the source', () => {
    const polygon = {
      outer: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      holes: [[
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ]],
    };
    const translated = translatePolygon(polygon, 10, -5);
    expect(translated.outer[0]).toEqual({ x: 10, y: -5 });
    expect(translated.holes[0][0]).toEqual({ x: 11, y: -4 });
    expect(polygon.outer[0]).toEqual({ x: 0, y: 0 });
  });

  it('computes the translation vector between two points', () => {
    expect(
      translationBetween({ x: -2, y: 4 }, { x: 3, y: -1 }),
    ).toEqual({ x: 5, y: -5 });
  });
});
