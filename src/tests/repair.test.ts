import { describe, expect, it } from 'vitest';
import { multiPolygonArea } from '../geometry/area';
import {
  repairPolygon,
  repairPolygonResult,
  repairRing,
  repairRingResult,
} from '../geometry/repair';
import { validatePolygon } from '../geometry/validation';

describe('self-intersection repair', () => {
  it('turns a bow-tie ring into two valid polygons', () => {
    const repaired = repairRing([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]);
    expect(repaired).toHaveLength(2);
    expect(multiPolygonArea(repaired)).toBeCloseTo(50, 8);
    expect(repaired.every((polygon) => validatePolygon(polygon).valid)).toBe(true);
  });

  it('normalizes a self-crossing ring using the non-zero fill rule', () => {
    const input = {
      outer: [
        { x: 0, y: 3 },
        { x: 6, y: 3 },
        { x: 1, y: 7 },
        { x: 3, y: -1 },
        { x: 5, y: 7 },
      ],
      holes: [],
    };
    expect(validatePolygon(input).valid).toBe(false);
    const repaired = repairPolygon(input);
    expect(repaired.length).toBeGreaterThan(0);
    expect(repaired.every((polygon) => validatePolygon(polygon).valid)).toBe(true);
  });

  it('returns an empty result for degenerate or non-finite rings', () => {
    expect(repairRing([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toEqual([]);
    expect(
      repairRing([
        { x: 0, y: 0 },
        { x: Infinity, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toEqual([]);
  });

  it('exposes a reason while preserving the empty-result compatibility API', () => {
    const invalid = [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: 1 },
    ];
    expect(repairRing(invalid)).toEqual([]);
    expect(repairRingResult(invalid)).toMatchObject({
      ok: false,
      value: [],
      reason: 'invalid-input',
    });
    expect(
      repairPolygonResult({ outer: invalid, holes: [] }),
    ).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
  });
});
