import { boundsForEntities } from '../app/transform';
import { makeId } from '../app/idUtils';
import type { Entity } from '../app/projectTypes';

const STORAGE_KEY = 'polybool2d.entity-templates.v1';
const MAX_TEMPLATES = 100;

export type EntityTemplate = {
  id: string;
  name: string;
  createdAt: string;
  entities: Entity[];
};

function cloneEntity(entity: Entity): Entity {
  if (entity.type === 'polygon') {
    return {
      ...entity,
      geometry: {
        outer: entity.geometry.outer.map((point) => ({ ...point })),
        holes: entity.geometry.holes.map((hole) =>
          hole.map((point) => ({ ...point })),
        ),
      },
      style: { ...entity.style },
      metadata: entity.metadata ? { ...entity.metadata } : undefined,
    };
  }
  return {
    ...entity,
    points: entity.points.map((point) => ({ ...point })),
    style: { ...entity.style },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFinitePoint(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isPointArray(value: unknown, minimumLength: number): boolean {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.every(isFinitePoint)
  );
}

function isLineStyle(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.stroke === 'string' &&
    typeof value.strokeWidth === 'number' &&
    Number.isFinite(value.strokeWidth) &&
    value.strokeWidth >= 0 &&
    typeof value.opacity === 'number' &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1
  );
}

function isEntity(value: unknown): value is Entity {
  if (!isObject(value)) return false;
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.name !== 'string' ||
    typeof value.layerId !== 'string' ||
    typeof value.locked !== 'boolean' ||
    typeof value.visible !== 'boolean'
  ) return false;

  if (value.type === 'polygon') {
    if (
      !isObject(value.geometry) ||
      !isPointArray(value.geometry.outer, 3) ||
      !Array.isArray(value.geometry.holes) ||
      !value.geometry.holes.every((hole) => isPointArray(hole, 3)) ||
      !isObject(value.style) ||
      typeof value.style.fill !== 'string' ||
      !isLineStyle(value.style)
    ) return false;
    return true;
  }

  const kinds = new Set([
    'guide',
    'polyline',
    'arc',
    'linear-dimension',
    'angular-dimension',
    'annotation',
  ]);
  if (
    value.type !== 'guide-line' ||
    typeof value.kind !== 'string' ||
    !kinds.has(value.kind) ||
    !isLineStyle(value.style)
  ) return false;
  const minimumPoints = value.kind === 'annotation'
    ? 1
    : value.kind === 'linear-dimension' || value.kind === 'angular-dimension'
      ? 3
      : 2;
  if (!isPointArray(value.points, minimumPoints)) return false;
  if (value.label !== undefined && typeof value.label !== 'string') return false;
  for (const field of ['precision', 'textHeight', 'rotationDeg'] as const) {
    if (
      value[field] !== undefined &&
      (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
    ) return false;
  }
  return true;
}

function isTemplate(value: unknown): value is EntityTemplate {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'string' &&
    Array.isArray(value.entities) &&
    value.entities.length > 0 &&
    value.entities.every(isEntity)
  );
}

export function readEntityTemplates(
  storage?: Pick<Storage, 'getItem'>,
): EntityTemplate[] {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    if (!resolvedStorage) return [];
    const raw = resolvedStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isTemplate)
      .slice(0, MAX_TEMPLATES)
      .map((template) => ({
        ...template,
        entities: template.entities.map(cloneEntity),
      }));
  } catch {
    return [];
  }
}

export function createEntityTemplate(
  name: string,
  entities: readonly Entity[],
): EntityTemplate | null {
  if (
    typeof name !== 'string' ||
    entities.length === 0 ||
    !entities.every(isEntity)
  ) return null;
  return {
    id: makeId('template'),
    name: name.trim() || 'Template',
    createdAt: new Date().toISOString(),
    entities: entities.map(cloneEntity),
  };
}

export function writeEntityTemplates(
  templates: readonly EntityTemplate[],
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    if (!resolvedStorage) return false;
    resolvedStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        templates.filter(isTemplate).slice(0, MAX_TEMPLATES),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export function saveEntityTemplate(
  template: EntityTemplate,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  if (!isTemplate(template)) return false;
  const templates = readEntityTemplates(storage);
  const withoutCurrent = templates.filter((item) => item.id !== template.id);
  return writeEntityTemplates([template, ...withoutCurrent], storage);
}

export function deleteEntityTemplate(
  id: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  return writeEntityTemplates(
    readEntityTemplates(storage).filter((item) => item.id !== id),
    storage,
  );
}

function translateEntity(entity: Entity, dx: number, dy: number): Entity {
  const clone = cloneEntity(entity);
  clone.id = makeId(clone.type === 'polygon' ? 'poly' : 'line');
  if (clone.type === 'polygon') {
    clone.geometry.outer = clone.geometry.outer.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
    clone.geometry.holes = clone.geometry.holes.map((hole) =>
      hole.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    );
  } else {
    clone.points = clone.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
  }
  return clone;
}

/** Instantiate a template with fresh IDs, centered at the target coordinate. */
export function instantiateEntityTemplate(
  template: EntityTemplate,
  target: { x: number; y: number },
  layerId?: string,
): Entity[] {
  if (
    !isTemplate(template) ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y)
  ) return [];
  const bounds = boundsForEntities(template.entities);
  if (!bounds) return [];
  const centerX = bounds.minX / 2 + bounds.maxX / 2;
  const centerY = bounds.minY / 2 + bounds.maxY / 2;
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [];
  const instances = template.entities.map((source) => {
    const entity = translateEntity(source, dx, dy);
    if (layerId !== undefined) entity.layerId = layerId;
    return entity;
  });
  return instances.every(isEntity) ? instances : [];
}
