import { describe, expect, it } from 'vitest';
import { convexHull } from '../geometry/convexHull';
import { ringIsCCW, signedRingArea } from '../geometry/area';

describe('convexHull', () => {
  it('returns null for fewer than 3 unique points', () => {
    expect(convexHull([])).toBeNull();
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it('returns null for collinear points', () => {
    expect(
      convexHull([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
  });

  it('hulls a square with an interior point', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior, should be excluded
    ]);
    expect(hull).not.toBeNull();
    expect(hull!.length).toBe(4);
    expect(ringIsCCW(hull!)).toBe(true);
    expect(Math.abs(signedRingArea(hull!))).toBeCloseTo(100);
  });

  it('drops duplicate points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ]);
    expect(hull).not.toBeNull();
    expect(hull!.length).toBe(3);
  });
});
