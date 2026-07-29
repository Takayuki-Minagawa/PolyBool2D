import { describe, expect, it } from 'vitest';
import { polygonArea, multiPolygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import { polygonBBox } from '../geometry/measure';
import {
  bufferPolygon,
  bufferPolygonResult,
  offsetPolygon,
} from '../geometry/offset';

describe('polygon buffer / offset', () => {
  const square = {
    outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
    holes: [],
  };

  it('creates a round positive buffer', () => {
    const result = bufferPolygon(square, 1, { arcSegments: 128 });
    expect(result).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeCloseTo(100 + 40 + Math.PI, 2);
    expect(polygonBBox(result[0])).toEqual({
      minX: -1,
      minY: -1,
      maxX: 11,
      maxY: 11,
    });
  });

  it('falls back safely for a 10x10 +2 offset with 64 arc segments', () => {
    const result = offsetPolygon(square, 2, { arcSegments: 64 });

    expect(result).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeCloseTo(100 + 80 + Math.PI * 4, 1);
    expect(polygonBBox(result[0])).toEqual({
      minX: -2,
      minY: -2,
      maxX: 12,
      maxY: 12,
    });
  });

  it('erodes with a negative distance and can disappear', () => {
    const inset = offsetPolygon(square, -1, { arcSegments: 32 });
    expect(inset).toHaveLength(1);
    expect(multiPolygonArea(inset)).toBeCloseTo(64, 6);
    expect(bufferPolygon(square, -6)).toEqual([]);
  });

  it('shrinks holes on a positive buffer', () => {
    const withHole = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [rectangleToRing({ x: 8, y: 8 }, { x: 12, y: 12 })],
    };
    const result = bufferPolygon(withHole, 1, { arcSegments: 128 });
    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(Math.abs(polygonArea({ outer: result[0].holes[0], holes: [] }))).toBeCloseTo(4, 6);
    expect(multiPolygonArea(result)).toBeGreaterThan(polygonArea(withHole));
  });

  it('normalizes zero distance and rejects non-finite input', () => {
    expect(bufferPolygon(square, 0)).toHaveLength(1);
    expect(bufferPolygon(square, Number.NaN)).toEqual([]);
    expect(
      bufferPolygon(
        { outer: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 1 }], holes: [] },
        1,
      ),
    ).toEqual([]);
  });

  it('buffers a large clockwise-hole rectangle from the drawing workflow', () => {
    const drawn = {
      outer: [
        { x: -336.32, y: -79.174 },
        { x: 152.767, y: -79.174 },
        { x: 152.767, y: 203.2 },
        { x: -336.32, y: 203.2 },
      ],
      holes: [[
        { x: -200, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        { x: -200, y: 0 },
      ]],
    };
    const result = offsetPolygon(drawn, 10, { arcSegments: 64 });
    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeGreaterThan(polygonArea(drawn));
  });

  it('reports invalid input without changing the compatibility return value', () => {
    expect(bufferPolygon(square, Number.NaN)).toEqual([]);
    expect(bufferPolygonResult(square, Number.NaN)).toMatchObject({
      ok: false,
      value: [],
      reason: 'invalid-input',
    });
  });

  it('caps excessive arc detail for complex buffers and reports the reduction', () => {
    const pentagon = {
      outer: Array.from({ length: 5 }, (_, index) => {
        const angle = (index / 5) * Math.PI * 2;
        return { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 };
      }),
      holes: [],
    };
    const result = bufferPolygonResult(pentagon, 0.5, {
      arcSegments: 4096,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'arc-segments-reduced' }),
      ]),
    );
  });
});
