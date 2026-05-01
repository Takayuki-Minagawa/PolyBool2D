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
});
