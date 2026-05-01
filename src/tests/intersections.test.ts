import { describe, expect, it } from 'vitest';
import { segmentIntersection } from '../geometry/intersections';

describe('segmentIntersection', () => {
  it('detects a clean cross intersection', () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    );
    expect(r.type).toBe('point');
    if (r.type === 'point') {
      expect(r.point.x).toBeCloseTo(5, 6);
      expect(r.point.y).toBeCloseTo(5, 6);
    }
  });

  it('reports none for non-overlapping parallel segments', () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 1 },
      { x: 10, y: 1 },
    );
    expect(r.type).toBe('none');
  });

  it('reports none for skew segments that miss', () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    );
    expect(r.type).toBe('none');
  });
});
