import { makeId } from './idUtils';

export type EntityGroup = {
  id: string;
  name: string;
  entityIds: string[];
  locked: boolean;
  visible: boolean;
};

export function createEntityGroup(
  entityIds: Iterable<string>,
  name = 'Group',
): EntityGroup | null {
  const uniqueIds = [...new Set(entityIds)].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (uniqueIds.length < 2) return null;
  return {
    id: makeId('group'),
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Group',
    entityIds: uniqueIds,
    locked: false,
    visible: true,
  };
}

export function sanitizeGroups(
  groups: readonly unknown[] | undefined,
  validEntityIds: ReadonlySet<string>,
): EntityGroup[] {
  if (!Array.isArray(groups)) return [];
  const seen = new Set<string>();
  return groups.flatMap((group) => {
    if (!group || typeof group !== 'object') return [];
    const candidate = group as Partial<EntityGroup>;
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.length === 0 ||
      seen.has(candidate.id) ||
      typeof candidate.name !== 'string' ||
      !Array.isArray(candidate.entityIds)
    ) return [];
    const entityIds = [...new Set(candidate.entityIds)].filter(
      (id): id is string =>
        typeof id === 'string' && validEntityIds.has(id),
    );
    if (entityIds.length < 2) return [];
    seen.add(candidate.id);
    return [{
      id: candidate.id,
      name: candidate.name.trim() || 'Group',
      entityIds,
      locked: candidate.locked === true,
      visible: candidate.visible !== false,
    }];
  });
}

/** Selecting one member of a group selects every extant member. */
export function expandGroupedSelection(
  selectedIds: Iterable<string>,
  groups: readonly EntityGroup[],
): string[] {
  const selected = new Set(selectedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (!group.entityIds.some((id) => selected.has(id))) continue;
      for (const id of group.entityIds) {
        if (!selected.has(id)) {
          selected.add(id);
          changed = true;
        }
      }
    }
  }
  return [...selected];
}

export function removeEntitiesFromGroups(
  groups: readonly EntityGroup[],
  removedIds: ReadonlySet<string>,
): EntityGroup[] {
  return groups.flatMap((group) => {
    const entityIds = group.entityIds.filter((id) => !removedIds.has(id));
    return entityIds.length >= 2 ? [{ ...group, entityIds }] : [];
  });
}
