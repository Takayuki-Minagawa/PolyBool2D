import { describe, expect, it } from 'vitest';
import { solveConstraints } from '../geometry/constraints';

describe('solveConstraints', () => {
  it('solves length, horizontal and vertical constraints', () => {
    const result = solveConstraints(
      {
        a: { x: 0, y: 0 },
        b: { x: 8, y: 3 },
        c: { x: 12, y: 7 },
      },
      [
        { id: 'h', kind: 'horizontal', a: 'a', b: 'b' },
        { id: 'l', kind: 'length', a: 'a', b: 'b', value: 10 },
        { id: 'v', kind: 'vertical', a: 'b', b: 'c' },
      ],
      { fixed: ['a'], tolerance: 1e-6 },
    );

    expect(result.ok).toBe(true);
    expect(result.points.b.y).toBeCloseTo(result.points.a.y, 5);
    expect(Math.hypot(
      result.points.b.x - result.points.a.x,
      result.points.b.y - result.points.a.y,
    )).toBeCloseTo(10, 5);
    expect(result.points.c.x).toBeCloseTo(result.points.b.x, 5);
  });

  it('solves angular, parallel and perpendicular relationships', () => {
    const angle = solveConstraints(
      {
        a: { x: 1, y: 0 },
        o: { x: 0, y: 0 },
        b: { x: 1, y: 1 },
      },
      [{ id: 'angle', kind: 'angle', a: 'a', vertex: 'o', b: 'b', valueRad: Math.PI / 2 }],
      { fixed: ['a', 'o'] },
    );
    expect(angle.ok).toBe(true);
    expect(angle.points.b.x).toBeCloseTo(0, 5);

    const relation = solveConstraints(
      {
        a1: { x: 0, y: 0 },
        a2: { x: 10, y: 0 },
        b1: { x: 0, y: 5 },
        b2: { x: 5, y: 9 },
        c1: { x: 20, y: 0 },
        c2: { x: 24, y: 5 },
      },
      [
        { id: 'parallel', kind: 'parallel', a1: 'a1', a2: 'a2', b1: 'b1', b2: 'b2' },
        { id: 'perpendicular', kind: 'perpendicular', a1: 'a1', a2: 'a2', b1: 'c1', b2: 'c2' },
      ],
      { fixed: ['a1', 'a2'] },
    );
    expect(relation.ok).toBe(true);
    expect(relation.points.b2.y - relation.points.b1.y).toBeCloseTo(0, 5);
    expect(relation.points.c2.x - relation.points.c1.x).toBeCloseTo(0, 5);
  });

  it('reports missing points and contradictory fixed constraints', () => {
    const missing = solveConstraints(
      { a: { x: 0, y: 0 } },
      [{ id: 'bad', kind: 'length', a: 'a', b: 'missing', value: 1 }],
    );
    expect(missing).toMatchObject({
      ok: false,
      reason: 'missing-point',
      constraintId: 'bad',
    });

    const contradiction = solveConstraints(
      { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } },
      [{ id: 'fixed', kind: 'length', a: 'a', b: 'b', value: 1 }],
      { fixed: ['a', 'b'], maxIterations: 3 },
    );
    expect(contradiction).toMatchObject({
      ok: false,
      reason: 'did-not-converge',
    });
  });

  it('handles coincident length points and partially fixed segments', () => {
    const length = solveConstraints(
      { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
      [{ id: 'length', kind: 'length', a: 'a', b: 'b', value: 4 }],
      { fixed: ['a'], relaxation: 1 },
    );
    expect(length.ok).toBe(true);
    expect(length.points.b).toEqual({ x: 4, y: 0 });

    const parallel = solveConstraints(
      {
        a1: { x: 0, y: 0 },
        a2: { x: 4, y: 0 },
        b1: { x: 0, y: 2 },
        b2: { x: 2, y: 4 },
      },
      [{
        id: 'parallel',
        kind: 'parallel',
        a1: 'a1',
        a2: 'a2',
        b1: 'b1',
        b2: 'b2',
      }],
      { fixed: ['a1', 'a2', 'b1'], relaxation: 1, maxIterations: 4 },
    );
    expect(parallel.ok).toBe(true);
    expect(parallel.points.b2.y).toBeCloseTo(parallel.points.b1.y, 7);
  });

  it('moves an unfixed angle vertex when both ray endpoints are fixed', () => {
    const result = solveConstraints(
      {
        a: { x: -2, y: 0 },
        vertex: { x: 0, y: 1 },
        b: { x: 2, y: 0 },
      },
      [{
        id: 'right-angle',
        kind: 'angle',
        a: 'a',
        vertex: 'vertex',
        b: 'b',
        valueRad: Math.PI / 2,
      }],
      { fixed: ['a', 'b'], tolerance: 1e-6 },
    );
    expect(result.ok).toBe(true);
    expect(result.points.vertex).not.toEqual({ x: 0, y: 1 });
  });

  it('rejects non-finite iteration limits and degenerate direction constraints', () => {
    const nonFiniteIterations = solveConstraints(
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      [{ id: 'length', kind: 'length', a: 'a', b: 'b', value: 1 }],
      { maxIterations: Number.POSITIVE_INFINITY },
    );
    expect(nonFiniteIterations).toMatchObject({
      ok: false,
      reason: 'invalid-input',
      iterations: 0,
    });

    const degenerate = solveConstraints(
      {
        a1: { x: 0, y: 0 },
        a2: { x: 0, y: 0 },
        b1: { x: 0, y: 1 },
        b2: { x: 1, y: 1 },
      },
      [{
        id: 'parallel',
        kind: 'parallel',
        a1: 'a1',
        a2: 'a2',
        b1: 'b1',
        b2: 'b2',
      }],
    );
    expect(degenerate).toMatchObject({
      ok: false,
      reason: 'invalid-input',
      constraintId: 'parallel',
    });
  });
});
