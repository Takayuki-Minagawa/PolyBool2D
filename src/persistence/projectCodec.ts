import type {
  Entity,
  Layer,
  LinearEntity,
  PolygonEntity,
  Project,
  ProjectSettings,
} from '../app/projectTypes';
import {
  APP_VERSION,
  DEFAULT_LINE_STYLE,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
} from '../app/projectTypes';
import type { EntityGroup } from '../app/groups';
import type { ParametricConstraint } from '../geometry/constraints';

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

type JsonObject = Record<string, unknown>;

export type ProjectMigration = {
  readonly toVersion: string;
  readonly migrate: (project: JsonObject) => JsonObject;
};

/**
 * Schema migrations are deliberately one-version-at-a-time. A file is never
 * treated as current merely because its version appears in an allow-list.
 */
export const MIGRATIONS: Readonly<Record<string, ProjectMigration>> = {
  '0.1.0': {
    toVersion: '0.2.0',
    migrate: (project) => {
      const settings = isObject(project.settings) ? { ...project.settings } : {};
      if (typeof settings.angleSnapEnabled !== 'boolean') {
        settings.angleSnapEnabled = DEFAULT_SETTINGS.angleSnapEnabled;
      }
      if (
        typeof settings.angleSnapIncrementDeg !== 'number' ||
        !Number.isFinite(settings.angleSnapIncrementDeg)
      ) {
        settings.angleSnapIncrementDeg = DEFAULT_SETTINGS.angleSnapIncrementDeg;
      }
      return { ...project, version: '0.2.0', settings };
    },
  },
  '0.2.0': {
    toVersion: APP_VERSION,
    migrate: (project) => ({
      ...project,
      version: APP_VERSION,
      groups: Array.isArray(project.groups) ? project.groups : [],
      constraints: Array.isArray(project.constraints) ? project.constraints : [],
    }),
  },
};

/** Versions for which a complete migration route to APP_VERSION is known. */
export const SUPPORTED_VERSIONS = new Set([...Object.keys(MIGRATIONS), APP_VERSION]);

export type ProjectDecodeFailureReason =
  | 'invalid-json'
  | 'invalid-root'
  | 'missing-version'
  | 'unsupported-version'
  | 'migration-failed'
  | 'invalid-project-metadata'
  | 'invalid-layers'
  | 'invalid-entities';

export type ProjectDecodeSuccess = {
  ok: true;
  project: Project;
  sourceVersion: string;
  migrations: ReadonlyArray<{ fromVersion: string; toVersion: string }>;
  discardedEntityCount: number;
  discardedEntities: ReadonlyArray<{
    index: number;
    reason: ProjectEntityDecodeFailureReason;
  }>;
};

export type ProjectEntityDecodeFailureReason =
  | 'invalid-entity'
  | 'invalid-polygon'
  | 'invalid-linear-entity'
  | 'unsupported-entity-type';

export type ProjectDecodeFailure = {
  ok: false;
  reason: ProjectDecodeFailureReason;
  version?: string;
};

export type ProjectDecodeResult = ProjectDecodeSuccess | ProjectDecodeFailure;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPoint(v: unknown): v is { x: number; y: number } {
  if (!isObject(v)) return false;
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

function isRing(v: unknown): v is { x: number; y: number }[] {
  return Array.isArray(v) && v.every(isPoint);
}

function isPolygonGeometry(
  v: unknown,
): v is { outer: { x: number; y: number }[]; holes: { x: number; y: number }[][] } {
  if (!isObject(v)) return false;
  if (!isRing(v.outer) || v.outer.length < 3) return false;
  if (!Array.isArray(v.holes)) return false;
  return v.holes.every((h) => isRing(h) && h.length >= 3);
}

function parseLayer(v: unknown): Layer | null {
  if (!isObject(v)) return null;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  return {
    id: v.id,
    name: v.name,
    visible: v.visible !== false,
    locked: v.locked === true,
    color:
      typeof v.color === 'string' && HEX_COLOR.test(v.color)
        ? v.color.toLowerCase()
        : '#3a8dde',
  };
}

const MAX_PRECISION = 12;
const MAX_GRID_SIZE = 1_000_000;
const MAX_SNAP_TOLERANCE_PX = 200;
const MAX_CIRCLE_SEGMENTS = 4096;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function parseSettings(v: unknown): ProjectSettings {
  if (!isObject(v)) return { ...DEFAULT_SETTINGS };
  const s: ProjectSettings = { ...DEFAULT_SETTINGS };
  if (isFiniteNumber(v.gridSize) && v.gridSize > 0) {
    s.gridSize = clamp(v.gridSize, 1, MAX_GRID_SIZE);
  }
  if (typeof v.snapToGrid === 'boolean') s.snapToGrid = v.snapToGrid;
  if (typeof v.snapToVertex === 'boolean') s.snapToVertex = v.snapToVertex;
  if (typeof v.snapToEdge === 'boolean') s.snapToEdge = v.snapToEdge;
  if (isFiniteNumber(v.snapTolerancePx) && v.snapTolerancePx > 0) {
    s.snapTolerancePx = clamp(v.snapTolerancePx, 1, MAX_SNAP_TOLERANCE_PX);
  }
  if (isFiniteNumber(v.areaPrecision) && v.areaPrecision >= 0) {
    s.areaPrecision = clamp(Math.floor(v.areaPrecision), 0, MAX_PRECISION);
  }
  if (isFiniteNumber(v.coordinatePrecision) && v.coordinatePrecision >= 0) {
    s.coordinatePrecision = clamp(Math.floor(v.coordinatePrecision), 0, MAX_PRECISION);
  }
  if (isFiniteNumber(v.circleSegments) && v.circleSegments >= 8) {
    s.circleSegments = clamp(Math.floor(v.circleSegments), 8, MAX_CIRCLE_SEGMENTS);
  }
  if (v.areaDisplayUnit === 'mm2' || v.areaDisplayUnit === 'cm2' || v.areaDisplayUnit === 'm2') {
    s.areaDisplayUnit = v.areaDisplayUnit;
  }
  if (typeof v.angleSnapEnabled === 'boolean') {
    s.angleSnapEnabled = v.angleSnapEnabled;
  }
  if (isFiniteNumber(v.angleSnapIncrementDeg) && v.angleSnapIncrementDeg > 0) {
    s.angleSnapIncrementDeg = clamp(v.angleSnapIncrementDeg, 1, 180);
  }
  return s;
}

function parseGroups(
  value: unknown,
  validEntityIds: ReadonlySet<string>,
): EntityGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const groups: EntityGroup[] = [];
  for (const candidate of value) {
    if (
      !isObject(candidate) ||
      typeof candidate.id !== 'string' ||
      seen.has(candidate.id) ||
      !Array.isArray(candidate.entityIds)
    ) {
      continue;
    }
    const entityIds = [...new Set(
      candidate.entityIds.filter(
        (id): id is string => typeof id === 'string' && validEntityIds.has(id),
      ),
    )];
    if (entityIds.length < 2) continue;
    seen.add(candidate.id);
    groups.push({
      id: candidate.id,
      name: typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name
        : 'Group',
      entityIds,
      locked: candidate.locked === true,
      visible: candidate.visible !== false,
    });
  }
  return groups;
}

function constraintId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseConstraint(value: unknown): ParametricConstraint | null {
  if (!isObject(value)) return null;
  const id = constraintId(value.id);
  if (!id || typeof value.kind !== 'string') return null;

  if (
    value.kind === 'length' ||
    value.kind === 'horizontal' ||
    value.kind === 'vertical'
  ) {
    const a = constraintId(value.a);
    const b = constraintId(value.b);
    if (!a || !b) return null;
    if (value.kind === 'length') {
      return isFiniteNumber(value.value) && value.value > 0
        ? { id, kind: 'length', a, b, value: value.value }
        : null;
    }
    return { id, kind: value.kind, a, b };
  }
  if (value.kind === 'angle') {
    const a = constraintId(value.a);
    const vertex = constraintId(value.vertex);
    const b = constraintId(value.b);
    return a && vertex && b && isFiniteNumber(value.valueRad)
      ? { id, kind: 'angle', a, vertex, b, valueRad: value.valueRad }
      : null;
  }
  if (value.kind === 'parallel' || value.kind === 'perpendicular') {
    const a1 = constraintId(value.a1);
    const a2 = constraintId(value.a2);
    const b1 = constraintId(value.b1);
    const b2 = constraintId(value.b2);
    return a1 && a2 && b1 && b2
      ? { id, kind: value.kind, a1, a2, b1, b2 }
      : null;
  }
  return null;
}

function parseConstraints(value: unknown): ParametricConstraint[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const constraints: ParametricConstraint[] = [];
  for (const candidate of value) {
    const constraint = parseConstraint(candidate);
    if (!constraint || seen.has(constraint.id)) continue;
    seen.add(constraint.id);
    constraints.push(constraint);
  }
  return constraints;
}

function parsePolygonEntity(v: Record<string, unknown>): PolygonEntity | null {
  if (typeof v.id !== 'string') return null;
  if (typeof v.name !== 'string') return null;
  if (typeof v.layerId !== 'string') return null;
  if (!isPolygonGeometry(v.geometry)) return null;
  const style = isObject(v.style)
    ? {
        fill: typeof v.style.fill === 'string' ? v.style.fill : DEFAULT_STYLE.fill,
        stroke:
          typeof v.style.stroke === 'string' ? v.style.stroke : DEFAULT_STYLE.stroke,
        strokeWidth:
          isFiniteNumber(v.style.strokeWidth) && v.style.strokeWidth >= 0
            ? clamp(v.style.strokeWidth, 0, 1_000)
            : DEFAULT_STYLE.strokeWidth,
        opacity:
          isFiniteNumber(v.style.opacity)
            ? clamp(v.style.opacity, 0, 1)
            : DEFAULT_STYLE.opacity,
      }
    : { ...DEFAULT_STYLE };
  const ALLOWED_SHAPES = [
    'polygon',
    'rectangle',
    'circle',
    'ellipse',
    'boolean-result',
    'knife-result',
    'offset-result',
    'corner-result',
    'bounding-rectangle',
    'svg-import',
  ] as const;
  const ALLOWED_OPS = [
    'draw',
    'union',
    'difference',
    'intersection',
    'xor',
    'knife',
    'offset',
    'repair',
    'fillet',
    'chamfer',
    'minimum-bounds',
    'import',
  ] as const;
  type Shape = (typeof ALLOWED_SHAPES)[number];
  type Op = (typeof ALLOWED_OPS)[number];
  const metadata = isObject(v.metadata)
    ? {
        sourceShape:
          typeof v.metadata.sourceShape === 'string' &&
          (ALLOWED_SHAPES as readonly string[]).includes(v.metadata.sourceShape)
            ? (v.metadata.sourceShape as Shape)
            : undefined,
        createdByOperation:
          typeof v.metadata.createdByOperation === 'string' &&
          (ALLOWED_OPS as readonly string[]).includes(v.metadata.createdByOperation)
            ? (v.metadata.createdByOperation as Op)
            : undefined,
      }
    : undefined;

  return {
    id: v.id,
    type: 'polygon',
    name: v.name,
    layerId: v.layerId,
    geometry: {
      outer: v.geometry.outer.map((p) => ({ x: p.x, y: p.y })),
      holes: v.geometry.holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))),
    },
    style,
    locked: v.locked === true,
    visible: v.visible !== false,
    metadata,
  };
}

const LINEAR_ENTITY_KINDS = [
  'guide',
  'polyline',
  'arc',
  'linear-dimension',
  'angular-dimension',
  'annotation',
] as const;

function defaultLinearName(kind: LinearEntity['kind']): string {
  if (kind === 'guide') return 'Guide';
  if (kind === 'arc') return 'Arc';
  if (kind === 'linear-dimension') return 'Linear dimension';
  if (kind === 'angular-dimension') return 'Angular dimension';
  if (kind === 'annotation') return 'Annotation';
  return 'Polyline';
}

function parseLinearEntity(v: Record<string, unknown>): LinearEntity | null {
  if (typeof v.id !== 'string') return null;
  if (typeof v.layerId !== 'string') return null;
  const kind = typeof v.kind === 'string' &&
    (LINEAR_ENTITY_KINDS as readonly string[]).includes(v.kind)
    ? v.kind as LinearEntity['kind']
    : 'guide';
  if (!isRing(v.points)) return null;
  const minimumPoints = kind === 'annotation'
    ? 1
    : kind === 'linear-dimension' || kind === 'angular-dimension'
      ? 3
      : 2;
  if (v.points.length < minimumPoints) return null;
  const label = typeof v.label === 'string'
    ? v.label
    : kind === 'annotation' && typeof v.name === 'string'
      ? v.name
      : undefined;
  if (kind === 'annotation' && (!label || label.length === 0)) return null;
  const style = isObject(v.style)
    ? {
        stroke:
          typeof v.style.stroke === 'string'
            ? v.style.stroke
            : DEFAULT_LINE_STYLE.stroke,
        strokeWidth: isFiniteNumber(v.style.strokeWidth) && v.style.strokeWidth >= 0
          ? clamp(v.style.strokeWidth, 0, 1_000)
          : DEFAULT_LINE_STYLE.strokeWidth,
        opacity: isFiniteNumber(v.style.opacity)
          ? clamp(v.style.opacity, 0, 1)
          : DEFAULT_LINE_STYLE.opacity,
      }
    : { ...DEFAULT_LINE_STYLE };
  return {
    id: v.id,
    type: 'guide-line',
    name: typeof v.name === 'string' ? v.name : defaultLinearName(kind),
    kind,
    layerId: v.layerId,
    points: v.points.map((p) => ({ x: p.x, y: p.y })),
    label,
    precision: isFiniteNumber(v.precision)
      ? clamp(Math.floor(v.precision), 0, MAX_PRECISION)
      : kind === 'linear-dimension'
        ? 2
        : kind === 'angular-dimension'
          ? 1
          : undefined,
    textHeight: isFiniteNumber(v.textHeight) && v.textHeight > 0
      ? clamp(v.textHeight, 0.01, 1_000_000)
      : kind === 'linear-dimension' ||
          kind === 'angular-dimension' ||
          kind === 'annotation'
        ? 2.5
        : undefined,
    rotationDeg: isFiniteNumber(v.rotationDeg)
      ? v.rotationDeg
      : kind === 'annotation'
        ? 0
        : undefined,
    style,
    locked: v.locked === true,
    visible: v.visible !== false,
  };
}

function parseEntity(
  v: unknown,
): { ok: true; entity: Entity } | {
  ok: false;
  reason: ProjectEntityDecodeFailureReason;
} {
  if (!isObject(v)) return { ok: false, reason: 'invalid-entity' };
  if (v.type === 'polygon') {
    const entity = parsePolygonEntity(v);
    return entity
      ? { ok: true, entity }
      : { ok: false, reason: 'invalid-polygon' };
  }
  // Keep the legacy on-disk discriminator while using LinearEntity as the
  // canonical TypeScript model name.
  if (v.type === 'guide-line') {
    const entity = parseLinearEntity(v);
    return entity
      ? { ok: true, entity }
      : { ok: false, reason: 'invalid-linear-entity' };
  }
  return { ok: false, reason: 'unsupported-entity-type' };
}

function runMigrations(
  project: JsonObject,
): {
  project: JsonObject;
  sourceVersion: string;
  migrations: Array<{ fromVersion: string; toVersion: string }>;
} | ProjectDecodeFailure {
  if (typeof project.version !== 'string') return { ok: false, reason: 'missing-version' };
  const sourceVersion = project.version;
  let current = project;
  const migrations: Array<{ fromVersion: string; toVersion: string }> = [];
  const visited = new Set<string>();

  while (current.version !== APP_VERSION) {
    const version = current.version;
    if (typeof version !== 'string') {
      return { ok: false, reason: 'migration-failed', version: sourceVersion };
    }
    if (visited.has(version)) {
      return { ok: false, reason: 'migration-failed', version };
    }
    visited.add(version);
    const migration = MIGRATIONS[version];
    if (!migration) return { ok: false, reason: 'unsupported-version', version };
    try {
      current = migration.migrate(current);
    } catch {
      return { ok: false, reason: 'migration-failed', version };
    }
    if (!isObject(current) || current.version !== migration.toVersion) {
      return { ok: false, reason: 'migration-failed', version };
    }
    migrations.push({ fromVersion: version, toVersion: migration.toVersion });
  }

  return { project: current, sourceVersion, migrations };
}

/** Decode a project with a stable, machine-readable failure reason. */
export function decodeProject(json: string): ProjectDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }

  if (!isObject(parsed)) return { ok: false, reason: 'invalid-root' };
  const migrated = runMigrations(parsed);
  if ('ok' in migrated) return migrated;
  const project = migrated.project;

  if (typeof project.id !== 'string') {
    return { ok: false, reason: 'invalid-project-metadata', version: migrated.sourceVersion };
  }
  if (typeof project.name !== 'string') {
    return { ok: false, reason: 'invalid-project-metadata', version: migrated.sourceVersion };
  }
  if (project.unit !== 'mm' && project.unit !== 'cm' && project.unit !== 'm') {
    return { ok: false, reason: 'invalid-project-metadata', version: migrated.sourceVersion };
  }
  if (typeof project.createdAt !== 'string' || typeof project.updatedAt !== 'string') {
    return { ok: false, reason: 'invalid-project-metadata', version: migrated.sourceVersion };
  }

  if (!Array.isArray(project.layers)) {
    return { ok: false, reason: 'invalid-layers', version: migrated.sourceVersion };
  }
  const layers: Layer[] = [];
  for (const l of project.layers) {
    const parsedLayer = parseLayer(l);
    if (!parsedLayer) {
      return { ok: false, reason: 'invalid-layers', version: migrated.sourceVersion };
    }
    layers.push(parsedLayer);
  }
  if (layers.length === 0) {
    return { ok: false, reason: 'invalid-layers', version: migrated.sourceVersion };
  }

  if (!Array.isArray(project.entities)) {
    return { ok: false, reason: 'invalid-entities', version: migrated.sourceVersion };
  }
  const entities: Entity[] = [];
  const discardedEntities: Array<{
    index: number;
    reason: ProjectEntityDecodeFailureReason;
  }> = [];
  for (let index = 0; index < project.entities.length; index += 1) {
    const parsedEntity = parseEntity(project.entities[index]);
    // Keep the recoverable portion of a project when one entity is corrupt.
    // Project metadata/layers remain strict, but a malformed drawing item must
    // not make every otherwise valid entity inaccessible.
    if (parsedEntity.ok) entities.push(parsedEntity.entity);
    else discardedEntities.push({ index, reason: parsedEntity.reason });
  }
  const validEntityIds = new Set(entities.map((entity) => entity.id));
  const groups = parseGroups(project.groups, validEntityIds);
  const constraints = parseConstraints(project.constraints);

  return {
    ok: true,
    project: {
      id: project.id,
      name: project.name,
      version: APP_VERSION,
      unit: project.unit,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      settings: parseSettings(project.settings),
      layers,
      entities,
      groups,
      constraints,
    },
    sourceVersion: migrated.sourceVersion,
    migrations: migrated.migrations,
    discardedEntityCount: discardedEntities.length,
    discardedEntities,
  };
}

/** Backwards-compatible nullable API used by existing persistence call sites. */
export function deserializeProject(json: string): Project | null {
  const result = decodeProject(json);
  return result.ok ? result.project : null;
}

/** Explicit alias for callers that prefer deserialize naming. */
export const deserializeProjectResult = decodeProject;
