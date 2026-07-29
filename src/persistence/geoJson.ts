import type { PolygonEntity, Project } from '../app/projectTypes';
import { isEntityEffectivelyVisible } from '../app/layers';
import { normalizePolygon } from '../geometry/normalize';
import type { Point, PolygonGeometry, Ring } from '../geometry/types';
import { downloadText, timestamp } from './download';

export type GeoJsonProperties = Record<string, unknown> | null;

export type ImportedGeoJsonPolygon = {
  geometry: PolygonGeometry;
  properties: GeoJsonProperties;
  id?: string | number;
};

export type GeoJsonImportOptions = {
  maxPolygons?: number;
  maxPositions?: number;
};

export type GeoJsonImportResult = {
  polygons: PolygonGeometry[];
  features: ImportedGeoJsonPolygon[];
  warnings: string[];
};

export type GeoJsonExportFeature = {
  geometry: PolygonGeometry;
  properties?: GeoJsonProperties;
  id?: string | number;
};

export type GeoJsonExportOptions = {
  pretty?: boolean;
  /** Emit one MultiPolygon feature instead of one Polygon feature per item. */
  combine?: boolean;
};

const DEFAULT_MAX_POLYGONS = 20_000;
const DEFAULT_MAX_POSITIONS = 1_000_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value!)));
}

function pointFromPosition(position: unknown): Point | null {
  if (!Array.isArray(position) || position.length < 2) return null;
  const x = position[0];
  const y = position[1];
  return typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y)
    ? { x, y }
    : null;
}

type ImportState = {
  features: ImportedGeoJsonPolygon[];
  warnings: string[];
  positionCount: number;
  maxPolygons: number;
  maxPositions: number;
  stopped: boolean;
};

function readRing(value: unknown, state: ImportState): Ring | null {
  if (!Array.isArray(value)) return null;
  if (state.positionCount + value.length > state.maxPositions) {
    state.warnings.push('position-limit-exceeded');
    state.stopped = true;
    return null;
  }
  state.positionCount += value.length;
  const ring: Ring = [];
  for (const position of value) {
    const point = pointFromPosition(position);
    if (!point) return null;
    ring.push(point);
  }
  return ring;
}

function readPolygonCoordinates(
  coordinates: unknown,
  state: ImportState,
): PolygonGeometry | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  const rings: Ring[] = [];
  for (const coordinateRing of coordinates) {
    const ring = readRing(coordinateRing, state);
    if (!ring) return null;
    rings.push(ring);
  }
  return normalizePolygon({ outer: rings[0], holes: rings.slice(1) });
}

function addPolygon(
  geometry: PolygonGeometry,
  state: ImportState,
  properties: GeoJsonProperties,
  id: string | number | undefined,
): void {
  if (state.features.length >= state.maxPolygons) {
    if (!state.warnings.includes('polygon-limit-exceeded')) {
      state.warnings.push('polygon-limit-exceeded');
    }
    state.stopped = true;
    return;
  }
  state.features.push({ geometry, properties, id });
}

function parseGeometry(
  geometry: unknown,
  state: ImportState,
  properties: GeoJsonProperties,
  id: string | number | undefined,
): void {
  if (state.stopped) return;
  if (!isObject(geometry) || typeof geometry.type !== 'string') {
    state.warnings.push('invalid-geometry');
    return;
  }
  if (geometry.type === 'Polygon') {
    const polygon = readPolygonCoordinates(geometry.coordinates, state);
    if (polygon) addPolygon(polygon, state, properties, id);
    else if (!state.stopped) state.warnings.push('invalid-polygon');
    return;
  }
  if (geometry.type === 'MultiPolygon') {
    if (!Array.isArray(geometry.coordinates)) {
      state.warnings.push('invalid-multipolygon');
      return;
    }
    for (const coordinates of geometry.coordinates) {
      if (state.stopped) break;
      const polygon = readPolygonCoordinates(coordinates, state);
      if (polygon) addPolygon(polygon, state, properties, id);
      else if (!state.stopped) state.warnings.push('invalid-polygon');
    }
    return;
  }
  state.warnings.push('unsupported-geometry');
}

function parseRoot(value: unknown, state: ImportState): void {
  if (!isObject(value) || typeof value.type !== 'string') {
    state.warnings.push('invalid-geojson');
    return;
  }
  if (value.type === 'FeatureCollection') {
    if (!Array.isArray(value.features)) {
      state.warnings.push('invalid-feature-collection');
      return;
    }
    for (const feature of value.features) {
      if (state.stopped) break;
      if (!isObject(feature) || feature.type !== 'Feature') {
        state.warnings.push('invalid-feature');
        continue;
      }
      if (feature.geometry === null) continue;
      const properties = isObject(feature.properties)
        ? feature.properties
        : feature.properties === null || feature.properties === undefined
          ? null
          : null;
      if (
        feature.properties !== null &&
        feature.properties !== undefined &&
        !isObject(feature.properties)
      ) {
        state.warnings.push('invalid-properties');
      }
      const id = typeof feature.id === 'string' || typeof feature.id === 'number'
        ? feature.id
        : undefined;
      parseGeometry(feature.geometry, state, properties, id);
    }
    return;
  }
  if (value.type === 'Feature') {
    const properties = isObject(value.properties) ? value.properties : null;
    const id = typeof value.id === 'string' || typeof value.id === 'number'
      ? value.id
      : undefined;
    if (value.geometry !== null) parseGeometry(value.geometry, state, properties, id);
    return;
  }
  parseGeometry(value, state, null, undefined);
}

/** Parse RFC 7946 Polygon/MultiPolygon geometry without introducing GIS dependencies. */
export function importGeoJsonString(
  text: string,
  options: GeoJsonImportOptions = {},
): GeoJsonImportResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { polygons: [], features: [], warnings: ['invalid-json'] };
  }
  const state: ImportState = {
    features: [],
    warnings: [],
    positionCount: 0,
    maxPolygons: boundedInteger(options.maxPolygons, DEFAULT_MAX_POLYGONS, 100_000),
    maxPositions: boundedInteger(options.maxPositions, DEFAULT_MAX_POSITIONS, 10_000_000),
    stopped: false,
  };
  parseRoot(value, state);
  return {
    polygons: state.features.map((feature) => feature.geometry),
    features: state.features,
    warnings: state.warnings,
  };
}

export function geoJsonToPolygons(
  text: string,
  options: GeoJsonImportOptions = {},
): PolygonGeometry[] {
  return importGeoJsonString(text, options).polygons;
}

function closeRing(ring: Ring): number[][] {
  if (ring.length === 0) return [];
  const coordinates = ring.map((point) => [point.x, point.y]);
  coordinates.push([ring[0].x, ring[0].y]);
  return coordinates;
}

function polygonCoordinates(polygon: PolygonGeometry): number[][][] {
  const normalized = normalizePolygon(polygon);
  if (!normalized) return [];
  return [closeRing(normalized.outer), ...normalized.holes.map(closeRing)];
}

function normalizedExportFeatures(
  input: readonly PolygonGeometry[] | readonly GeoJsonExportFeature[],
): GeoJsonExportFeature[] {
  return input.flatMap((item) => {
    const feature = 'geometry' in item
      ? item
      : { geometry: item, properties: null };
    const geometry = normalizePolygon(feature.geometry);
    return geometry ? [{ ...feature, geometry }] : [];
  });
}

/** Build a standards-compliant FeatureCollection with explicitly closed rings. */
export function buildGeoJson(
  input: readonly PolygonGeometry[] | readonly GeoJsonExportFeature[],
  options: GeoJsonExportOptions = {},
): string {
  const features = normalizedExportFeatures(input);
  const geoJson = options.combine
    ? {
        type: 'FeatureCollection',
        features: features.length === 0
          ? []
          : [{
              type: 'Feature',
              properties: null,
              geometry: {
                type: 'MultiPolygon',
                coordinates: features.map((feature) => polygonCoordinates(feature.geometry)),
              },
            }],
      }
    : {
        type: 'FeatureCollection',
        features: features.map((feature) => ({
          type: 'Feature',
          ...(feature.id === undefined ? {} : { id: feature.id }),
          properties: feature.properties ?? null,
          geometry: {
            type: 'Polygon',
            coordinates: polygonCoordinates(feature.geometry),
          },
        })),
      };
  return JSON.stringify(geoJson, null, options.pretty === false ? undefined : 2);
}

function visiblePolygons(project: Project): PolygonEntity[] {
  return project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' && isEntityEffectivelyVisible(project, entity),
  );
}

export function buildProjectGeoJson(
  project: Project,
  options: GeoJsonExportOptions = {},
): string {
  return buildGeoJson(
    visiblePolygons(project).map((entity) => ({
      id: entity.id,
      properties: { name: entity.name, layerId: entity.layerId },
      geometry: entity.geometry,
    })),
    options,
  );
}

export function exportGeoJsonFile(
  project: Project,
  options: GeoJsonExportOptions = {},
): void {
  downloadText(
    buildProjectGeoJson(project, options),
    `cad-project-${timestamp()}.geojson`,
    'application/geo+json',
  );
}

export function importGeoJsonFile(
  file: File,
  options: GeoJsonImportOptions = {},
): Promise<GeoJsonImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(importGeoJsonString(String(reader.result ?? ''), options));
    reader.onerror = () => resolve({
      polygons: [],
      features: [],
      warnings: ['file-read-error'],
    });
    reader.readAsText(file);
  });
}
