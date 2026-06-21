import { describe, expect, it } from 'vitest';
import { simplifyPolyline, simplifyRing } from '../geometry/simplify';

describe('simplify', () => {
  it('removes near-collinear interior points from a polyline', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 },
      { x: 2, y: 0 },
      { x: 3, y: 0.01 },
      { x: 4, y: 0 },
    ];
    const simplified = simplifyPolyline(line, 0.1);
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('keeps points that exceed tolerance', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 2, y: 5 },
      { x: 4, y: 0 },
    ];
    const simplified = simplifyPolyline(line, 0.1);
    expect(simplified.length).toBe(3);
  });

  it('simplifies a ring with redundant collinear vertices', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 }, // collinear on bottom edge
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const simplified = simplifyRing(ring, 0.001);
    expect(simplified.length).toBe(4);
  });

  it('never drops a ring below 3 vertices', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(simplifyRing(triangle, 100).length).toBe(3);
  });
});
