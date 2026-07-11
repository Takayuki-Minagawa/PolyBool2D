import { describe, expect, it } from 'vitest';
import { parseDrawingDistance, pointAtDistance } from '../geometry/drawingInput';

describe('numeric drawing input', () => {
  it('places the next point at an exact distance along the cursor direction', () => {
    const point = pointAtDistance({ x: 1, y: 2 }, { x: 4, y: 6 }, 10);
    expect(point).not.toBeNull();
    expect(point?.x).toBeCloseTo(7);
    expect(point?.y).toBeCloseTo(10);
  });

  it('parses positive decimal input and rejects invalid values', () => {
    expect(parseDrawingDistance('12,5')).toBe(12.5);
    expect(parseDrawingDistance('0')).toBeNull();
    expect(parseDrawingDistance('abc')).toBeNull();
  });
});
