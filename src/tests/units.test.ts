import { describe, expect, it } from 'vitest';
import { convertArea, formatArea, formatLength } from '../app/units';

describe('units', () => {
  it('converts coordinate area (mm units) to m²', () => {
    // 1,000,000 mm² = 1 m²
    expect(convertArea(1_000_000, 'mm', 'm2')).toBeCloseTo(1);
  });

  it('honours the project coordinate unit', () => {
    // 1 coordinate unit = 1 m, so 1 unit² = 1 m².
    expect(convertArea(1, 'm', 'm2')).toBeCloseTo(1);
    // ...and that same area is 1,000,000,000,000 mm²... but as mm²: 1 m = 1000mm
    expect(convertArea(1, 'm', 'mm2')).toBeCloseTo(1_000_000);
  });

  it('converts to cm²', () => {
    // 100 mm² = 1 cm²
    expect(convertArea(100, 'mm', 'cm2')).toBeCloseTo(1);
  });

  it('formats area with unit label and decimals', () => {
    expect(formatArea(1_000_000, 'mm', 'm2', 3)).toBe('1.000 m²');
    expect(formatArea(100, 'mm', 'cm2', 1)).toBe('1.0 cm²');
  });

  it('formats length with the project unit label', () => {
    expect(formatLength(40, 'mm', 2)).toBe('40.00 mm');
    expect(formatLength(1.5, 'm', 1)).toBe('1.5 m');
  });
});
