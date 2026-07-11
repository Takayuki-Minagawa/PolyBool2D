import { describe, expect, it } from 'vitest';
import {
  minimumAreaBoundingRectangle,
  minimumAreaBoundingRectangleForPolygon,
} from '../geometry/minimumBoundingRectangle';
import type { Point } from '../geometry/types';

function rotate(point: Point, angle: number): Point {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

describe('minimumAreaBoundingRectangle', () => {
  it('finds the dimensions and angle of a rotated rectangle', () => {
    const angle = Math.PI / 6;
    const points = [
      { x: -5, y: -2 },
      { x: 5, y: -2 },
      { x: 5, y: 2 },
      { x: -5, y: 2 },
      { x: 0, y: 0 },
    ].map((point) => rotate(point, angle));
    const rectangle = minimumAreaBoundingRectangle(points);
    expect(rectangle).not.toBeNull();
    expect(rectangle!.width).toBeCloseTo(10, 8);
    expect(rectangle!.height).toBeCloseTo(4, 8);
    expect(rectangle!.area).toBeCloseTo(40, 8);
    expect(rectangle!.angleRad).toBeCloseTo(angle, 8);
    expect(rectangle!.center.x).toBeCloseTo(0, 8);
    expect(rectangle!.center.y).toBeCloseTo(0, 8);
    expect(rectangle!.corners).toHaveLength(4);
  });

  it('uses only the outer ring for a polygon', () => {
    const polygon = {
      outer: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 3 },
        { x: 0, y: 3 },
      ],
      holes: [[
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ]],
    };
    expect(minimumAreaBoundingRectangleForPolygon(polygon)?.area).toBeCloseTo(24);
  });

  it('returns null for collinear or non-finite points', () => {
    expect(
      minimumAreaBoundingRectangle([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
    expect(
      minimumAreaBoundingRectangle([
        { x: 0, y: 0 },
        { x: Infinity, y: 1 },
        { x: 2, y: 0 },
      ]),
    ).toBeNull();
  });
});
