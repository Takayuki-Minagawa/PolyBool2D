import { describe, expect, it } from 'vitest';
import { polygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import {
  chamferPolygon,
  chamferRing,
  filletPolygon,
  filletRing,
} from '../geometry/corner';

describe('chamferRing', () => {
  const square = rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 });

  it('chamfers only requested vertices', () => {
    const result = chamferRing(square, 2, { vertices: [1] });
    expect(result).not.toBeNull();
    expect(result).toHaveLength(5);
    expect(result).toContainEqual({ x: 8, y: 0 });
    expect(result).toContainEqual({ x: 10, y: 2 });
    expect(result).not.toContainEqual({ x: 10, y: 0 });
    expect(polygonArea({ outer: result!, holes: [] })).toBeCloseTo(98, 8);
  });

  it('chamfers all vertices by default', () => {
    const result = chamferRing(square, 2);
    expect(result).toHaveLength(8);
    expect(polygonArea({ outer: result!, holes: [] })).toBeCloseTo(92, 8);
  });
});

describe('filletRing', () => {
  const square = rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 });

  it('approximates a tangent circular arc at a selected vertex', () => {
    const result = filletRing(square, 2, {
      vertices: [1],
      segmentsPerQuarter: 32,
    });
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(square.length);
    expect(result).not.toContainEqual({ x: 10, y: 0 });
    // A 2x2 corner square is replaced by a quarter-circle of radius 2.
    expect(polygonArea({ outer: result!, holes: [] })).toBeCloseTo(
      100 - (4 - Math.PI),
      2,
    );
  });

  it('supports all polygon rings and clamps oversized radii', () => {
    const polygon = {
      outer: square,
      holes: [rectangleToRing({ x: 3, y: 3 }, { x: 7, y: 7 })],
    };
    const result = filletPolygon(polygon, 100, { segmentsPerQuarter: 2 });
    expect(result).not.toBeNull();
    expect(result!.outer.length).toBeGreaterThan(4);
    expect(result!.holes[0].length).toBeGreaterThan(4);
    expect(polygonArea(result!)).toBeGreaterThan(0);
  });
});

describe('corner input guards', () => {
  it('rejects negative/non-finite parameters and degenerate input', () => {
    const square = rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 });
    expect(chamferRing(square, -1)).toBeNull();
    expect(filletRing(square, Number.NaN)).toBeNull();
    expect(chamferRing(square.slice(0, 2), 1)).toBeNull();
  });

  it('can leave unspecified polygon rings unchanged', () => {
    const square = rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 });
    const result = chamferPolygon(
      { outer: square, holes: [] },
      1,
      { selection: { outer: [0] } },
    );
    expect(result?.outer).toHaveLength(5);
  });
});
