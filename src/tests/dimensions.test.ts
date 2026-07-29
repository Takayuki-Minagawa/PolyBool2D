import { describe, expect, it } from 'vitest';
import {
  angularDimensionGeometry,
  formatDimension,
  linearDimensionGeometry,
} from '../geometry/dimensions';

describe('dimension geometry', () => {
  it('creates aligned dimension and extension lines', () => {
    const geometry = linearDimensionGeometry(
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      10,
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.value).toBe(5);
    expect(geometry!.dimensionEnd.x - geometry!.dimensionStart.x).toBeCloseTo(3);
    expect(geometry!.dimensionEnd.y - geometry!.dimensionStart.y).toBeCloseTo(4);
  });

  it('creates the minor angular arc and label', () => {
    const geometry = angularDimensionGeometry(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      8,
      8,
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.valueRad).toBeCloseTo(Math.PI / 2);
    expect(geometry!.arcPoints).toHaveLength(9);
    expect(Math.hypot(
      geometry!.labelPosition.x,
      geometry!.labelPosition.y,
    )).toBeCloseTo(8);
  });

  it('formats values without meaningless trailing zeros', () => {
    expect(formatDimension(12.5, { precision: 3, unit: 'mm' })).toBe('12.5 mm');
    expect(formatDimension(90, { precision: 0, suffix: '°' })).toBe('90°');
    expect(formatDimension(Number.NaN)).toBe('—');
    expect(formatDimension(12.345, { precision: Number.NaN })).toBe('12.35');
  });

  it('rejects dimension geometry that would contain non-finite coordinates', () => {
    expect(linearDimensionGeometry(
      { x: -Number.MAX_VALUE, y: 0 },
      { x: Number.MAX_VALUE, y: 0 },
      1,
    )).toBeNull();
    expect(linearDimensionGeometry(
      { x: Number.MAX_VALUE, y: 0 },
      { x: Number.MAX_VALUE, y: 1 },
      -Number.MAX_VALUE,
    )).toBeNull();

    expect(angularDimensionGeometry(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      10,
    )).toBeNull();
    expect(angularDimensionGeometry(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      1,
      Number.NaN,
    )).toBeNull();
  });
});
