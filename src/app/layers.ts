import type { Entity, Layer, Project } from './projectTypes';
import { expandGroupedSelection } from './groups';

export function layerForEntity(project: Project, entity: Entity): Layer | undefined {
  return project.layers.find((layer) => layer.id === entity.layerId);
}

export function isEntityEffectivelyVisible(project: Project, entity: Entity): boolean {
  const layer = layerForEntity(project, entity);
  const groupHidden = (project.groups ?? []).some(
    (group) => !group.visible && group.entityIds.includes(entity.id),
  );
  return entity.visible && layer?.visible !== false && !groupHidden;
}

export function isEntityEffectivelyLocked(project: Project, entity: Entity): boolean {
  const layer = layerForEntity(project, entity);
  const groupLocked = (project.groups ?? []).some(
    (group) => group.locked && group.entityIds.includes(entity.id),
  );
  return entity.locked || layer?.locked === true || groupLocked;
}

/** Expand visible groups, then retain entities writable under visibility and lock rules. */
export function unlockedEntityIds(
  project: Project,
  ids: Iterable<string>,
): string[] {
  const entitiesById = new Map(
    project.entities.map((entity) => [entity.id, entity]),
  );
  const editableSeeds = [...ids].filter((id) => {
    const entity = entitiesById.get(id);
    return (
      entity &&
      isEntityEffectivelyVisible(project, entity) &&
      !isEntityEffectivelyLocked(project, entity)
    );
  });
  return expandGroupedSelection(editableSeeds, project.groups ?? [])
    .filter((id) => {
      const entity = entitiesById.get(id);
      return (
        entity !== undefined &&
        isEntityEffectivelyVisible(project, entity) &&
        !isEntityEffectivelyLocked(project, entity)
      );
    });
}

export function uniqueLayerName(layers: Layer[], preferred = 'Layer'): string {
  const used = new Set(layers.map((layer) => layer.name.trim().toLocaleLowerCase()));
  if (!used.has(preferred.toLocaleLowerCase())) return preferred;
  let suffix = 2;
  while (used.has(`${preferred} ${suffix}`.toLocaleLowerCase())) suffix++;
  return `${preferred} ${suffix}`;
}

export function entitiesReassignedFromLayer(
  entities: Entity[],
  removedLayerId: string,
  fallbackLayerId: string,
): Entity[] {
  return entities.map((entity) =>
    entity.layerId === removedLayerId
      ? { ...entity, layerId: fallbackLayerId }
      : entity,
  );
}
