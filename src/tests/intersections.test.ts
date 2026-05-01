import { describe, expect, it } from 'vitest';
import { pointInRing, segmentIntersection } from '../geometry/intersections';

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

  it('detects overlap on tiny collinear segments', () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 1e-5, y: 0 },
      { x: 5e-6, y: 0 },
      { x: 1.5e-5, y: 0 },
    );
    expect(r.type).toBe('overlap');
    if (r.type === 'overlap') {
      expect(r.points[0].x).toBeCloseTo(5e-6, 12);
      expect(r.points[1].x).toBeCloseTo(1e-5, 12);
    }
  });

  it('uses scale-aware collinearity for long segments', () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 1_000_000_000, y: 0 },
      { x: 10, y: 5e-10 },
      { x: 20, y: 5e-10 },
    );
    expect(r.type).toBe('overlap');
  });

  it('does not merge visibly separated long parallel segments', () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 1_000_000_000, y: 0 },
      { x: 10, y: 0.5 },
      { x: 20, y: 0.5 },
    );
    expect(r.type).toBe('none');
  });

  it('treats ring boundary points as inside', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInRing({ x: 5, y: 0 }, ring)).toBe(true);
    expect(pointInRing({ x: 5, y: 5 }, ring)).toBe(true);
    expect(pointInRing({ x: 15, y: 5 }, ring)).toBe(false);
  });
});
