import { describe, expect, it } from 'vitest';
import {
  Clipper2Engine,
  offsetWithClipper2,
} from '../geometry/clipper2Engine';
import { bufferPolygonResult } from '../geometry/offset';
import { PolygonClippingEngine } from '../geometry/polygonClippingEngine';
import { repairPolygonResult } from '../geometry/repair';
import type { PolygonGeometry } from '../geometry/types';

const square = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PolygonGeometry => ({
  outer: [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ],
  holes: [],
});

describe('Clipper2Engine', () => {
  const engines = [new PolygonClippingEngine(), new Clipper2Engine()];

  it('matches the existing engine for core boolean areas', () => {
    const input = [square(0, 0, 10, 10), square(5, 0, 15, 10)];
    const [legacy, clipper2] = engines;

    expect(clipper2.area(clipper2.union(input))).toBeCloseTo(
      legacy.area(legacy.union(input)),
      8,
    );
    expect(clipper2.area(clipper2.intersection(input))).toBeCloseTo(
      legacy.area(legacy.intersection(input)),
      8,
    );
    expect(clipper2.area(clipper2.xor(input))).toBeCloseTo(
      legacy.area(legacy.xor(input)),
      8,
    );
    expect(clipper2.area(clipper2.difference([input[0]], [input[1]]))).toBeCloseTo(
      legacy.area(legacy.difference([input[0]], [input[1]])),
      8,
    );
  });

  it('preserves holes through boolean operations', () => {
    const donut: PolygonGeometry = {
      ...square(0, 0, 20, 20),
      holes: [[
        { x: 5, y: 5 },
        { x: 5, y: 15 },
        { x: 15, y: 15 },
        { x: 15, y: 5 },
      ]],
    };
    const result = new Clipper2Engine().union([donut]);

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(new Clipper2Engine().area(result)).toBeCloseTo(300, 8);
  });

  it('honours declared hole semantics even when input winding is inconsistent', () => {
    const donut: PolygonGeometry = {
      ...square(0, 0, 20, 20),
      holes: [[
        { x: 5, y: 5 },
        { x: 15, y: 5 },
        { x: 15, y: 15 },
        { x: 5, y: 15 },
      ]],
    };
    const engine = new Clipper2Engine();
    const result = engine.union([donut]);

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(engine.area(result)).toBeCloseTo(300, 8);
  });

  it('uses Clipper2 native round and miter offsets', () => {
    const source = [square(0, 0, 10, 10)];
    const round = offsetWithClipper2(source, 2, { join: 'round' });
    const miter = offsetWithClipper2(source, 2, { join: 'miter' });
    const inset = offsetWithClipper2(source, -2);
    const engine = new Clipper2Engine();

    expect(engine.area(round)).toBeGreaterThan(190);
    expect(engine.area(round)).toBeLessThan(196.7);
    expect(engine.area(miter)).toBeCloseTo(196, 6);
    expect(engine.area(inset)).toBeCloseTo(36, 6);
  });

  it('shrinks holes by their declared semantics during a positive offset', () => {
    const donut: PolygonGeometry = {
      ...square(0, 0, 20, 20),
      holes: [square(8, 8, 12, 12).outer],
    };
    const result = offsetWithClipper2([donut], 1, {
      join: 'round',
      arcTolerance: 0.0003,
    });

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(new Clipper2Engine().area([
      { outer: result[0].holes[0], holes: [] },
    ])).toBeCloseTo(4, 6);
  });

  it('reduces decimal precision for large safe coordinates', () => {
    const engine = new Clipper2Engine();
    const large = square(100_000_000, 100_000_000, 100_000_010, 100_000_010);

    expect(() => engine.union([large])).not.toThrow();
    expect(engine.area(engine.union([large]))).toBeCloseTo(100, 5);
    expect(engine.area(engine.intersection([large]))).toBeCloseTo(100, 5);
    expect(engine.area(engine.xor([large]))).toBeCloseTo(100, 5);
  });

  it('repairs zero-signed-area self intersections during union', () => {
    const engine = new Clipper2Engine();
    const bowTie: PolygonGeometry = {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
      holes: [],
    };

    const result = engine.union([bowTie]);

    expect(result.length).toBeGreaterThan(0);
    expect(engine.area(result)).toBeCloseTo(50, 8);
  });

  it('ignores non-finite union members without throwing away valid input', () => {
    const engine = new Clipper2Engine();
    const invalid: PolygonGeometry = {
      outer: [
        { x: Number.NaN, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      holes: [],
    };

    expect(() => engine.union([invalid])).not.toThrow();
    expect(engine.union([invalid])).toEqual([]);
    expect(engine.area(engine.union([invalid, square(0, 0, 10, 10)])))
      .toBeCloseTo(100, 8);

    const validOuterWithInvalidHole: PolygonGeometry = {
      ...square(0, 0, 10, 10),
      holes: [invalid.outer],
    };
    expect(engine.area(engine.union([validOuterWithInvalidHole])))
      .toBeCloseTo(100, 8);
  });

  it('rejects out-of-range operands before boolean operations in either order', () => {
    const engine = new Clipper2Engine();
    const outsideClipperRange = square(0, 0, 1e300, 1e300);
    const valid = square(0, 0, 10, 10);

    expect(() => engine.union([outsideClipperRange])).toThrow(RangeError);
    expect(() =>
      engine.difference([outsideClipperRange], [valid])
    ).toThrow(RangeError);
    expect(() =>
      engine.difference([valid], [outsideClipperRange])
    ).toThrow(RangeError);
    expect(() =>
      engine.intersection([outsideClipperRange, valid])
    ).toThrow(RangeError);
    expect(() =>
      engine.intersection([valid, outsideClipperRange])
    ).toThrow(RangeError);
    expect(() =>
      engine.xor([outsideClipperRange, valid])
    ).toThrow(RangeError);
    expect(() =>
      engine.xor([valid, outsideClipperRange])
    ).toThrow(RangeError);
  });

  it('reports repair failures for coordinates outside Clipper2 range', () => {
    const result = repairPolygonResult(square(0, 0, 1e300, 1e300));

    expect(result).toMatchObject({
      ok: false,
      value: [],
      reason: 'engine-error',
    });
    if (!result.ok) {
      expect(result.message).toContain(
        'Clipper2 coordinates exceed the supported range',
      );
    }
  });

  it('reports buffer failures when expansion exceeds Clipper2 range', () => {
    const nearLimit = square(-8e23, -8e23, 8e23, 8e23);
    const result = bufferPolygonResult(nearLimit, 8e23);

    expect(() => offsetWithClipper2([nearLimit], 8e23)).toThrow(RangeError);
    expect(result).toMatchObject({
      ok: false,
      value: [],
      reason: 'engine-error',
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'miter-offset-fallback' }),
      ]),
    );
    if (!result.ok) {
      expect(result.message).toContain(
        'Clipper2 coordinates exceed the supported range',
      );
    }
  });
});
