import type { Point } from './types';

export type ConstraintPointId = string;

export type LengthConstraint = {
  id: string;
  kind: 'length';
  a: ConstraintPointId;
  b: ConstraintPointId;
  value: number;
};

export type HorizontalConstraint = {
  id: string;
  kind: 'horizontal';
  a: ConstraintPointId;
  b: ConstraintPointId;
};

export type VerticalConstraint = {
  id: string;
  kind: 'vertical';
  a: ConstraintPointId;
  b: ConstraintPointId;
};

export type AngleConstraint = {
  id: string;
  kind: 'angle';
  a: ConstraintPointId;
  vertex: ConstraintPointId;
  b: ConstraintPointId;
  valueRad: number;
};

export type ParallelConstraint = {
  id: string;
  kind: 'parallel';
  a1: ConstraintPointId;
  a2: ConstraintPointId;
  b1: ConstraintPointId;
  b2: ConstraintPointId;
};

export type PerpendicularConstraint = {
  id: string;
  kind: 'perpendicular';
  a1: ConstraintPointId;
  a2: ConstraintPointId;
  b1: ConstraintPointId;
  b2: ConstraintPointId;
};

export type ParametricConstraint =
  | LengthConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | AngleConstraint
  | ParallelConstraint
  | PerpendicularConstraint;

export type ConstraintSolveOptions = {
  fixed?: Iterable<ConstraintPointId>;
  maxIterations?: number;
  tolerance?: number;
  relaxation?: number;
};

export type ConstraintSolveResult =
  | {
      ok: true;
      points: Record<ConstraintPointId, Point>;
      iterations: number;
      maxError: number;
    }
  | {
      ok: false;
      reason: 'invalid-input' | 'missing-point' | 'did-not-converge';
      constraintId?: string;
      points: Record<ConstraintPointId, Point>;
      iterations: number;
      maxError: number;
    };

const TWO_PI = Math.PI * 2;
const DEFAULT_MAX_ITERATIONS = 80;
const MAX_ITERATIONS = 10_000;

function normalizedAngle(value: number): number {
  let result = value % TWO_PI;
  if (result > Math.PI) result -= TWO_PI;
  if (result < -Math.PI) result += TWO_PI;
  return result;
}

function isFinitePoint(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function copyPoints(
  points: Readonly<Record<ConstraintPointId, Point>>,
): Record<ConstraintPointId, Point> {
  return Object.fromEntries(
    Object.entries(points).map(([id, point]) => [id, { ...point }]),
  );
}

function movePair(
  points: Record<string, Point>,
  aId: string,
  bId: string,
  dx: number,
  dy: number,
  fixed: ReadonlySet<string>,
): void {
  const aFixed = fixed.has(aId);
  const bFixed = fixed.has(bId);
  if (aFixed && bFixed) return;
  if (aFixed) {
    points[bId].x += dx * 2;
    points[bId].y += dy * 2;
    return;
  }
  if (bFixed) {
    points[aId].x -= dx * 2;
    points[aId].y -= dy * 2;
    return;
  }
  points[aId].x -= dx;
  points[aId].y -= dy;
  points[bId].x += dx;
  points[bId].y += dy;
}

function projectLength(
  points: Record<string, Point>,
  constraint: LengthConstraint,
  fixed: ReadonlySet<string>,
  relaxation: number,
): number {
  const a = points[constraint.a];
  const b = points[constraint.b];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const error = length - constraint.value;
  if (length === 0) {
    const correction = (constraint.value * relaxation) / 2;
    movePair(
      points,
      constraint.a,
      constraint.b,
      correction,
      0,
      fixed,
    );
    return Math.abs(error);
  }
  if (!Number.isFinite(length)) return Math.abs(error);
  const correction = (-error * relaxation) / 2;
  movePair(
    points,
    constraint.a,
    constraint.b,
    (dx / length) * correction,
    (dy / length) * correction,
    fixed,
  );
  return Math.abs(error);
}

function projectAxis(
  points: Record<string, Point>,
  constraint: HorizontalConstraint | VerticalConstraint,
  fixed: ReadonlySet<string>,
  relaxation: number,
): number {
  const a = points[constraint.a];
  const b = points[constraint.b];
  const delta = constraint.kind === 'horizontal' ? b.y - a.y : b.x - a.x;
  const correction = (-delta * relaxation) / 2;
  movePair(
    points,
    constraint.a,
    constraint.b,
    constraint.kind === 'vertical' ? correction : 0,
    constraint.kind === 'horizontal' ? correction : 0,
    fixed,
  );
  return Math.abs(delta);
}

function rotatePointAround(
  point: Point,
  pivot: Point,
  angle: number,
): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

function projectAngle(
  points: Record<string, Point>,
  constraint: AngleConstraint,
  fixed: ReadonlySet<string>,
  relaxation: number,
): number {
  const a = points[constraint.a];
  const vertex = points[constraint.vertex];
  const b = points[constraint.b];
  const av = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const bv = Math.atan2(b.y - vertex.y, b.x - vertex.x);
  const error = normalizedAngle(bv - av - constraint.valueRad);
  if (fixed.has(constraint.a) && fixed.has(constraint.b)) {
    if (fixed.has(constraint.vertex)) return Math.abs(error);

    const adx = a.x - vertex.x;
    const ady = a.y - vertex.y;
    const bdx = b.x - vertex.x;
    const bdy = b.y - vertex.y;
    const aLengthSquared = adx * adx + ady * ady;
    const bLengthSquared = bdx * bdx + bdy * bdy;
    const gradientX = bdy / bLengthSquared - ady / aLengthSquared;
    const gradientY = -bdx / bLengthSquared + adx / aLengthSquared;
    const gradientSquared =
      gradientX * gradientX + gradientY * gradientY;
    if (Number.isFinite(gradientSquared) && gradientSquared > 0) {
      let moveX = (-error * relaxation * gradientX) / gradientSquared;
      let moveY = (-error * relaxation * gradientY) / gradientSquared;
      const moveLength = Math.hypot(moveX, moveY);
      const maxMove =
        Math.min(Math.sqrt(aLengthSquared), Math.sqrt(bLengthSquared)) * 0.5;
      if (moveLength > maxMove && maxMove > 0) {
        moveX *= maxMove / moveLength;
        moveY *= maxMove / moveLength;
      }
      const candidate = {
        x: vertex.x + moveX,
        y: vertex.y + moveY,
      };
      if (isFinitePoint(candidate)) points[constraint.vertex] = candidate;
    }
    return Math.abs(error);
  }

  if (fixed.has(constraint.a)) {
    points[constraint.b] = rotatePointAround(b, vertex, -error * relaxation);
  } else if (fixed.has(constraint.b)) {
    points[constraint.a] = rotatePointAround(a, vertex, error * relaxation);
  } else {
    points[constraint.a] = rotatePointAround(a, vertex, error * relaxation * 0.5);
    points[constraint.b] = rotatePointAround(b, vertex, -error * relaxation * 0.5);
  }
  return Math.abs(error);
}

function projectSegmentRelation(
  points: Record<string, Point>,
  constraint: ParallelConstraint | PerpendicularConstraint,
  fixed: ReadonlySet<string>,
  relaxation: number,
): number {
  const a1 = points[constraint.a1];
  const a2 = points[constraint.a2];
  const b1 = points[constraint.b1];
  const b2 = points[constraint.b2];
  const angleA = Math.atan2(a2.y - a1.y, a2.x - a1.x);
  const angleB = Math.atan2(b2.y - b1.y, b2.x - b1.x);
  const targetDelta = constraint.kind === 'parallel' ? 0 : Math.PI / 2;
  // Parallel and perpendicular directions are undirected: ±π represents the
  // same line, so fold the residual into [-π/2, π/2].
  let error = normalizedAngle(angleB - angleA - targetDelta);
  if (error > Math.PI / 2) error -= Math.PI;
  if (error < -Math.PI / 2) error += Math.PI;

  const aLocked = fixed.has(constraint.a1) && fixed.has(constraint.a2);
  const bLocked = fixed.has(constraint.b1) && fixed.has(constraint.b2);
  if (aLocked && bLocked) return Math.abs(error);

  const rotateSegment = (
    firstId: string,
    secondId: string,
    angle: number,
  ) => {
    const first = points[firstId];
    const second = points[secondId];
    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    if (fixed.has(firstId)) {
      points[secondId] = rotatePointAround(second, first, angle);
    } else if (fixed.has(secondId)) {
      points[firstId] = rotatePointAround(first, second, angle);
    } else {
      points[firstId] = rotatePointAround(first, midpoint, angle);
      points[secondId] = rotatePointAround(second, midpoint, angle);
    }
  };

  if (aLocked) {
    rotateSegment(constraint.b1, constraint.b2, -error * relaxation);
  } else if (bLocked) {
    rotateSegment(constraint.a1, constraint.a2, error * relaxation);
  } else {
    rotateSegment(constraint.a1, constraint.a2, error * relaxation * 0.5);
    rotateSegment(constraint.b1, constraint.b2, -error * relaxation * 0.5);
  }
  return Math.abs(error);
}

function constraintPointIds(constraint: ParametricConstraint): string[] {
  switch (constraint.kind) {
    case 'length':
    case 'horizontal':
    case 'vertical':
      return [constraint.a, constraint.b];
    case 'angle':
      return [constraint.a, constraint.vertex, constraint.b];
    case 'parallel':
    case 'perpendicular':
      return [constraint.a1, constraint.a2, constraint.b1, constraint.b2];
  }
}

function hasFiniteDelta(a: Point, b: Point): boolean {
  return Number.isFinite(b.x - a.x) && Number.isFinite(b.y - a.y);
}

function isNonDegenerateSegment(a: Point, b: Point): boolean {
  return hasFiniteDelta(a, b) && (a.x !== b.x || a.y !== b.y);
}

function hasValidConstraintGeometry(
  points: Readonly<Record<string, Point>>,
  constraint: ParametricConstraint,
): boolean {
  switch (constraint.kind) {
    case 'length':
      return (
        constraint.a !== constraint.b &&
        hasFiniteDelta(points[constraint.a], points[constraint.b])
      );
    case 'horizontal':
    case 'vertical':
      return hasFiniteDelta(points[constraint.a], points[constraint.b]);
    case 'angle':
      return (
        constraint.a !== constraint.vertex &&
        constraint.b !== constraint.vertex &&
        constraint.a !== constraint.b &&
        isNonDegenerateSegment(
          points[constraint.vertex],
          points[constraint.a],
        ) &&
        isNonDegenerateSegment(
          points[constraint.vertex],
          points[constraint.b],
        )
      );
    case 'parallel':
    case 'perpendicular':
      return (
        constraint.a1 !== constraint.a2 &&
        constraint.b1 !== constraint.b2 &&
        isNonDegenerateSegment(
          points[constraint.a1],
          points[constraint.a2],
        ) &&
        isNonDegenerateSegment(
          points[constraint.b1],
          points[constraint.b2],
        )
      );
  }
}

/**
 * Solve lightweight 2D dimensional/geometric constraints using iterative
 * projection. This is deterministic, dependency-free, and suitable for
 * interactive edits; contradictory systems return a diagnostic result.
 */
export function solveConstraints(
  sourcePoints: Readonly<Record<ConstraintPointId, Point>>,
  constraints: readonly ParametricConstraint[],
  options: ConstraintSolveOptions = {},
): ConstraintSolveResult {
  const points = copyPoints(sourcePoints);
  const fixed = new Set(options.fixed ?? []);
  const requestedMaxIterations =
    options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxIterations = Math.min(
    MAX_ITERATIONS,
    Math.floor(requestedMaxIterations),
  );
  const tolerance = options.tolerance ?? 1e-7;
  const relaxation = options.relaxation ?? 0.85;
  if (
    !Number.isFinite(requestedMaxIterations) ||
    requestedMaxIterations < 1 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    !Number.isFinite(relaxation) ||
    relaxation <= 0 ||
    relaxation > 1 ||
    Object.values(points).some((point) => !isFinitePoint(point))
  ) {
    return {
      ok: false,
      reason: 'invalid-input',
      points,
      iterations: 0,
      maxError: Number.POSITIVE_INFINITY,
    };
  }

  for (const constraint of constraints) {
    if (constraintPointIds(constraint).some((id) => !isFinitePoint(points[id]))) {
      return {
        ok: false,
        reason: 'missing-point',
        constraintId: constraint.id,
        points,
        iterations: 0,
        maxError: Number.POSITIVE_INFINITY,
      };
    }
    if (
      (constraint.kind === 'length' &&
        (!Number.isFinite(constraint.value) || constraint.value <= 0)) ||
      (constraint.kind === 'angle' && !Number.isFinite(constraint.valueRad)) ||
      !hasValidConstraintGeometry(points, constraint)
    ) {
      return {
        ok: false,
        reason: 'invalid-input',
        constraintId: constraint.id,
        points,
        iterations: 0,
        maxError: Number.POSITIVE_INFINITY,
      };
    }
  }

  if (constraints.length === 0) {
    return { ok: true, points, iterations: 0, maxError: 0 };
  }

  let maxError = Number.POSITIVE_INFINITY;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    maxError = 0;
    for (const constraint of constraints) {
      let error: number;
      switch (constraint.kind) {
        case 'length':
          error = projectLength(points, constraint, fixed, relaxation);
          break;
        case 'horizontal':
        case 'vertical':
          error = projectAxis(points, constraint, fixed, relaxation);
          break;
        case 'angle':
          error = projectAngle(points, constraint, fixed, relaxation);
          break;
        case 'parallel':
        case 'perpendicular':
          error = projectSegmentRelation(points, constraint, fixed, relaxation);
          break;
      }
      maxError = Math.max(maxError, error);
      if (
        constraintPointIds(constraint).some(
          (id) => !isFinitePoint(points[id]),
        )
      ) {
        return {
          ok: false,
          reason: 'invalid-input',
          constraintId: constraint.id,
          points,
          iterations: iteration,
          maxError: Number.POSITIVE_INFINITY,
        };
      }
    }
    if (maxError <= tolerance) {
      return { ok: true, points, iterations: iteration, maxError };
    }
  }

  return {
    ok: false,
    reason: 'did-not-converge',
    points,
    iterations: maxIterations,
    maxError,
  };
}
