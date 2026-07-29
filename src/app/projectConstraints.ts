import {
  solveConstraints,
  type ConstraintSolveOptions,
  type ConstraintSolveResult,
  type ParametricConstraint,
} from '../geometry/constraints';
import type { Point } from '../geometry/types';
import type { Entity, Project } from './projectTypes';

export type ProjectPointRef =
  | {
      entityId: string;
      ring: 'outer';
      pointIndex: number;
    }
  | {
      entityId: string;
      ring: 'hole';
      holeIndex: number;
      pointIndex: number;
    }
  | {
      entityId: string;
      ring: 'linear';
      pointIndex: number;
    };

export type ProjectConstraintResult =
  | (Extract<ConstraintSolveResult, { ok: true }> & { project: Project })
  | (Extract<ConstraintSolveResult, { ok: false }> & { project: Project });

export function projectPointKey(ref: ProjectPointRef): string {
  return ref.ring === 'hole'
    ? `${ref.entityId}|hole|${ref.holeIndex}|${ref.pointIndex}`
    : `${ref.entityId}|${ref.ring}|${ref.pointIndex}`;
}

export function parseProjectPointKey(key: string): ProjectPointRef | null {
  const parts = key.split('|');
  const indexFrom = (value: string): number | null => {
    if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
    const index = Number(value);
    return Number.isSafeInteger(index) ? index : null;
  };
  const ring = parts.at(-2);
  if (parts.length >= 3 && (ring === 'outer' || ring === 'linear')) {
    const pointIndex = indexFrom(parts.at(-1)!);
    const entityId = parts.slice(0, -2).join('|');
    return entityId && pointIndex !== null
      ? { entityId, ring, pointIndex }
      : null;
  }
  if (parts.length >= 4 && parts.at(-3) === 'hole') {
    const holeIndex = indexFrom(parts.at(-2)!);
    const pointIndex = indexFrom(parts.at(-1)!);
    const entityId = parts.slice(0, -3).join('|');
    return entityId && holeIndex !== null && pointIndex !== null
      ? { entityId, ring: 'hole', holeIndex, pointIndex }
      : null;
  }
  return null;
}

export function projectConstraintPoints(project: Project): Record<string, Point> {
  const result: Record<string, Point> = {};
  for (const entity of project.entities) {
    if (entity.type === 'polygon') {
      entity.geometry.outer.forEach((point, pointIndex) => {
        result[projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex })] = {
          ...point,
        };
      });
      entity.geometry.holes.forEach((hole, holeIndex) => {
        hole.forEach((point, pointIndex) => {
          result[projectPointKey({
            entityId: entity.id,
            ring: 'hole',
            holeIndex,
            pointIndex,
          })] = { ...point };
        });
      });
    } else {
      entity.points.forEach((point, pointIndex) => {
        result[projectPointKey({ entityId: entity.id, ring: 'linear', pointIndex })] = {
          ...point,
        };
      });
    }
  }
  return result;
}

export function projectConstraintPointIds(
  constraint: ParametricConstraint,
): string[] {
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

export function mapProjectConstraintPointIds(
  constraint: ParametricConstraint,
  mapPointId: (pointId: string) => string,
): ParametricConstraint {
  switch (constraint.kind) {
    case 'length':
    case 'horizontal':
    case 'vertical':
      return {
        ...constraint,
        a: mapPointId(constraint.a),
        b: mapPointId(constraint.b),
      };
    case 'angle':
      return {
        ...constraint,
        a: mapPointId(constraint.a),
        vertex: mapPointId(constraint.vertex),
        b: mapPointId(constraint.b),
      };
    case 'parallel':
    case 'perpendicular':
      return {
        ...constraint,
        a1: mapPointId(constraint.a1),
        a2: mapPointId(constraint.a2),
        b1: mapPointId(constraint.b1),
        b2: mapPointId(constraint.b2),
      };
  }
}

/** Remove constraints whose entity, ring, hole, or point index no longer exists. */
export function sanitizeProjectConstraints(
  project: Project,
  constraints: readonly ParametricConstraint[] = project.constraints ?? [],
): ParametricConstraint[] {
  if (constraints.length === 0) return [];
  const entitiesById = new Map(
    project.entities.map((entity) => [entity.id, entity]),
  );
  return constraints.filter((constraint) =>
    projectConstraintPointIds(constraint).every((id) => {
      const reference = parseProjectPointKey(id);
      if (!reference) return false;
      const entity = entitiesById.get(reference.entityId);
      if (!entity) return false;
      if (reference.ring === 'linear') {
        return (
          'points' in entity &&
          reference.pointIndex < entity.points.length
        );
      }
      if (entity.type !== 'polygon') return false;
      if (reference.ring === 'outer') {
        return reference.pointIndex < entity.geometry.outer.length;
      }
      const hole = entity.geometry.holes[reference.holeIndex];
      return !!hole && reference.pointIndex < hole.length;
    }),
  );
}

function updateEntity(
  entity: Entity,
  solved: Readonly<Record<string, Point>>,
): Entity {
  if (entity.type === 'polygon') {
    return {
      ...entity,
      geometry: {
        outer: entity.geometry.outer.map((point, pointIndex) =>
          solved[projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex })]
            ?? point,
        ),
        holes: entity.geometry.holes.map((hole, holeIndex) =>
          hole.map((point, pointIndex) =>
            solved[projectPointKey({
              entityId: entity.id,
              ring: 'hole',
              holeIndex,
              pointIndex,
            })] ?? point,
          ),
        ),
      },
    };
  }
  return {
    ...entity,
    points: entity.points.map((point, pointIndex) =>
      solved[projectPointKey({ entityId: entity.id, ring: 'linear', pointIndex })]
        ?? point,
    ),
  };
}

/**
 * Solve constraints against project vertex references and return an immutable
 * project snapshot. Even a non-converged result includes the latest candidate
 * coordinates for diagnostics, but the original project is kept unchanged.
 */
export function solveProjectConstraints(
  project: Project,
  constraints: readonly ParametricConstraint[],
  options: ConstraintSolveOptions = {},
): ProjectConstraintResult {
  const result = solveConstraints(projectConstraintPoints(project), constraints, options);
  const nextProject = result.ok
    ? {
        ...project,
        updatedAt: new Date().toISOString(),
        entities: project.entities.map((entity) => updateEntity(entity, result.points)),
      }
    : project;
  return { ...result, project: nextProject };
}
