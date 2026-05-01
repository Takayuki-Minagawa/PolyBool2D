import { describe, expect, it } from 'vitest';
import { polygonArea, signedRingArea } from '../geometry/area';
import { circleToRing, rectangleToRing } from '../geometry/circle';

describe('Shoelace area', () => {
  it('computes 1m² for a 1000mm × 1000mm rectangle', () => {
    const ring = rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 });
    const area = Math.abs(signedRingArea(ring));
    expect(area / 1_000_000).toBeCloseTo(1, 6);
  });

  it('keeps area accurate for large translated coordinates', () => {
    const base = 1_000_000_000_000;
    const ring = rectangleToRing(
      { x: base, y: base },
      { x: base + 1000, y: base + 1000 },
    );
    expect(Math.abs(signedRingArea(ring))).toBeCloseTo(1_000_000, 6);
  });

  it('computes 1m² for a 2000mm × 500mm rectangle', () => {
    const ring = rectangleToRing({ x: 0, y: 0 }, { x: 2000, y: 500 });
    const area = Math.abs(signedRingArea(ring));
    expect(area / 1_000_000).toBeCloseTo(1, 6);
  });

  it('subtracts holes for net polygon area', () => {
    const outer = rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 });
    const hole = rectangleToRing({ x: 250, y: 250 }, { x: 750, y: 750 });
    const area = polygonArea({ outer, holes: [hole] });
    expect(area / 1_000_000).toBeCloseTo(0.75, 6);
  });

  it('approximates πr² with circle ring (64 segments)', () => {
    const r = 1000;
    const ring = circleToRing({ x: 0, y: 0 }, r, 64);
    const area = Math.abs(signedRingArea(ring));
    const expected = Math.PI * r * r;
    expect(area).toBeGreaterThan(expected * 0.99);
    expect(area).toBeLessThan(expected * 1.01);
  });
});
