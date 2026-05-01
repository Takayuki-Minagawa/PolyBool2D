import { makeId } from './idUtils';
import {
  APP_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
  type Layer,
  type PolygonEntity,
  type Project,
} from './projectTypes';
import type { PolygonGeometry } from '../geometry/types';

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
    version: APP_VERSION,
    unit: 'mm',
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    layers: [defaultLayer()],
    entities: [],
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
