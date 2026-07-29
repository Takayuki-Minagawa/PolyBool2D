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

  it('flags overlapping holes', () => {
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
});
