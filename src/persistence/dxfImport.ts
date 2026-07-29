import type { Unit } from '../app/projectTypes';
import { circleToRing } from '../geometry/circle';
import { normalizePolygon } from '../geometry/normalize';
import { nestRingsAsPolygons } from '../geometry/ringNesting';
import type { Point, PolygonGeometry, Ring } from '../geometry/types';

type DxfPair = {
  code: number;
  value: string;
};

type DxfGroup = {
  type: string;
  pairs: DxfPair[];
};

export type DxfSourceEntity =
  | 'LWPOLYLINE'
  | 'POLYLINE'
  | 'LINE'
  | 'ARC';

export type DxfPolylineGeometry = {
  points: Point[];
  kind: 'polyline' | 'arc';
  closed: false;
  layer: string;
  source: DxfSourceEntity;
};

export type DxfImportOptions = {
  /** Samples used for a complete circle (and proportionally for an arc). */
  curveSegments?: number;
  maxEntities?: number;
  maxVerticesPerEntity?: number;
};

export type DxfImportResult = {
  polygons: PolygonGeometry[];
  polylines: DxfPolylineGeometry[];
  unit: Unit | null;
  warnings: string[];
};

const INSUNITS: Partial<Record<number, Unit>> = {
  4: 'mm',
  5: 'cm',
  6: 'm',
};

const DEFAULT_MAX_ENTITIES = 20_000;
const DEFAULT_MAX_VERTICES = 100_000;

function limit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value!)));
}

function tokenize(text: string, warnings: string[]): DxfPair[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  if (lines.length % 2 !== 0) warnings.push('truncated-group-pair');

  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (!Number.isInteger(code)) {
      warnings.push('invalid-group-code');
      continue;
    }
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

function groupPairs(pairs: DxfPair[]): DxfGroup[] {
  const groups: DxfGroup[] = [];
  let current: DxfGroup | null = null;
  for (const pair of pairs) {
    if (pair.code === 0) {
      current = { type: pair.value.toUpperCase(), pairs: [] };
      groups.push(current);
    } else if (current) {
      current.pairs.push(pair);
    }
  }
  return groups;
}

function first(group: DxfGroup, code: number): string | undefined {
  return group.pairs.find((pair) => pair.code === code)?.value;
}

function number(group: DxfGroup, code: number): number | null {
  const raw = first(group, code);
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(group: DxfGroup, code: number, fallback = 0): number {
  const parsed = number(group, code);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function layerName(group: DxfGroup): string {
  return first(group, 8) || '0';
}

function pointFromCodes(
  group: DxfGroup,
  xCode: number,
  yCode: number,
): Point | null {
  const x = number(group, xCode);
  const y = number(group, yCode);
  return x === null || y === null ? null : { x, y };
}

function verticesFromPolylineGroup(
  group: DxfGroup,
  maxVertices: number,
  warnings: string[],
): Point[] {
  const xs = group.pairs.filter((pair) => pair.code === 10).map((pair) => Number(pair.value));
  const ys = group.pairs.filter((pair) => pair.code === 20).map((pair) => Number(pair.value));
  if (xs.length !== ys.length) {
    warnings.push('invalid-polyline-coordinate-pairs');
    return [];
  }
  if (xs.length > maxVertices) warnings.push('vertex-limit-exceeded');
  const count = Math.min(xs.length, maxVertices);
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
      warnings.push('invalid-coordinate');
      return [];
    }
    points.push({ x: xs[i], y: ys[i] });
  }
  return points;
}

function hasBulge(group: DxfGroup): boolean {
  return group.pairs.some(
    (pair) => pair.code === 42 && Number.isFinite(Number(pair.value)) && Number(pair.value) !== 0,
  );
}

function addPolyline(
  result: DxfImportResult,
  closedRings: Map<string, Ring[]>,
  points: Point[],
  closed: boolean,
  layer: string,
  source: 'LWPOLYLINE' | 'POLYLINE',
): void {
  if (closed) {
    const polygon = normalizePolygon({ outer: points, holes: [] });
    if (polygon) {
      const rings = closedRings.get(layer) ?? [];
      rings.push(polygon.outer);
      closedRings.set(layer, rings);
    } else result.warnings.push('invalid-closed-polyline');
    return;
  }
  if (points.length < 2) {
    result.warnings.push('invalid-open-polyline');
    return;
  }
  result.polylines.push({
    points,
    kind: 'polyline',
    closed: false,
    layer,
    source,
  });
}

function addLine(group: DxfGroup, result: DxfImportResult): void {
  const start = pointFromCodes(group, 10, 20);
  const end = pointFromCodes(group, 11, 21);
  if (!start || !end || (start.x === end.x && start.y === end.y)) {
    result.warnings.push('invalid-line');
    return;
  }
  result.polylines.push({
    points: [start, end],
    kind: 'polyline',
    closed: false,
    layer: layerName(group),
    source: 'LINE',
  });
}

function addCircle(
  group: DxfGroup,
  result: DxfImportResult,
  curveSegments: number,
): void {
  const center = pointFromCodes(group, 10, 20);
  const radius = number(group, 40);
  const ring = center && radius !== null
    ? circleToRing(center, radius, curveSegments)
    : [];
  const polygon = normalizePolygon({ outer: ring, holes: [] });
  if (polygon) result.polygons.push(polygon);
  else result.warnings.push('invalid-circle');
}

function addArc(
  group: DxfGroup,
  result: DxfImportResult,
  curveSegments: number,
): void {
  const center = pointFromCodes(group, 10, 20);
  const radius = number(group, 40);
  const startDeg = number(group, 50);
  const endDeg = number(group, 51);
  if (!center || radius === null || radius <= 0 || startDeg === null || endDeg === null) {
    result.warnings.push('invalid-arc');
    return;
  }
  const start = (startDeg * Math.PI) / 180;
  let sweep = (((endDeg - startDeg) % 360) + 360) % 360;
  if (sweep === 0) {
    result.warnings.push('invalid-arc');
    return;
  }
  const segmentCount = Math.max(1, Math.ceil((sweep / 360) * curveSegments));
  sweep = (sweep * Math.PI) / 180;
  const points: Point[] = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const angle = start + sweep * (i / segmentCount);
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  result.polylines.push({
    points,
    kind: 'arc',
    closed: false,
    layer: layerName(group),
    source: 'ARC',
  });
}

function readHeaderUnit(groups: DxfGroup[]): Unit | null {
  for (const group of groups) {
    if (
      group.type !== 'SECTION' ||
      first(group, 2)?.toUpperCase() !== 'HEADER'
    ) continue;
    for (let i = 0; i < group.pairs.length - 1; i += 1) {
      if (group.pairs[i].code !== 9 || group.pairs[i].value !== '$INSUNITS') continue;
      const value = Number(group.pairs[i + 1].value);
      if (group.pairs[i + 1].code === 70 && Number.isInteger(value)) {
        return INSUNITS[value] ?? null;
      }
    }
  }
  return null;
}

/**
 * Parse the conservative ASCII DXF subset emitted by dxfExport plus common
 * LINE/ARC/CIRCLE and legacy POLYLINE records. Unsupported records are skipped.
 */
export function importDxfString(
  dxfText: string,
  options: DxfImportOptions = {},
): DxfImportResult {
  const result: DxfImportResult = {
    polygons: [],
    polylines: [],
    unit: null,
    warnings: [],
  };
  if (typeof dxfText !== 'string' || dxfText.trim().length === 0) {
    result.warnings.push('invalid-dxf');
    return result;
  }

  const pairs = tokenize(dxfText, result.warnings);
  const groups = groupPairs(pairs);
  if (groups.length === 0) {
    result.warnings.push('invalid-dxf');
    return result;
  }
  result.unit = readHeaderUnit(groups);

  const curveSegments = limit(options.curveSegments, 64, 4096);
  const maxEntities = limit(options.maxEntities, DEFAULT_MAX_ENTITIES, 100_000);
  const maxVertices = limit(
    options.maxVerticesPerEntity,
    DEFAULT_MAX_VERTICES,
    1_000_000,
  );
  let inEntities = false;
  let entityCount = 0;
  const closedRings = new Map<string, Ring[]>();

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.type === 'SECTION') {
      inEntities = first(group, 2)?.toUpperCase() === 'ENTITIES';
      continue;
    }
    if (group.type === 'ENDSEC') {
      inEntities = false;
      continue;
    }
    if (!inEntities) continue;
    if (!['LWPOLYLINE', 'POLYLINE', 'LINE', 'ARC', 'CIRCLE'].includes(group.type)) {
      continue;
    }
    if (entityCount >= maxEntities) {
      result.warnings.push('entity-limit-exceeded');
      break;
    }
    entityCount += 1;

    if (group.type === 'LWPOLYLINE') {
      if (hasBulge(group)) result.warnings.push('unsupported-bulge');
      const points = verticesFromPolylineGroup(group, maxVertices, result.warnings);
      addPolyline(
        result,
        closedRings,
        points,
        (integer(group, 70) & 1) !== 0,
        layerName(group),
        'LWPOLYLINE',
      );
      continue;
    }

    if (group.type === 'POLYLINE') {
      const points: Point[] = [];
      let cursor = index + 1;
      for (; cursor < groups.length; cursor += 1) {
        const child = groups[cursor];
        if (child.type === 'SEQEND') break;
        if (child.type !== 'VERTEX') break;
        if (hasBulge(child)) result.warnings.push('unsupported-bulge');
        if (points.length >= maxVertices) {
          result.warnings.push('vertex-limit-exceeded');
          continue;
        }
        const point = pointFromCodes(child, 10, 20);
        if (point) points.push(point);
        else result.warnings.push('invalid-coordinate');
      }
      index = cursor < groups.length && groups[cursor].type === 'SEQEND'
        ? cursor
        : cursor - 1;
      addPolyline(
        result,
        closedRings,
        points,
        (integer(group, 70) & 1) !== 0,
        layerName(group),
        'POLYLINE',
      );
      continue;
    }

    if (group.type === 'LINE') addLine(group, result);
    else if (group.type === 'ARC') addArc(group, result, curveSegments);
    else addCircle(group, result, curveSegments);
  }

  if (!groups.some((group) => group.type === 'EOF')) {
    result.warnings.push('missing-eof');
  }
  for (const rings of closedRings.values()) {
    result.polygons.push(...nestRingsAsPolygons(rings));
  }
  return result;
}

export function dxfToPolygons(
  dxfText: string,
  options: DxfImportOptions = {},
): PolygonGeometry[] {
  return importDxfString(dxfText, options).polygons;
}

export function importDxfFile(
  file: File,
  options: DxfImportOptions = {},
): Promise<DxfImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(importDxfString(String(reader.result ?? ''), options));
    reader.onerror = () => resolve({
      polygons: [],
      polylines: [],
      unit: null,
      warnings: ['file-read-error'],
    });
    reader.readAsText(file);
  });
}
