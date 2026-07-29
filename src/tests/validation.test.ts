import { describe, expect, it } from 'vitest';
import { ringHasSelfIntersection, validatePolygon } from '../geometry/validation';
import { rectangleToRing } from '../geometry/circle';

describe('validation', () => {
  it('detects self intersection on a bowtie ring', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(ringHasSelfIntersection(ring)).toBe(true);
  });

  it('passes a clean rectangle', () => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    expect(r.valid).toBe(true);
  });

  it('flags too-few-points rings', () => {
    const r = validatePolygon({
      outer: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      holes: [],
    });
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('outer-too-few-points');
  });

  it('flags a hole outside the outer ring', () => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [rectangleToRing({ x: 12, y: 12 }, { x: 14, y: 14 })],
    });
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-outside-outer');
  });

  it.each([
    {
      name: 'shared edge',
      hole: rectangleToRing({ x: 0, y: 3 }, { x: 4, y: 7 }),
    },
    {
      name: 'single touching vertex',
      hole: [
        { x: 0, y: 5 },
        { x: 2, y: 3 },
        { x: 4, y: 5 },
        { x: 2, y: 7 },
      ],
    },
  ])('accepts a hole contained in the outer closure with a $name', ({ hole }) => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [hole],
    });

    expect(r).toEqual({ valid: true, issues: [] });
  });

  it('rejects a hole that exits through concave outer vertices', () => {
    const r = validatePolygon({
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 7, y: 10 },
        { x: 7, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [[
        { x: 5, y: 0.5 },
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 7, y: 4 },
        { x: 7, y: 3 },
      ]],
    });

    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-outside-outer');
  });

  it.each([
    {
      name: 'a shared edge',
      second: rectangleToRing({ x: 8, y: 2 }, { x: 14, y: 8 }),
    },
    {
      name: 'a shared edge with opposite winding',
      second: rectangleToRing({ x: 8, y: 2 }, { x: 14, y: 8 }).reverse(),
    },
    {
      name: 'a single touching point',
      second: rectangleToRing({ x: 8, y: 8 }, { x: 14, y: 14 }),
    },
  ])('accepts holes whose boundaries have only $name', ({ second }) => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [
        rectangleToRing({ x: 2, y: 2 }, { x: 8, y: 8 }),
        second,
      ],
    });

    expect(r).toEqual({ valid: true, issues: [] });
  });

  it('flags holes with true interior overlap', () => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [
        rectangleToRing({ x: 2, y: 2 }, { x: 10, y: 10 }),
        rectangleToRing({ x: 8, y: 8 }, { x: 14, y: 14 }),
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-overlap');
  });

  it("flags overlap when every crossing lands on one hole's vertices", () => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 }),
      holes: [
        rectangleToRing({ x: 10, y: 10 }, { x: 50, y: 50 }).reverse(),
        [
          { x: 50, y: 20 },
          { x: 60, y: 30 },
          { x: 50, y: 40 },
          { x: 40, y: 30 },
        ].reverse(),
      ],
    });

    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-overlap');
  });

  it("flags overlap when every crossing is a vertex of both holes", () => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 }),
      holes: [
        [
          { x: 10, y: 20 },
          { x: 40, y: 20 },
          { x: 60, y: 20 },
          { x: 90, y: 20 },
          { x: 90, y: 40 },
          { x: 60, y: 40 },
          { x: 40, y: 40 },
          { x: 10, y: 40 },
        ].reverse(),
        [
          { x: 40, y: 10 },
          { x: 60, y: 10 },
          { x: 60, y: 20 },
          { x: 60, y: 40 },
          { x: 60, y: 90 },
          { x: 40, y: 90 },
          { x: 40, y: 40 },
          { x: 40, y: 20 },
        ].reverse(),
      ],
    });

    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-overlap');
  });

  it.each([
    {
      name: 'matching winding',
      second: rectangleToRing({ x: 8, y: 2 }, { x: 14, y: 10 }),
    },
    {
      name: 'opposite winding',
      second: rectangleToRing({ x: 8, y: 2 }, { x: 14, y: 10 }).reverse(),
    },
  ])('flags aligned holes with collinear overlap and $name', ({ second }) => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [
        rectangleToRing({ x: 2, y: 2 }, { x: 10, y: 10 }),
        second,
      ],
    });

    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-overlap');
  });

  it.each([
    {
      name: 'matching winding',
      inner: rectangleToRing({ x: 4, y: 4 }, { x: 6, y: 6 }),
    },
    {
      name: 'opposite winding',
      inner: rectangleToRing({ x: 4, y: 4 }, { x: 6, y: 6 }).reverse(),
    },
  ])('flags a hole contained by another hole with $name', ({ inner }) => {
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [
        rectangleToRing({ x: 2, y: 2 }, { x: 12, y: 12 }),
        inner,
      ],
    });

    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-overlap');
  });

  it('flags identical holes with opposite winding', () => {
    const hole = rectangleToRing({ x: 2, y: 2 }, { x: 12, y: 12 });
    const r = validatePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [hole, [...hole].reverse()],
    });

    expect(r.valid).toBe(false);
    expect(r.issues).toContain('hole-overlap');
  });

  it.each([Number.NaN, Infinity, -Infinity])(
    'rejects a non-finite coordinate (%s)',
    (coordinate) => {
      const r = validatePolygon({
        outer: [
          { x: 0, y: 0 },
          { x: coordinate, y: 0 },
          { x: 0, y: 10 },
        ],
        holes: [],
      });

      expect(r.valid).toBe(false);
      expect(r.issues).toContain('zero-area');
    },
  );

  it('handles a large simple ring through the indexed broad phase', () => {
    const ring = Array.from({ length: 1024 }, (_, index) => {
      const angle = (index / 1024) * Math.PI * 2;
      return { x: Math.cos(angle) * 1000, y: Math.sin(angle) * 1000 };
    });
    expect(ringHasSelfIntersection(ring)).toBe(false);
  });

  it(
    'validates many disjoint holes through the ring bbox broad phase',
    () => {
      const holeCount = 1_500;
      const columns = Math.ceil(Math.sqrt(holeCount));
      const holes = Array.from({ length: holeCount }, (_, index) => {
        const x = (index % columns) * 3 + 1;
        const y = Math.floor(index / columns) * 3 + 1;
        return rectangleToRing({ x, y }, { x: x + 1, y: y + 1 });
      });
      const extent = columns * 3 + 2;
      const startedAt = performance.now();

      const result = validatePolygon({
        outer: rectangleToRing({ x: 0, y: 0 }, { x: extent, y: extent }),
        holes,
      });

      expect(performance.now() - startedAt).toBeLessThan(1_000);
      expect(result).toEqual({ valid: true, issues: [] });
    },
    5_000,
  );

  it(
    'validates two 4000-point tangent holes without a quadratic scan',
    () => {
      const circle = (centerX: number) =>
        Array.from({ length: 4_000 }, (_, index) => {
          const angle = (index / 4_000) * Math.PI * 2;
          return {
            x: centerX + Math.cos(angle),
            y: Math.sin(angle),
          };
        });
      const startedAt = performance.now();

      const result = validatePolygon({
        outer: rectangleToRing({ x: -3, y: -2 }, { x: 3, y: 2 }),
        holes: [circle(-1), circle(1)],
      });

      expect(performance.now() - startedAt).toBeLessThan(1_000);
      expect(result).toEqual({ valid: true, issues: [] });
    },
    5_000,
  );
});
