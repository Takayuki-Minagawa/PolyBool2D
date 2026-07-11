import { describe, expect, it } from 'vitest';
import { knifeSplitPolygon } from '../geometry/knifeSplit';
import { polygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';

describe('knifeSplitPolygon', () => {
  it('splits a 1000×1000 square along the diagonal into two triangles', () => {
    const poly = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 }),
      holes: [],
    };
    const total = polygonArea(poly);
    const r = knifeSplitPolygon(
      poly,
      { x: -10, y: -10 },
      { x: 1010, y: 1010 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.polygons.length).toBe(2);
      const sum = r.polygons.reduce((a, p) => a + polygonArea(p), 0);
      expect(sum).toBeCloseTo(total, 4);
      for (const p of r.polygons) {
        expect(polygonArea(p)).toBeCloseTo(total / 2, 4);
      }
    }
  });

  it('splits a square through the middle vertically', () => {
    const poly = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 }),
      holes: [],
    };
    const r = knifeSplitPolygon(poly, { x: 500, y: -10 }, { x: 500, y: 1010 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.polygons.length).toBe(2);
      for (const p of r.polygons) {
        expect(polygonArea(p)).toBeCloseTo(500_000, 4);
      }
    }
  });

  it('refuses to split when the line does not cross', () => {
    const poly = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 }),
      holes: [],
    };
    const r = knifeSplitPolygon(poly, { x: -100, y: 500 }, { x: -50, y: 500 });
    expect(r.ok).toBe(false);
  });

  it('refuses to split with single intersection', () => {
    const poly = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 }),
      holes: [],
    };
    const r = knifeSplitPolygon(poly, { x: 500, y: 500 }, { x: 1500, y: 500 });
    expect(r.ok).toBe(false);
  });

  it('splits a concave polygon across four boundary intersections', () => {
    const poly = {
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
      holes: [],
    };
    const before = polygonArea(poly);
    const r = knifeSplitPolygon(poly, { x: -1, y: 5 }, { x: 11, y: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.polygons).toHaveLength(3);
      expect(r.polygons.reduce((sum, piece) => sum + polygonArea(piece), 0)).toBeCloseTo(
        before,
        8,
      );
    }
  });

  it('splits a polygon with a hole and preserves material area', () => {
    const poly = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [rectangleToRing({ x: 3, y: 3 }, { x: 7, y: 7 })],
    };
    const before = polygonArea(poly);
    const r = knifeSplitPolygon(poly, { x: -1, y: 5 }, { x: 11, y: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.polygons.length).toBeGreaterThanOrEqual(2);
      expect(r.polygons.reduce((sum, piece) => sum + polygonArea(piece), 0)).toBeCloseTo(
        before,
        8,
      );
      expect(r.polygons.every((piece) => piece.holes.length === 0)).toBe(true);
    }
  });

  it('refuses a finite stroke that only crosses a hole boundary', () => {
    const poly = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [rectangleToRing({ x: 3, y: 3 }, { x: 7, y: 7 })],
    };

    const r = knifeSplitPolygon(poly, { x: 2, y: 5 }, { x: 8, y: 5 });

    expect(r).toEqual({ ok: false, reason: 'not-two-intersections' });
  });

  it('refuses to extend a partial finite stroke across a remote concave arm', () => {
    const poly = {
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
      holes: [],
    };

    const r = knifeSplitPolygon(poly, { x: -1, y: 5 }, { x: 4, y: 5 });

    expect(r).toEqual({ ok: false, reason: 'not-two-intersections' });
  });
});
