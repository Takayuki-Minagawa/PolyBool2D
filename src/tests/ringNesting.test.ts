import { describe, expect, it } from 'vitest';
import { rectangleToRing } from '../geometry/circle';
import { nestRingsAsPolygons } from '../geometry/ringNesting';

describe('ring nesting', () => {
  it('keeps edge- and corner-touching rings as separate polygons', () => {
    const base = rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 });
    const edgeTouching = rectangleToRing({ x: 10, y: 0 }, { x: 20, y: 10 });
    const cornerTouching = rectangleToRing({ x: 20, y: 10 }, { x: 30, y: 20 });

    const result = nestRingsAsPolygons([base, edgeTouching, cornerTouching]);

    expect(result).toHaveLength(3);
    expect(result.every((polygon) => polygon.holes.length === 0)).toBe(true);
  });

  it('does not treat partially overlapping rings as holes', () => {
    const base = rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 });
    const overlap = rectangleToRing({ x: 5, y: 5 }, { x: 15, y: 15 });

    const result = nestRingsAsPolygons([base, overlap]);

    expect(result).toHaveLength(2);
    expect(result.every((polygon) => polygon.holes.length === 0)).toBe(true);
  });

  it('still reconstructs strictly contained rings as holes', () => {
    const outer = rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 });
    const hole = rectangleToRing({ x: 5, y: 5 }, { x: 15, y: 15 });

    const result = nestRingsAsPolygons([outer, hole]);

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
  });
});
