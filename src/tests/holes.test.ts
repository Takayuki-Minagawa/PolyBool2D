import { describe, expect, it } from 'vitest';
import { signedRingArea } from '../geometry/area';
import { addHoleToPolygon, removeHoleFromPolygon } from '../geometry/holes';

const square = {
  outer: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ],
  holes: [],
};

describe('hole editing helpers', () => {
  it('adds an enclosed hole and normalises it clockwise', () => {
    const result = addHoleToPolygon(square, [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.geometry.holes).toHaveLength(1);
    expect(signedRingArea(result.geometry.holes[0])).toBeLessThan(0);
  });

  it('rejects a hole outside the outer ring', () => {
    const result = addHoleToPolygon(square, [
      { x: 15, y: 15 },
      { x: 25, y: 15 },
      { x: 25, y: 25 },
      { x: 15, y: 25 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain('hole-outside-outer');
  });

  it('removes a hole by index', () => {
    const withHole = addHoleToPolygon(square, [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ]);
    if (!withHole.ok) throw new Error('fixture setup failed');
    expect(removeHoleFromPolygon(withHole.geometry, 0)?.holes).toHaveLength(0);
    expect(removeHoleFromPolygon(withHole.geometry, 1)).toBeNull();
  });
});
