import { makeId } from './idUtils';
import {
  DEFAULT_LINE_STYLE,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
  PROJECT_SCHEMA_VERSION,
  type Layer,
  type LinearEntity,
  type LinearEntityKind,
  type PolygonEntity,
  type Project,
} from './projectTypes';
import type { Point, PolygonGeometry } from '../geometry/types';

export function defaultLayer(): Layer {
  return {
    id: 'layer-default',
    name: 'Layer 1',
    visible: true,
    locked: false,
    color: '#3a8dde',
  };
}

export function createEmptyProject(): Project {
  const now = new Date().toISOString();
  return {
    id: makeId('project'),
    name: 'Untitled',
    version: PROJECT_SCHEMA_VERSION,
    unit: 'mm',
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    layers: [defaultLayer()],
    entities: [],
    groups: [],
    constraints: [],
  };
}

export function createPolygonEntity(
  geometry: PolygonGeometry,
  options: Partial<Pick<PolygonEntity, 'name' | 'layerId' | 'metadata'>> = {},
): PolygonEntity {
  return {
    id: makeId('poly'),
    type: 'polygon',
    name: options.name ?? 'Polygon',
    layerId: options.layerId ?? 'layer-default',
    geometry,
    style: { ...DEFAULT_STYLE },
    locked: false,
    visible: true,
    metadata: options.metadata,
  };
}

export function createLinearEntity(
  points: Point[],
  kind: LinearEntityKind,
  options: Partial<
    Pick<
      LinearEntity,
      | 'name'
      | 'layerId'
      | 'style'
      | 'label'
      | 'precision'
      | 'textHeight'
      | 'rotationDeg'
    >
  > = {},
): LinearEntity {
  const defaultNames: Record<LinearEntityKind, string> = {
    guide: 'Guide',
    polyline: 'Polyline',
    arc: 'Arc',
    'linear-dimension': 'Linear dimension',
    'angular-dimension': 'Angular dimension',
    annotation: 'Annotation',
  };
  return {
    id: makeId('line'),
    type: 'guide-line',
    name: options.name ?? defaultNames[kind],
    kind,
    layerId: options.layerId ?? 'layer-default',
    points: points.map((point) => ({ ...point })),
    label: options.label,
    precision: options.precision,
    textHeight: options.textHeight,
    rotationDeg: options.rotationDeg,
    style: { ...DEFAULT_LINE_STYLE, ...options.style },
    locked: false,
    visible: true,
  };
}

export type DimensionEntityOptions = Partial<
  Pick<
    LinearEntity,
    'name' | 'layerId' | 'style' | 'label' | 'precision' | 'textHeight'
  >
>;

export function createLinearDimensionEntity(
  measuredStart: Point,
  measuredEnd: Point,
  offset: number,
  options: DimensionEntityOptions = {},
): LinearEntity | null {
  const dx = measuredEnd.x - measuredStart.x;
  const dy = measuredEnd.y - measuredStart.y;
  const length = Math.hypot(dx, dy);
  if (
    !Number.isFinite(measuredStart.x) ||
    !Number.isFinite(measuredStart.y) ||
    !Number.isFinite(measuredEnd.x) ||
    !Number.isFinite(measuredEnd.y) ||
    !Number.isFinite(offset) ||
    !(length > 0)
  ) {
    return null;
  }
  const normalX = -dy / length;
  const normalY = dx / length;
  const anchor = {
    x: (measuredStart.x + measuredEnd.x) / 2 + normalX * offset,
    y: (measuredStart.y + measuredEnd.y) / 2 + normalY * offset,
  };
  return createLinearEntity(
    [measuredStart, measuredEnd, anchor],
    'linear-dimension',
    { precision: 2, textHeight: 2.5, ...options },
  );
}

export function createAngularDimensionEntity(
  center: Point,
  firstRayPoint: Point,
  secondRayPoint: Point,
  radius?: number,
  options: DimensionEntityOptions = {},
): LinearEntity | null {
  const startRadius = Math.hypot(
    firstRayPoint.x - center.x,
    firstRayPoint.y - center.y,
  );
  const endRadius = Math.hypot(
    secondRayPoint.x - center.x,
    secondRayPoint.y - center.y,
  );
  const resolvedRadius = radius ?? Math.min(startRadius, endRadius);
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(firstRayPoint.x) ||
    !Number.isFinite(firstRayPoint.y) ||
    !Number.isFinite(secondRayPoint.x) ||
    !Number.isFinite(secondRayPoint.y) ||
    !(startRadius > 0) ||
    !(endRadius > 0) ||
    !Number.isFinite(resolvedRadius) ||
    !(resolvedRadius > 0)
  ) {
    return null;
  }
  const startAngle = Math.atan2(
    firstRayPoint.y - center.y,
    firstRayPoint.x - center.x,
  );
  const radiusAnchor = {
    x: center.x + Math.cos(startAngle) * resolvedRadius,
    y: center.y + Math.sin(startAngle) * resolvedRadius,
  };
  return createLinearEntity(
    [center, firstRayPoint, secondRayPoint, radiusAnchor],
    'angular-dimension',
    { precision: 1, textHeight: 2.5, ...options },
  );
}

export type AnnotationEntityOptions = Partial<
  Pick<
    LinearEntity,
    'name' | 'layerId' | 'style' | 'textHeight' | 'rotationDeg'
  >
>;

export function createAnnotationEntity(
  insertionPoint: Point,
  label: string,
  options: AnnotationEntityOptions = {},
): LinearEntity | null {
  if (
    !Number.isFinite(insertionPoint.x) ||
    !Number.isFinite(insertionPoint.y) ||
    typeof label !== 'string' ||
    label.length === 0
  ) {
    return null;
  }
  return createLinearEntity(
    [insertionPoint],
    'annotation',
    { label, textHeight: 2.5, rotationDeg: 0, ...options },
  );
}
