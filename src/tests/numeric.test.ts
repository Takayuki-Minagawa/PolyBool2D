import { describe, expect, it } from 'vitest';
import {
  addCompensated,
  areaComparisonTolerance,
  compensatedTotal,
  createCompensatedSum,
  isFinitePoint,
  isFiniteRing,
  parameterTolerance,
  pointOnSegment,
  ringCoordinateTolerance,
} from '../geometry/numeric';

describe('numeric geometry helpers', () => {
  it('retains low-order values with compensated summation', () => {
    const sum = createCompensatedSum();
    for (const value of [1e16, 1, -1e16]) addCompensated(sum, value);
    expect(compensatedTotal(sum)).toBe(1);
  });

  it('uses scale-aware line and ring tolerances', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 1_000_000_000, y: 0 };
    expect(pointOnSegment({ x: 500_000_000, y: 5e-10 }, start, end)).toBe(
      true,
    );
    expect(pointOnSegment({ x: 500_000_000, y: 2 }, start, end)).toBe(false);
    expect(ringCoordinateTolerance([start, end])).toBe(1);
  });

  it('keeps parameter and area comparison tolerances bounded and scaled', () => {
    expect(parameterTolerance(1e12)).toBeGreaterThan(0);
    expect(areaComparisonTolerance(2, 4)).toBeCloseTo(
      areaComparisonTolerance(1, 2) * 2,
      20,
    );
  });

  it('checks finite points and rings consistently', () => {
    expect(isFinitePoint({ x: 1, y: -2 })).toBe(true);
    expect(isFinitePoint({ x: Number.NaN, y: 0 })).toBe(false);
    expect(
      isFiniteRing([
        { x: 0, y: 0 },
        { x: Infinity, y: 1 },
      ]),
    ).toBe(false);
  });
});
