import type { Entity, Layer, Project } from './projectTypes';

export function layerForEntity(project: Project, entity: Entity): Layer | undefined {
  return project.layers.find((layer) => layer.id === entity.layerId);
}

export function isEntityEffectivelyVisible(project: Project, entity: Entity): boolean {
  const layer = layerForEntity(project, entity);
  return entity.visible && layer?.visible !== false;
}

export function isEntityEffectivelyLocked(project: Project, entity: Entity): boolean {
  const layer = layerForEntity(project, entity);
  return entity.locked || layer?.locked === true;
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
