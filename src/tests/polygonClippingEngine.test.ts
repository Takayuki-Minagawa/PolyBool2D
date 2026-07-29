import { afterEach, describe, expect, it } from 'vitest';
import { multiPolygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import {
  getEngine,
  resetEngine,
  setEngine,
} from '../geometry/geometryEngine';
import { PolygonClippingEngine } from '../geometry/polygonClippingEngine';
import { Clipper2Engine } from '../geometry/clipper2Engine';
import { repairPolygonResult } from '../geometry/repair';
import type {
  MultiPolygonGeometry,
  PolygonGeometry,
} from '../geometry/types';

const square = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PolygonGeometry => ({
  outer: rectangleToRing({ x: minX, y: minY }, { x: maxX, y: maxY }),
  holes: [],
});

afterEach(() => {
  resetEngine();
});

describe('PolygonClippingEngine directly', () => {
  it('performs boolean operations without the registry facade', () => {
    const engine = new PolygonClippingEngine();
    const union = engine.union([square(0, 0, 10, 10), square(5, 0, 15, 10)]);
    expect(union).toHaveLength(1);
    expect(multiPolygonArea(union)).toBeCloseTo(150, 8);

    const difference = engine.difference(
      [square(0, 0, 10, 10)],
      [square(2, 2, 8, 8)],
    );
    expect(multiPolygonArea(difference)).toBeCloseTo(64, 8);
    expect(difference[0].holes).toHaveLength(1);
  });

  it('normalizes and validates direct inputs', () => {
    const engine = new PolygonClippingEngine();
    expect(engine.normalize([square(0, 0, 4, 4)])).toHaveLength(1);
    expect(
      engine.validate([
        {
          outer: [
            { x: 0, y: 0 },
            { x: 4, y: 4 },
            { x: 4, y: 0 },
            { x: 0, y: 4 },
          ],
          holes: [],
        },
      ]),
    ).toMatchObject({ valid: false });
  });
});

describe('geometry engine registry', () => {
  it('sets and resets the active engine', () => {
    const custom = new PolygonClippingEngine();
    setEngine(custom);
    expect(getEngine()).toBe(custom);
    resetEngine();
    expect(getEngine()).not.toBe(custom);
    expect(getEngine()).toBeInstanceOf(Clipper2Engine);
  });

  it('makes repair failures diagnosable through an injected engine', () => {
    class FailingEngine extends PolygonClippingEngine {
      override union(_input: MultiPolygonGeometry): MultiPolygonGeometry {
        throw new Error('injected union failure');
      }
    }
    setEngine(new FailingEngine());

    expect(repairPolygonResult(square(0, 0, 10, 10))).toMatchObject({
      ok: false,
      value: [],
      reason: 'engine-error',
      message: expect.stringContaining('injected union failure'),
    });
  });
});
