import { describe, expect, it } from 'vitest';
import { defaultEngine } from '../geometry/geometryEngine';
import { rectangleToRing, circleToRing } from '../geometry/circle';
import { multiPolygonArea } from '../geometry/area';

describe('boolean operations', () => {
  it('unions two overlapping squares into one polygon', () => {
    const a = { outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 }), holes: [] };
    const b = { outer: rectangleToRing({ x: 50, y: 0 }, { x: 150, y: 100 }), holes: [] };
    const r = defaultEngine.union([a, b]);
    expect(r.length).toBe(1);
    const expected = 100 * 150;
    expect(multiPolygonArea(r)).toBeCloseTo(expected, 4);
  });

  it('subtracts a circle from a square (creates a hole)', () => {
    const square = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 }),
      holes: [],
    };
    const circle = { outer: circleToRing({ x: 500, y: 500 }, 200, 64), holes: [] };
    const r = defaultEngine.difference([square], [circle]);
    expect(r.length).toBe(1);
    const expected = 1000 * 1000 - Math.PI * 200 * 200;
    const got = multiPolygonArea(r);
    expect(got).toBeGreaterThan(expected * 0.99);
    expect(got).toBeLessThan(expected * 1.01);
    expect(r[0].holes.length).toBe(1);
  });

  it('returns empty when difference removes everything', () => {
    const inner = { outer: rectangleToRing({ x: 10, y: 10 }, { x: 90, y: 90 }), holes: [] };
    const big = { outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 }), holes: [] };
    const r = defaultEngine.difference([inner], [big]);
    expect(r.length).toBe(0);
  });
});
