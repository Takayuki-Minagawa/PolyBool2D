import { describe, expect, it } from 'vitest';
import { polygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import { nestRingsAsPolygons } from '../geometry/ringNesting';

function regularRing(radius: number, vertexCount: number) {
  return Array.from({ length: vertexCount }, (_, index) => {
    const angle = (index / vertexCount) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

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

  it('rejects a ring that exits through concave outer vertices', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 7, y: 10 },
      { x: 7, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 10 },
      { x: 0, y: 10 },
    ];
    const straddling = [
      { x: 5, y: 0.5 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
      { x: 7, y: 4 },
      { x: 7, y: 3 },
    ];

    const result = nestRingsAsPolygons([outer, straddling]);

    expect(result).toHaveLength(2);
    expect(result.every((polygon) => polygon.holes.length === 0)).toBe(true);
  });

  it.each([
    {
      name: 'strictly contained',
      hole: rectangleToRing({ x: 30, y: 30 }, { x: 70, y: 70 }),
    },
    {
      name: 'flush edge touching',
      hole: rectangleToRing({ x: 0, y: 30 }, { x: 40, y: 70 }),
    },
    {
      name: 'single vertex touching',
      hole: [
        { x: 0, y: 50 },
        { x: 20 * Math.SQRT2, y: 50 - 20 * Math.SQRT2 },
        { x: 40 * Math.SQRT2, y: 50 },
        { x: 20 * Math.SQRT2, y: 50 + 20 * Math.SQRT2 },
      ],
    },
  ])('reconstructs a $name 40x40 pocket as a hole', ({ hole }) => {
    const outer = rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 });

    const result = nestRingsAsPolygons([outer, hole]);

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(polygonArea(result[0])).toBeCloseTo(8_400, 6);
  });

  it('keeps coincident equal-area rings as sibling holes of a larger ring', () => {
    const outer = rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 });
    const hole = rectangleToRing({ x: 20, y: 20 }, { x: 80, y: 80 });
    const rotated = [...hole.slice(1), hole[0]];
    const reversed = [...hole].reverse();

    const result = nestRingsAsPolygons([outer, hole, rotated, reversed]);

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(3);
  });

  it(
    'handles large nested rings without quadratic vertex and edge comparisons',
    () => {
      const outer = regularRing(100, 10_000);
      const hole = regularRing(50, 10_000);

      const result = nestRingsAsPolygons([outer, hole]);

      expect(result).toHaveLength(1);
      expect(result[0].holes).toHaveLength(1);
      expect(result[0].holes[0]).toHaveLength(10_000);
    },
    5_000,
  );

  it(
    'finds direct parents in a deeply concentric ring chain',
    () => {
      const ringCount = 8_000;
      const rings = Array.from({ length: ringCount }, (_, index) => {
        const radius = ringCount - index;
        return rectangleToRing(
          { x: -radius, y: -radius },
          { x: radius, y: radius },
        );
      });
      const startedAt = performance.now();

      const result = nestRingsAsPolygons(rings);

      expect(performance.now() - startedAt).toBeLessThan(1_500);
      expect(result).toHaveLength(ringCount / 2);
      expect(result.every((polygon) => polygon.holes.length === 1)).toBe(true);
    },
    5_000,
  );

  it(
    'handles 8,000 duplicate rings beneath one outer without an equal-area scan',
    () => {
      const ringCount = 8_000;
      const outer = rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 });
      const duplicate = rectangleToRing({ x: 20, y: 20 }, { x: 80, y: 80 });
      const duplicates = Array.from({ length: ringCount }, () =>
        duplicate.map((point) => ({ ...point })),
      );
      const startedAt = performance.now();

      const result = nestRingsAsPolygons([outer, ...duplicates]);

      expect(performance.now() - startedAt).toBeLessThan(1_500);
      expect(result).toHaveLength(1);
      expect(result[0].holes).toHaveLength(ringCount);
    },
    5_000,
  );
});
