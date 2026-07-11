import { describe, expect, it } from 'vitest';
import { signedRingArea } from '../geometry/area';
import {
  angleAtPoint,
  arcToPolyline,
  ellipseToRing,
  polylineLength,
} from '../geometry/primitives';

describe('ellipseToRing', () => {
  it('creates a counter-clockwise ring with the requested resolution', () => {
    const ring = ellipseToRing({ x: 2, y: 3 }, 4, 2, 32);
    expect(ring).toHaveLength(32);
    expect(ring[0].x).toBeCloseTo(6);
    expect(ring[0].y).toBeCloseTo(3);
    expect(signedRingArea(ring)).toBeGreaterThan(0);
    expect(Math.abs(signedRingArea(ring))).toBeCloseTo(Math.PI * 8, 0);
  });

  it('rejects non-positive radii', () => {
    expect(ellipseToRing({ x: 0, y: 0 }, 0, 2)).toEqual([]);
  });
});

describe('arc and measurement helpers', () => {
  it('samples the shortest circular arc including both endpoints', () => {
    const points = arcToPolyline(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      64,
    );
    expect(points.length).toBeGreaterThan(2);
    expect(points[0]).toEqual({ x: 10, y: 0 });
    expect(points.at(-1)?.x).toBeCloseTo(0);
    expect(points.at(-1)?.y).toBeCloseTo(10);
    for (const point of points) expect(Math.hypot(point.x, point.y)).toBeCloseTo(10);
  });

  it('computes angles and cumulative open-polyline length', () => {
    expect(
      angleAtPoint({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }),
    ).toBeCloseTo(Math.PI / 2);
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 4 }])).toBe(8);
  });
});
