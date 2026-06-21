import { describe, expect, it } from 'vitest';
import {
  ringPerimeter,
  polygonPerimeter,
  ringBBox,
  polygonBBox,
  polygonCentroid,
} from '../geometry/measure';
import type { PolygonGeometry } from '../geometry/types';

const square: PolygonGeometry = {
  outer: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  holes: [],
};

describe('measure', () => {
  it('computes ring perimeter as a closed loop', () => {
    expect(ringPerimeter(square.outer)).toBeCloseTo(40);
  });

  it('returns 0 for degenerate rings', () => {
    expect(ringPerimeter([])).toBe(0);
    expect(ringPerimeter([{ x: 1, y: 1 }])).toBe(0);
  });

  it('adds hole boundaries to polygon perimeter', () => {
    const withHole: PolygonGeometry = {
      outer: square.outer,
      holes: [
        [
          { x: 2, y: 2 },
          { x: 4, y: 2 },
          { x: 4, y: 4 },
          { x: 2, y: 4 },
        ],
      ],
    };
    expect(polygonPerimeter(withHole)).toBeCloseTo(40 + 8);
  });

  it('computes bounding boxes', () => {
    expect(ringBBox(square.outer)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(polygonBBox(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(ringBBox([])).toBeNull();
  });

  it('computes centroid of a centered square', () => {
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(5);
  });

  it('shifts centroid away from a hole', () => {
    const withHole: PolygonGeometry = {
      outer: square.outer,
      holes: [
        [
          { x: 6, y: 6 },
          { x: 9, y: 6 },
          { x: 9, y: 9 },
          { x: 6, y: 9 },
        ],
      ],
    };
    const c = polygonCentroid(withHole);
    // Hole is in the upper-right quadrant, so centroid moves toward lower-left.
    expect(c.x).toBeLessThan(5);
    expect(c.y).toBeLessThan(5);
  });
});
