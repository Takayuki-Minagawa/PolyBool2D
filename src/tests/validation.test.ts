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
});
