import type { Entity, LinearEntity, Project } from '../app/projectTypes';
import { isEntityEffectivelyLocked } from '../app/layers';
import {
  parseProjectPointKey,
  projectConstraintPointIds,
} from '../app/projectConstraints';
import type { Point } from './types';

export type CleanupResult = {
  entities: Entity[];
  removed: number;
  joined: number;
  changedIds: string[];
};
/** Exact coordinate equality avoids moving geometry. Never rewrite constrained or locked entities. */
export function cleanDrawingLines(
  project: Project,
  join: boolean,
): CleanupResult {
  const protectedIds = new Set(
    (project.constraints ?? []).flatMap((c) =>
      projectConstraintPointIds(c).map(
        (id) => parseProjectPointKey(id)?.entityId,
      ),
    ),
  );
  const memberships = new Map<string, string[]>();
  for (const group of project.groups ?? [])
    for (const id of group.entityIds)
      memberships.set(id, [...(memberships.get(id) ?? []), group.id].sort());
  const eligible = (e: Entity): e is LinearEntity =>
    e.type === 'guide-line' &&
    e.kind === 'polyline' &&
    !e.label &&
    !isEntityEffectivelyLocked(project, e) &&
    !protectedIds.has(e.id) &&
    e.points.length >= 2;
  const pointKey = (p: Point) => `${p.x},${p.y}`;
  const styleKey = (e: LinearEntity) =>
    JSON.stringify([
      e.layerId,
      e.visible,
      e.style.stroke,
      e.style.strokeWidth,
      e.style.opacity,
      e.style.dashArray ?? [],
      e.style.dashOffset ?? 0,
      e.style.lineCap ?? 'round',
      e.style.lineJoin ?? 'round',
      memberships.get(e.id) ?? [],
    ]);
  const seen = new Set<string>();
  const changed = new Set<string>();
  let removed = 0,
    joined = 0;
  let entities = project.entities.filter((entity) => {
    if (!eligible(entity)) return true;
    const forward = entity.points.map(pointKey).join(';');
    const reverse = entity.points.slice().reverse().map(pointKey).join(';');
    const path = entity.style.dashArray?.length
      ? forward
      : forward < reverse
        ? forward
        : reverse;
    const key = `${styleKey(entity)}:${path}`;
    if (seen.has(key)) {
      removed++;
      changed.add(entity.id);
      return false;
    }
    seen.add(key);
    return true;
  });
  if (join) {
    const candidates = new Map(
      entities
        .filter(eligible)
        .filter(
          (e) =>
            !e.style.dashArray?.length &&
            pointKey(e.points[0]) !== pointKey(e.points.at(-1)!),
        )
        .map((e) => [e.id, e]),
    );
    const endpoints = new Map<string, string[]>();
    const endpointKey = (e: LinearEntity, p: Point) =>
      `${styleKey(e)}:${pointKey(p)}`;
    for (const entity of candidates.values())
      for (const point of [entity.points[0], entity.points.at(-1)!]) {
        const key = endpointKey(entity, point);
        endpoints.set(key, [...(endpoints.get(key) ?? []), entity.id]);
      }
    const visited = new Set<string>();
    const replacements = new Map<string, LinearEntity>();
    for (const entity of candidates.values()) {
      if (visited.has(entity.id)) continue;
      visited.add(entity.id);
      let points = entity.points.slice();
      for (const end of ['end', 'start'] as const) {
        while (true) {
          const anchor = end === 'end' ? points.at(-1)! : points[0];
          const neighbors = endpoints.get(endpointKey(entity, anchor)) ?? [];
          if (neighbors.length !== 2) break;
          const id = neighbors.find((item) => !visited.has(item));
          if (!id) break;
          const next = candidates.get(id)!;
          const nextPoints =
            pointKey(next.points[0]) === pointKey(anchor)
              ? next.points
              : next.points.slice().reverse();
          points =
            end === 'end'
              ? [...points, ...nextPoints.slice(1)]
              : [...nextPoints.slice(1).reverse(), ...points];
          visited.add(id);
          changed.add(id);
          changed.add(entity.id);
          joined++;
        }
      }
      replacements.set(entity.id, { ...entity, points });
    }
    entities = entities.flatMap((e) =>
      !candidates.has(e.id)
        ? [e]
        : replacements.has(e.id)
          ? [replacements.get(e.id)!]
          : [],
    );
  }
  return { entities, removed, joined, changedIds: [...changed] };
}
