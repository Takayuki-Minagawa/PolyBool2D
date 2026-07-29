import type { Unit } from '../app/projectTypes';
import { circleToRing } from '../geometry/circle';
import { pointsAlmostEqual } from '../geometry/numeric';
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

type DxfVertex = {
  point: Point;
  /** Arc bulge from this vertex to the next vertex. */
  bulge: number;
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
  /** Convert parsed coordinates from $INSUNITS into this project unit. */
  targetUnit?: Unit;
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

const MILLIMETRES_PER_UNIT: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1_000,
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

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function verticesFromLwPolylineGroup(
  group: DxfGroup,
  maxVertices: number,
  warnings: string[],
): DxfVertex[] {
  const vertices: DxfVertex[] = [];
  let current: { x: number; y: number | null; bulge: number } | null = null;

  function finishVertex(): void {
    if (!current) return;
    if (
      !Number.isFinite(current.x) ||
      current.y === null ||
      !Number.isFinite(current.y) ||
      !Number.isFinite(current.bulge)
    ) {
      addWarning(warnings, 'invalid-coordinate');
    } else if (vertices.length < maxVertices) {
      vertices.push({
        point: { x: current.x, y: current.y },
        bulge: current.bulge,
      });
    } else {
      addWarning(warnings, 'vertex-limit-exceeded');
    }
    current = null;
  }

  for (const pair of group.pairs) {
    if (pair.code === 10) {
      finishVertex();
      current = { x: Number(pair.value), y: null, bulge: 0 };
    } else if (current && pair.code === 20 && current.y === null) {
      current.y = Number(pair.value);
    } else if (current && pair.code === 42) {
      current.bulge = Number(pair.value);
    }
  }
  finishVertex();
  return vertices;
}

function tessellatePolyline(
  sourceVertices: DxfVertex[],
  declaredClosed: boolean,
  curveSegments: number,
  maxVertices: number,
  warnings: string[],
): { points: Point[]; closed: boolean } {
  let vertices = sourceVertices;
  let closed = declaredClosed;
  if (
    vertices.length > 1 &&
    pointsAlmostEqual(vertices[0].point, vertices[vertices.length - 1].point)
  ) {
    vertices = vertices.slice(0, -1);
    closed = true;
  }
  if (vertices.length === 0) return { points: [], closed };

  const points: Point[] = [vertices[0].point];
  let hitLimit = false;
  const append = (point: Point): void => {
    if (hitLimit || pointsAlmostEqual(points[points.length - 1], point)) return;
    if (points.length >= maxVertices) {
      hitLimit = true;
      addWarning(warnings, 'vertex-limit-exceeded');
      return;
    }
    points.push(point);
  };
  const segmentCount = closed ? vertices.length : vertices.length - 1;

  for (let index = 0; index < segmentCount && !hitLimit; index += 1) {
    const vertex = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const isClosingEndpoint = closed && index === segmentCount - 1;
    const bulge = vertex.bulge;
    const dx = next.point.x - vertex.point.x;
    const dy = next.point.y - vertex.point.y;
    const chord = Math.hypot(dx, dy);
    if (chord === 0) continue;

    const sweep = 4 * Math.atan(bulge);
    if (!Number.isFinite(sweep) || Math.abs(sweep) < 1e-12) {
      if (!isClosingEndpoint) append(next.point);
      continue;
    }

    const centerOffset = chord * (1 - bulge * bulge) / (4 * bulge);
    const center = {
      x: (vertex.point.x + next.point.x) / 2 - (dy / chord) * centerOffset,
      y: (vertex.point.y + next.point.y) / 2 + (dx / chord) * centerOffset,
    };
    const startAngle = Math.atan2(
      vertex.point.y - center.y,
      vertex.point.x - center.x,
    );
    const radius = Math.hypot(
      vertex.point.x - center.x,
      vertex.point.y - center.y,
    );
    const samples = Math.max(
      1,
      Math.ceil(Math.abs(sweep) / (Math.PI * 2) * curveSegments),
    );
    for (let sample = 1; sample <= samples && !hitLimit; sample += 1) {
      if (sample === samples) {
        if (!isClosingEndpoint) append(next.point);
        continue;
      }
      const angle = startAngle + sweep * (sample / samples);
      append({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
  }
  return { points, closed };
}

function addPolyline(
  result: DxfImportResult,
  closedRings: Map<string, Ring[]>,
  vertices: DxfVertex[],
  declaredClosed: boolean,
  layer: string,
  source: 'LWPOLYLINE' | 'POLYLINE',
  curveSegments: number,
  maxVertices: number,
): void {
  const { points, closed } = tessellatePolyline(
    vertices,
    declaredClosed,
    curveSegments,
    maxVertices,
    result.warnings,
  );
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
  const rawSweep = endDeg - startDeg;
  let sweep = ((rawSweep % 360) + 360) % 360;
  if (sweep === 0) {
    if (Math.abs(rawSweep) >= 360 - 1e-9) sweep = 360;
    else {
      result.warnings.push('invalid-arc');
      return;
    }
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

function readHeaderUnit(groups: DxfGroup[], warnings: string[]): Unit | null {
  for (const group of groups) {
    if (
      group.type !== 'SECTION' ||
      first(group, 2)?.toUpperCase() !== 'HEADER'
    ) continue;
    for (let i = 0; i < group.pairs.length - 1; i += 1) {
      if (group.pairs[i].code !== 9 || group.pairs[i].value !== '$INSUNITS') continue;
      const value = Number(group.pairs[i + 1].value);
      if (group.pairs[i + 1].code === 70 && Number.isInteger(value)) {
        const unit = INSUNITS[value];
        if (!unit) addWarning(warnings, `unsupported-unit:${value}`);
        return unit ?? null;
      }
    }
  }
  return null;
}

function scaleImportResult(
  result: DxfImportResult,
  targetUnit: Unit | undefined,
): void {
  if (!result.unit || !targetUnit || result.unit === targetUnit) return;
  const scale = MILLIMETRES_PER_UNIT[result.unit] / MILLIMETRES_PER_UNIT[targetUnit];
  const scalePoint = (point: Point): Point => ({
    x: point.x * scale,
    y: point.y * scale,
  });
  result.polygons = result.polygons.map((polygon) => ({
    outer: polygon.outer.map(scalePoint),
    holes: polygon.holes.map((hole) => hole.map(scalePoint)),
  }));
  result.polylines = result.polylines.map((polyline) => ({
    ...polyline,
    points: polyline.points.map(scalePoint),
  }));
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
  result.unit = readHeaderUnit(groups, result.warnings);

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
    if (entityCount >= maxEntities) {
      result.warnings.push('entity-limit-exceeded');
      break;
    }
    entityCount += 1;
    if (!['LWPOLYLINE', 'POLYLINE', 'LINE', 'ARC', 'CIRCLE'].includes(group.type)) {
      addWarning(result.warnings, `unsupported-entity:${group.type}`);
      continue;
    }

    if (group.type === 'LWPOLYLINE') {
      const vertices = verticesFromLwPolylineGroup(
        group,
        maxVertices,
        result.warnings,
      );
      addPolyline(
        result,
        closedRings,
        vertices,
        (integer(group, 70) & 1) !== 0,
        layerName(group),
        'LWPOLYLINE',
        curveSegments,
        maxVertices,
      );
      continue;
    }

    if (group.type === 'POLYLINE') {
      const vertices: DxfVertex[] = [];
      let cursor = index + 1;
      for (; cursor < groups.length; cursor += 1) {
        const child = groups[cursor];
        if (child.type === 'SEQEND') break;
        if (child.type !== 'VERTEX') break;
        if (vertices.length >= maxVertices) {
          addWarning(result.warnings, 'vertex-limit-exceeded');
          continue;
        }
        const point = pointFromCodes(child, 10, 20);
        const bulge = number(child, 42) ?? 0;
        if (point && Number.isFinite(bulge)) vertices.push({ point, bulge });
        else result.warnings.push('invalid-coordinate');
      }
      index = cursor < groups.length && groups[cursor].type === 'SEQEND'
        ? cursor
        : cursor - 1;
      addPolyline(
        result,
        closedRings,
        vertices,
        (integer(group, 70) & 1) !== 0,
        layerName(group),
        'POLYLINE',
        curveSegments,
        maxVertices,
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
  scaleImportResult(result, options.targetUnit);
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
