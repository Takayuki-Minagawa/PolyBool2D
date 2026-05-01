import { describe, expect, it } from 'vitest';
import {
  dedupeAdjacent,
  normalizeRing,
  ensureOuterCCW,
  ensureHoleCW,
} from '../geometry/normalize';
import { signedRingArea } from '../geometry/area';

describe('normalize', () => {
  it('removes adjacent duplicate points', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];
    const cleaned = dedupeAdjacent(ring);
    expect(cleaned.length).toBe(4);
  });

  it('rejects rings with fewer than 3 points or zero area', () => {
    expect(normalizeRing([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull();
    const colinear = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(normalizeRing(colinear)).toBeNull();
  });

  it('keeps small measurable rings instead of applying a fixed area cutoff', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 0.0005, y: 0 },
      { x: 0.0005, y: 0.0005 },
      { x: 0, y: 0.0005 },
    ];
    expect(normalizeRing(ring)).not.toBeNull();
  });

  it('orients outer CCW and holes CW', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    expect(signedRingArea(cw)).toBeLessThan(0);
    expect(signedRingArea(ensureOuterCCW(cw))).toBeGreaterThan(0);
    expect(signedRingArea(ensureHoleCW(ensureOuterCCW(cw)))).toBeLessThan(0);
  });
});
