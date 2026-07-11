import { describe, expect, it } from 'vitest';
import { polygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import {
  chamferPolygon,
  chamferRing,
  filletPolygon,
  filletRing,
} from '../geometry/corner';
import { validatePolygon } from '../geometry/validation';
import type { Point, Ring } from '../geometry/types';

function closePoint(a: Point, b: Point, tolerance = 1e-7): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function directionDot(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  return (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
}

function expectSelectedFilletIsTangent(ring: Ring, vertexIndex: number, radius: number): Ring {
  const result = filletRing(ring, radius, {
    vertices: [vertexIndex],
    segmentsPerQuarter: 64,
  });
  expect(result).not.toBeNull();
  const output = result!;
  const vertex = ring[vertexIndex];
  const previous = ring[(vertexIndex - 1 + ring.length) % ring.length];
  const next = ring[(vertexIndex + 1) % ring.length];
  const previousLength = Math.hypot(previous.x - vertex.x, previous.y - vertex.y);
  const nextLength = Math.hypot(next.x - vertex.x, next.y - vertex.y);
  const previousUnit = {
    x: (previous.x - vertex.x) / previousLength,
    y: (previous.y - vertex.y) / previousLength,
  };
  const nextUnit = {
    x: (next.x - vertex.x) / nextLength,
    y: (next.y - vertex.y) / nextLength,
  };
  const angle = Math.acos(
    Math.max(-1, Math.min(1, previousUnit.x * nextUnit.x + previousUnit.y * nextUnit.y)),
  );
  const tangent = radius / Math.tan(angle / 2);
  const start = {
    x: vertex.x + previousUnit.x * tangent,
    y: vertex.y + previousUnit.y * tangent,
  };
  const end = {
    x: vertex.x + nextUnit.x * tangent,
    y: vertex.y + nextUnit.y * tangent,
  };
  const startIndex = output.findIndex((point) => closePoint(point, start));
  const endIndex = output.findIndex((point) => closePoint(point, end));
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  expect(
    directionDot(
      output[(startIndex - 1 + output.length) % output.length],
      output[startIndex],
      output[startIndex],
      output[(startIndex + 1) % output.length],
    ),
  ).toBeGreaterThan(0.995);
  expect(
    directionDot(
      output[(endIndex - 1 + output.length) % output.length],
      output[endIndex],
      output[endIndex],
      output[(endIndex + 1) % output.length],
    ),
  ).toBeGreaterThan(0.995);
  return output;
}

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

  it('allows a lone selected corner to use more than half an edge', () => {
    const result = chamferRing(square, 8, { vertices: [1] });
    expect(result?.some((point) => closePoint(point, { x: 2, y: 0 }))).toBe(true);
    expect(result?.some((point) => closePoint(point, { x: 10, y: 8 }))).toBe(true);
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

  it('keeps acute and obtuse fillets tangent to both adjacent edges', () => {
    expectSelectedFilletIsTangent(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 8 }],
      1,
      1,
    );
    expectSelectedFilletIsTangent(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 12, y: 5 }],
      1,
      1,
    );
  });

  it('rounds a non-right concave corner without self-intersection', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 3 },
      { x: 3, y: 2 },
      { x: 1, y: 8 },
      { x: 0, y: 8 },
    ];
    const result = expectSelectedFilletIsTangent(concave, 3, 0.5);
    expect(validatePolygon({ outer: result, holes: [] }).valid).toBe(true);
  });

  it('allows a lone selected fillet to use more than half an edge', () => {
    const result = filletRing(square, 8, { vertices: [1], segmentsPerQuarter: 8 });
    expect(result?.some((point) => closePoint(point, { x: 2, y: 0 }))).toBe(true);
    expect(result?.some((point) => closePoint(point, { x: 10, y: 8 }))).toBe(true);
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
