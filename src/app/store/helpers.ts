import { polygonBBox, type BBox } from '../../geometry/measure';
import type { Point, PolygonGeometry, Ring } from '../../geometry/types';
import type {
  Entity,
  Layer,
  PolygonEntity,
  Project,
  VertexRef,
} from '../projectTypes';
import type { AlignMode } from './types';

export const HISTORY_LIMIT = 50;
export const DUPLICATE_OFFSET_FACTOR = 0.5;

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function touchProject(project: Project, entities: Entity[]): Project {
  return { ...project, entities, updatedAt: new Date().toISOString() };
}

export function touchProjectUpdatedAt(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function isPolygon(e: Entity): e is PolygonEntity {
  return e.type === 'polygon';
}

export function resolveDrawingLayer(
  project: Project,
  preferredLayerId?: string,
): Layer | null {
  return (
    project.layers.find(
      (layer) =>
        layer.id === preferredLayerId && layer.visible && !layer.locked,
    ) ??
    project.layers.find((layer) => layer.visible && !layer.locked) ??
    null
  );
}

export function mutateSelectedPolygons(
  project: Project,
  selectedIds: string[],
  mutate: (
    entity: PolygonEntity,
    selected: PolygonEntity[],
  ) => PolygonEntity | null,
): { entities: Entity[]; changed: boolean } {
  const selected = polygonsByIds(project, selectedIds);
  if (selected.length === 0) {
    return { entities: project.entities, changed: false };
  }
  const wanted = new Set(selected.map((entity) => entity.id));
  let changed = false;
  const entities = project.entities.map((entity) => {
    if (!isPolygon(entity) || !wanted.has(entity.id)) return entity;
    const next = mutate(entity, selected);
    if (!next || next === entity) return entity;
    changed = true;
    return next;
  });
  return { entities, changed };
}

export function polygonsByIds(project: Project, ids: string[]): PolygonEntity[] {
  const wanted = new Set(ids);
  return project.entities.filter(
    (e): e is PolygonEntity => isPolygon(e) && wanted.has(e.id),
  );
}

export function getPolygon(project: Project, id: string): PolygonEntity | undefined {
  return project.entities.find((e): e is PolygonEntity => isPolygon(e) && e.id === id);
}

export function replaceEntities(
  project: Project,
  removeIds: string[],
  added: PolygonEntity[],
): Project {
  const remove = new Set(removeIds);
  return touchProject(project, [
    ...project.entities.filter((e) => !remove.has(e.id)),
    ...added,
  ]);
}

export function applyTransientGeometryUpdates(
  project: Project,
  updates: Map<string, PolygonGeometry>,
): Project {
  if (updates.size === 0) return project;
  return touchProject(
    project,
    project.entities.map((e) => {
      const geometry = isPolygon(e) ? updates.get(e.id) : undefined;
      return geometry ? { ...e, geometry } : e;
    }),
  );
}

export function editRingGeometry(
  ent: PolygonEntity,
  ref: VertexRef,
  fn: (ring: Ring) => Ring | null,
): PolygonGeometry | 'too-few' | null {
  if (ref.ringType === 'outer') {
    const next = fn(ent.geometry.outer);
    if (next === null) return 'too-few';
    return { outer: next, holes: ent.geometry.holes };
  }
  const hi = ref.holeIndex ?? -1;
  if (hi < 0 || hi >= ent.geometry.holes.length) return null;
  const next = fn(ent.geometry.holes[hi]);
  if (next === null) return 'too-few';
  return {
    outer: ent.geometry.outer,
    holes: ent.geometry.holes.map((h, i) => (i === hi ? next : h)),
  };
}

export function alignOffset(box: BBox, group: BBox, mode: AlignMode): { dx: number; dy: number } {
  switch (mode) {
    case 'left':
      return { dx: group.minX - box.minX, dy: 0 };
    case 'right':
      return { dx: group.maxX - box.maxX, dy: 0 };
    case 'top':
      return { dx: 0, dy: group.maxY - box.maxY };
    case 'bottom':
      return { dx: 0, dy: group.minY - box.minY };
    case 'centerX':
      return {
        dx: (group.minX + group.maxX) / 2 - (box.minX + box.maxX) / 2,
        dy: 0,
      };
    case 'centerY':
      return {
        dx: 0,
        dy: (group.minY + group.maxY) / 2 - (box.minY + box.maxY) / 2,
      };
  }
}

export function polygonCenter(entity: PolygonEntity, axis: 'x' | 'y'): number | null {
  const box = polygonBBox(entity.geometry);
  if (!box) return null;
  return axis === 'x' ? (box.minX + box.maxX) / 2 : (box.minY + box.maxY) / 2;
}

export function collectPolygonPoints(polys: PolygonEntity[]): Point[] {
  const points: Point[] = [];
  for (const p of polys) {
    for (const ring of [p.geometry.outer, ...p.geometry.holes]) {
      for (const pt of ring) points.push(pt);
    }
  }
  return points;
}
