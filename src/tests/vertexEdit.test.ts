import { describe, expect, it } from 'vitest';
import { insertVertexInRing, deleteVertexFromRing } from '../geometry/vertexEdit';

const triangle = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 10 },
];

describe('vertexEdit', () => {
  it('inserts a vertex after the given index', () => {
    const out = insertVertexInRing(triangle, 0, { x: 5, y: 0 });
    expect(out).toHaveLength(4);
    expect(out[1]).toEqual({ x: 5, y: 0 });
  });

  it('clamps the insertion index into range', () => {
    const out = insertVertexInRing(triangle, 99, { x: 1, y: 1 });
    expect(out).toHaveLength(4);
    expect(out[out.length - 1]).toEqual({ x: 1, y: 1 });
  });

  it('deletes a vertex by index', () => {
    const quad = [...triangle, { x: 0, y: 10 }];
    const out = deleteVertexFromRing(quad, 1);
    expect(out).not.toBeNull();
    expect(out!).toHaveLength(3);
    expect(out!).not.toContainEqual({ x: 10, y: 0 });
  });

  it('refuses to drop below 3 vertices', () => {
    expect(deleteVertexFromRing(triangle, 0)).toBeNull();
  });

  it('returns the ring unchanged for out-of-range delete', () => {
    const quad = [...triangle, { x: 0, y: 10 }];
    expect(deleteVertexFromRing(quad, 99)).toBe(quad);
  });
});
