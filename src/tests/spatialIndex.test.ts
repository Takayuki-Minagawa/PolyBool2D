import { describe, expect, it } from 'vitest';
import {
  BBoxSpatialIndex,
  bboxContainsPoint,
  bboxesIntersect,
} from '../geometry/spatialIndex';

describe('BBoxSpatialIndex', () => {
  it('queries intersecting boxes and boundary points', () => {
    const index = new BBoxSpatialIndex<string>([
      { bbox: { minX: 0, minY: 0, maxX: 2, maxY: 2 }, value: 'a' },
      { bbox: { minX: 3, minY: 0, maxX: 5, maxY: 2 }, value: 'b' },
      { bbox: { minX: 1, minY: 1, maxX: 4, maxY: 4 }, value: 'c' },
    ], 1);
    expect(new Set(index.queryValues({ minX: 0, minY: 0, maxX: 2.5, maxY: 2.5 }))).toEqual(
      new Set(['a', 'c']),
    );
    expect(new Set(index.queryPoint({ x: 3, y: 1 }).map((item) => item.value))).toEqual(
      new Set(['b', 'c']),
    );
  });

  it('normalizes boxes and supports insert/update/remove', () => {
    const index = new BBoxSpatialIndex<string>();
    expect(
      index.insert({ bbox: { minX: 5, minY: 5, maxX: 1, maxY: 1 }, value: 'x' }),
    ).toBe(true);
    expect(index.queryPoint({ x: 2, y: 2 })).toHaveLength(1);
    expect(index.update('x', { minX: 10, minY: 10, maxX: 12, maxY: 12 })).toBe(true);
    expect(index.queryPoint({ x: 2, y: 2 })).toHaveLength(0);
    expect(index.queryPoint({ x: 11, y: 11 })).toHaveLength(1);
    expect(index.remove('x')).toBe(true);
    expect(index.size).toBe(0);
  });

  it('ignores non-finite boxes and exposes inclusive helpers', () => {
    const index = new BBoxSpatialIndex([
      { bbox: { minX: 0, minY: 0, maxX: Infinity, maxY: 1 }, value: 'bad' },
    ]);
    expect(index.size).toBe(0);
    expect(
      bboxesIntersect(
        { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        { minX: 1, minY: 1, maxX: 2, maxY: 2 },
      ),
    ).toBe(true);
    expect(
      bboxContainsPoint(
        { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        { x: 1, y: 1 },
      ),
    ).toBe(true);
  });
});
