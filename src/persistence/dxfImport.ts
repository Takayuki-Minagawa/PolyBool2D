import type { Unit } from '../app/projectTypes';
import { circleToRing } from '../geometry/circle';
import { isFinitePoint, pointsAlmostEqual } from '../geometry/numeric';
import { normalizePolygon } from '../geometry/normalize';
import { repairRingResult } from '../geometry/repair';
import { nestRingsAsPolygons } from '../geometry/ringNesting';
import type { Point, PolygonGeometry, Ring } from '../geometry/types';
import { validatePolygon } from '../geometry/validation';

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

type DxfBlock = {
  name: string;
  basePoint: Point;
  groups: DxfGroup[];
};

type DxfTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};

type DxfEntityBudget = {
  count: number;
  expansions: number;
  outputVertices: number;
  exceeded: boolean;
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
  /** Maximum vertices retained across every imported output geometry. */
  maxTotalVertices?: number;
  /** Reject source strings larger than this before allocating parser records. */
  maxInputCharacters?: number;
  /** Maximum raw DXF group pairs inspected before returning a partial result. */
  maxGroupPairs?: number;
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
const DEFAULT_MAX_TOTAL_VERTICES = 1_000_000;
const DEFAULT_MAX_INPUT_CHARACTERS = 64_000_000;
const MAX_INPUT_CHARACTERS = 100_000_000;
const MAX_GROUP_PAIRS = 4_000_000;
const MIN_GROUP_PAIR_ALLOWANCE = 1_024;
const GROUP_PAIRS_PER_ENTITY_ALLOWANCE = 16;
const GROUP_PAIRS_PER_VERTEX_ALLOWANCE = 3;
const MAX_BLOCK_DEPTH = 32;
const MAX_WARNINGS = 100;
const IDENTITY_TRANSFORM: DxfTransform = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
};
const SUPPORTED_ENTITY_TYPES = new Set([
  'LWPOLYLINE',
  'POLYLINE',
  'LINE',
  'ARC',
  'CIRCLE',
  'INSERT',
]);
const STRUCTURAL_ENTITY_TYPES = new Set([
  'ATTRIB',
  'ENDBLK',
  'EOF',
  'SEQEND',
  'VERTEX',
]);

function limit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value!)));
}

function groupPairLimit(
  maxEntities: number,
  maxVertices: number,
  maxTotalVertices: number,
): number {
  const retainedVertexCapacity = Math.min(
    maxTotalVertices,
    maxEntities * maxVertices,
  );
  return Math.min(
    MAX_GROUP_PAIRS,
    MIN_GROUP_PAIR_ALLOWANCE +
      maxEntities * GROUP_PAIRS_PER_ENTITY_ALLOWANCE +
      retainedVertexCapacity * GROUP_PAIRS_PER_VERTEX_ALLOWANCE,
  );
}

function readLine(
  text: string,
  offset: number,
): { value: string; nextOffset: number } | null {
  if (offset >= text.length) return null;
  let end = offset;
  while (
    end < text.length &&
    text.charCodeAt(end) !== 10 &&
    text.charCodeAt(end) !== 13
  ) {
    end += 1;
  }
  let nextOffset = end;
  if (nextOffset < text.length) {
    if (
      text.charCodeAt(nextOffset) === 13 &&
      text.charCodeAt(nextOffset + 1) === 10
    ) {
      nextOffset += 2;
    } else {
      nextOffset += 1;
    }
  }
  return { value: text.slice(offset, end), nextOffset };
}

function remainingIsOnlyLineBreaks(text: string, offset: number): boolean {
  if (
    offset >= text.length ||
    (text.charCodeAt(offset) !== 10 && text.charCodeAt(offset) !== 13)
  ) {
    return offset >= text.length;
  }
  for (let index = offset; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code !== 10 && code !== 13) return false;
  }
  return true;
}

function tokenize(
  text: string,
  warnings: string[],
  maxPairs: number,
): DxfPair[] {
  const pairs: DxfPair[] = [];
  let offset = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let inspectedPairs = 0;
  while (offset < text.length && !remainingIsOnlyLineBreaks(text, offset)) {
    if (inspectedPairs >= maxPairs) {
      addWarning(warnings, 'group-pair-limit-exceeded');
      break;
    }
    const codeLine = readLine(text, offset);
    if (!codeLine) break;
    const valueLine = readLine(text, codeLine.nextOffset);
    if (!valueLine) {
      addWarning(warnings, 'truncated-group-pair');
      break;
    }
    offset = valueLine.nextOffset;
    inspectedPairs += 1;
    const code = Number.parseInt(codeLine.value.trim(), 10);
    if (!Number.isInteger(code)) {
      addWarning(warnings, 'invalid-group-code');
      continue;
    }
    pairs.push({ code, value: valueLine.value.trim() });
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

function transformPoint(point: Point, transform: DxfTransform): Point {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.tx,
    y: transform.b * point.x + transform.d * point.y + transform.ty,
  };
}

function isFiniteTransform(transform: DxfTransform): boolean {
  return Object.values(transform).every(Number.isFinite);
}

function isValidOpenPointSequence(points: readonly Point[]): boolean {
  if (points.length < 2 || !points.every(isFinitePoint)) return false;
  return points.some(
    (point, index) =>
      index > 0 && !pointsAlmostEqual(points[index - 1], point),
  );
}

function composeTransforms(
  parent: DxfTransform,
  child: DxfTransform,
): DxfTransform {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  };
}

function effectiveLayer(group: DxfGroup, inheritedLayer?: string): string {
  const ownLayer = layerName(group);
  return ownLayer === '0' && inheritedLayer ? inheritedLayer : ownLayer;
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
  if (warnings.length > MAX_WARNINGS) {
    warnings.length = MAX_WARNINGS;
    if (!warnings.includes('warning-limit-exceeded')) {
      warnings[MAX_WARNINGS - 1] = 'warning-limit-exceeded';
    }
  }
}

function verticesFromLwPolylineGroup(
  group: DxfGroup,
  maxVertices: number,
  warnings: string[],
): { vertices: DxfVertex[]; exceeded: boolean } {
  const vertices: DxfVertex[] = [];
  let exceeded = false;
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
      exceeded = true;
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
  return { vertices, exceeded };
}

function tessellatePolyline(
  sourceVertices: DxfVertex[],
  declaredClosed: boolean,
  curveSegments: number,
  maxVertices: number,
  warnings: string[],
  autoCloseDuplicate = true,
): {
  points: Point[];
  closed: boolean;
  autoClosed: boolean;
  hitLimit: boolean;
} {
  let vertices = sourceVertices;
  let closed = declaredClosed;
  let autoClosed = false;
  if (
    autoCloseDuplicate &&
    vertices.length > 1 &&
    pointsAlmostEqual(vertices[0].point, vertices[vertices.length - 1].point)
  ) {
    vertices = vertices.slice(0, -1);
    closed = true;
    autoClosed = !declaredClosed;
  }
  if (vertices.length === 0) {
    return { points: [], closed, autoClosed, hitLimit: false };
  }

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
  return { points, closed, autoClosed, hitLimit };
}

function addPolyline(
  result: DxfImportResult,
  closedRings: Map<string, Ring[]>,
  vertices: DxfVertex[],
  declaredClosed: boolean,
  layer: string,
  source: 'LWPOLYLINE' | 'POLYLINE',
  transform: DxfTransform,
  curveSegments: number,
  maxVertices: number,
  budget: DxfEntityBudget,
  maxTotalVertices: number,
): void {
  const tessellated = tessellatePolyline(
    vertices,
    declaredClosed,
    curveSegments,
    maxVertices,
    result.warnings,
  );
  const { points, closed, autoClosed, hitLimit } = tessellated;
  if (hitLimit) return;
  const transformedPoints = points.map((point) =>
    transformPoint(point, transform)
  );
  if (closed) {
    const finite = transformedPoints.every(isFinitePoint);
    const polygon = finite
      ? normalizePolygon({ outer: transformedPoints, holes: [] })
      : null;
    let acceptedPolygons: PolygonGeometry[] =
      polygon && validatePolygon(polygon).valid ? [polygon] : [];
    let repairedClosedPolyline = false;
    if (acceptedPolygons.length === 0 && finite) {
      const repaired = repairRingResult(transformedPoints);
      if (
        repaired.ok &&
        repaired.value.length > 0 &&
        repaired.value.every((candidate) => validatePolygon(candidate).valid)
      ) {
        acceptedPolygons = repaired.value;
        repairedClosedPolyline = true;
      }
    }
    if (acceptedPolygons.length > 0) {
      const outputVertexCount = acceptedPolygons.reduce(
        (total, candidate) =>
          total +
          candidate.outer.length +
          candidate.holes.reduce(
            (holeTotal, hole) => holeTotal + hole.length,
            0,
          ),
        0,
      );
      if (outputVertexCount > maxVertices) {
        addWarning(result.warnings, 'vertex-limit-exceeded');
        return;
      }
      if (!consumeOutputVertices(
        budget,
        outputVertexCount,
        maxTotalVertices,
        result.warnings,
      )) return;
      const layerKey = layer.toUpperCase();
      const rings = closedRings.get(layerKey) ?? [];
      for (const candidate of acceptedPolygons) {
        rings.push(candidate.outer, ...candidate.holes);
      }
      closedRings.set(layerKey, rings);
      if (repairedClosedPolyline) {
        addWarning(result.warnings, 'repaired-closed-polyline');
      }
      return;
    }
    addWarning(result.warnings, 'invalid-closed-polyline');
    if (autoClosed) {
      const fallback = tessellatePolyline(
        vertices,
        false,
        curveSegments,
        maxVertices,
        result.warnings,
        false,
      );
      if (!fallback.hitLimit && fallback.points.length >= 2) {
        const transformedFallback = fallback.points.map((point) =>
          transformPoint(point, transform)
        );
        if (!isValidOpenPointSequence(transformedFallback)) {
          addWarning(result.warnings, 'invalid-open-polyline');
          return;
        }
        if (!consumeOutputVertices(
          budget,
          transformedFallback.length,
          maxTotalVertices,
          result.warnings,
        )) return;
        result.polylines.push({
          points: transformedFallback,
          kind: 'polyline',
          closed: false,
          layer,
          source,
        });
      }
    }
    return;
  }
  if (!isValidOpenPointSequence(transformedPoints)) {
    addWarning(result.warnings, 'invalid-open-polyline');
    return;
  }
  if (!consumeOutputVertices(
    budget,
    transformedPoints.length,
    maxTotalVertices,
    result.warnings,
  )) return;
  result.polylines.push({
    points: transformedPoints,
    kind: 'polyline',
    closed: false,
    layer,
    source,
  });
}

function addLine(
  group: DxfGroup,
  result: DxfImportResult,
  transform: DxfTransform,
  layer: string,
  maxVertices: number,
  budget: DxfEntityBudget,
  maxTotalVertices: number,
): void {
  if (maxVertices < 2) {
    addWarning(result.warnings, 'vertex-limit-exceeded');
    return;
  }
  const rawStart = pointFromCodes(group, 10, 20);
  const rawEnd = pointFromCodes(group, 11, 21);
  const start = rawStart ? transformPoint(rawStart, transform) : null;
  const end = rawEnd ? transformPoint(rawEnd, transform) : null;
  if (!start || !end || !isValidOpenPointSequence([start, end])) {
    addWarning(result.warnings, 'invalid-line');
    return;
  }
  if (!consumeOutputVertices(
    budget,
    2,
    maxTotalVertices,
    result.warnings,
  )) return;
  result.polylines.push({
    points: [start, end],
    kind: 'polyline',
    closed: false,
    layer,
    source: 'LINE',
  });
}

function addCircle(
  group: DxfGroup,
  result: DxfImportResult,
  closedRings: Map<string, Ring[]>,
  curveSegments: number,
  transform: DxfTransform,
  layer: string,
  maxVertices: number,
  budget: DxfEntityBudget,
  maxTotalVertices: number,
): void {
  const circleVertexCount = Math.max(8, Math.floor(curveSegments));
  if (circleVertexCount > maxVertices) {
    addWarning(result.warnings, 'vertex-limit-exceeded');
    return;
  }
  const center = pointFromCodes(group, 10, 20);
  const radius = number(group, 40);
  const ring = center && radius !== null && radius > 0
    ? circleToRing(center, radius, curveSegments)
        .map((point) => transformPoint(point, transform))
    : [];
  const polygon = ring.every(isFinitePoint)
    ? normalizePolygon({ outer: ring, holes: [] })
    : null;
  if (!polygon || !validatePolygon(polygon).valid) {
    addWarning(result.warnings, 'invalid-circle');
    return;
  }
  if (!consumeOutputVertices(
    budget,
    polygon.outer.length,
    maxTotalVertices,
    result.warnings,
  )) return;
  const layerKey = layer.toUpperCase();
  const rings = closedRings.get(layerKey) ?? [];
  rings.push(polygon.outer);
  closedRings.set(layerKey, rings);
}

function addArc(
  group: DxfGroup,
  result: DxfImportResult,
  curveSegments: number,
  transform: DxfTransform,
  layer: string,
  maxVertices: number,
  budget: DxfEntityBudget,
  maxTotalVertices: number,
): void {
  const center = pointFromCodes(group, 10, 20);
  const radius = number(group, 40);
  const startDeg = number(group, 50);
  const endDeg = number(group, 51);
  if (!center || radius === null || radius <= 0 || startDeg === null || endDeg === null) {
    addWarning(result.warnings, 'invalid-arc');
    return;
  }
  const start = (startDeg * Math.PI) / 180;
  const rawSweep = endDeg - startDeg;
  let sweep = ((rawSweep % 360) + 360) % 360;
  if (sweep === 0) {
    if (Math.abs(rawSweep) >= 360 - 1e-9) sweep = 360;
    else {
      addWarning(result.warnings, 'invalid-arc');
      return;
    }
  }
  const segmentCount = Math.max(1, Math.ceil((sweep / 360) * curveSegments));
  if (segmentCount + 1 > maxVertices) {
    addWarning(result.warnings, 'vertex-limit-exceeded');
    return;
  }
  sweep = (sweep * Math.PI) / 180;
  const points: Point[] = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const angle = start + sweep * (i / segmentCount);
    points.push(transformPoint({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }, transform));
  }
  if (!isValidOpenPointSequence(points)) {
    addWarning(result.warnings, 'invalid-arc');
    return;
  }
  if (!consumeOutputVertices(
    budget,
    points.length,
    maxTotalVertices,
    result.warnings,
  )) return;
  result.polylines.push({
    points,
    kind: 'arc',
    closed: false,
    layer,
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
        if (value === 0) return null;
        const unit = INSUNITS[value];
        if (!unit) addWarning(warnings, `unsupported-unit:${value}`);
        return unit ?? null;
      }
    }
  }
  return null;
}

function unitTransform(
  sourceUnit: Unit | null,
  targetUnit: Unit | undefined,
): DxfTransform {
  if (!sourceUnit || !targetUnit || sourceUnit === targetUnit) {
    return IDENTITY_TRANSFORM;
  }
  const scale =
    MILLIMETRES_PER_UNIT[sourceUnit] / MILLIMETRES_PER_UNIT[targetUnit];
  return {
    a: scale,
    b: 0,
    c: 0,
    d: scale,
    tx: 0,
    ty: 0,
  };
}

function collectSectionGroups(
  groups: DxfGroup[],
  sectionName: string,
): DxfGroup[] {
  const collected: DxfGroup[] = [];
  let inSection = false;
  for (const group of groups) {
    if (group.type === 'SECTION') {
      inSection = first(group, 2)?.toUpperCase() === sectionName;
      continue;
    }
    if (group.type === 'ENDSEC') {
      inSection = false;
      continue;
    }
    if (inSection) collected.push(group);
  }
  return collected;
}

function collectBlocks(
  groups: DxfGroup[],
  warnings: string[],
): Map<string, DxfBlock> {
  const blockGroups = collectSectionGroups(groups, 'BLOCKS');
  const blocks = new Map<string, DxfBlock>();
  for (let index = 0; index < blockGroups.length; index += 1) {
    const header = blockGroups[index];
    if (header.type !== 'BLOCK') continue;
    const name = (first(header, 2) ?? first(header, 3) ?? '').trim();
    const basePoint = pointFromCodes(header, 10, 20) ?? { x: 0, y: 0 };
    let end = index + 1;
    while (end < blockGroups.length && blockGroups[end].type !== 'ENDBLK') end += 1;
    if (!name) {
      addWarning(warnings, 'invalid-block');
    } else {
      const key = name.toUpperCase();
      if (blocks.has(key)) addWarning(warnings, `duplicate-block:${name}`);
      blocks.set(key, {
        name,
        basePoint,
        groups: blockGroups.slice(index + 1, end),
      });
    }
    index = end;
  }
  return blocks;
}

function consumeEntity(
  budget: DxfEntityBudget,
  maxEntities: number,
  warnings: string[],
): boolean {
  if (budget.count >= maxEntities) {
    budget.exceeded = true;
    addWarning(warnings, 'entity-limit-exceeded');
    return false;
  }
  budget.count += 1;
  return true;
}

function consumeExpansion(
  budget: DxfEntityBudget,
  maxEntities: number,
  warnings: string[],
): boolean {
  if (budget.expansions >= maxEntities) {
    budget.exceeded = true;
    addWarning(warnings, 'entity-limit-exceeded');
    return false;
  }
  budget.expansions += 1;
  return true;
}

function consumeOutputVertices(
  budget: DxfEntityBudget,
  vertexCount: number,
  maxTotalVertices: number,
  warnings: string[],
): boolean {
  if (budget.outputVertices + vertexCount > maxTotalVertices) {
    budget.exceeded = true;
    addWarning(warnings, 'vertex-limit-exceeded');
    return false;
  }
  budget.outputVertices += vertexCount;
  return true;
}

type DxfEntityContext = {
  result: DxfImportResult;
  closedRings: Map<string, Ring[]>;
  blocks: Map<string, DxfBlock>;
  curveSegments: number;
  maxEntities: number;
  maxVertices: number;
  maxTotalVertices: number;
  budget: DxfEntityBudget;
};

function optionalFiniteNumber(
  group: DxfGroup,
  code: number,
  fallback: number,
): number | null {
  if (first(group, code) === undefined) return fallback;
  return number(group, code);
}

function insertTransform(
  group: DxfGroup,
  block: DxfBlock,
  column: number,
  row: number,
): DxfTransform | null {
  const insertion = pointFromCodes(group, 10, 20);
  if (!insertion) return null;
  const xScale = optionalFiniteNumber(group, 41, 1);
  const yScale = optionalFiniteNumber(group, 42, 1);
  const rotationDegrees = optionalFiniteNumber(group, 50, 0);
  const columnSpacing = optionalFiniteNumber(group, 44, 0);
  const rowSpacing = optionalFiniteNumber(group, 45, 0);
  if (
    xScale === null ||
    yScale === null ||
    xScale === 0 ||
    yScale === 0 ||
    rotationDegrees === null ||
    columnSpacing === null ||
    rowSpacing === null
  ) return null;
  const rotation = (rotationDegrees * Math.PI) / 180;
  if (!Number.isFinite(rotation)) return null;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const a = cos * xScale;
  const b = sin * xScale;
  const c = -sin * yScale;
  const d = cos * yScale;
  const localOffset = {
    x: column * columnSpacing,
    y: row * rowSpacing,
  };
  const transform = {
    a,
    b,
    c,
    d,
    tx:
      insertion.x -
      a * block.basePoint.x -
      c * block.basePoint.y +
      cos * localOffset.x -
      sin * localOffset.y,
    ty:
      insertion.y -
      b * block.basePoint.x -
      d * block.basePoint.y +
      sin * localOffset.x +
      cos * localOffset.y,
  };
  return isFiniteTransform(transform) ? transform : null;
}

function processDxfEntities(
  groups: DxfGroup[],
  context: DxfEntityContext,
  transform: DxfTransform = IDENTITY_TRANSFORM,
  inheritedLayer?: string,
  blockStack: string[] = [],
): void {
  for (let index = 0; index < groups.length; index += 1) {
    if (context.budget.exceeded) return;
    const group = groups[index];
    if (STRUCTURAL_ENTITY_TYPES.has(group.type)) continue;
    if (!SUPPORTED_ENTITY_TYPES.has(group.type)) {
      addWarning(context.result.warnings, `unsupported-entity:${group.type}`);
      continue;
    }

    const layer = effectiveLayer(group, inheritedLayer);
    if (group.type === 'INSERT') {
      const blockName = (first(group, 2) ?? '').trim();
      const blockKey = blockName.toUpperCase();
      const block = context.blocks.get(blockKey);
      if (!blockName) {
        addWarning(context.result.warnings, 'invalid-insert');
        continue;
      }
      if (!block) {
        addWarning(context.result.warnings, `undefined-block:${blockName}`);
        continue;
      }
      if (
        blockStack.includes(blockKey) ||
        blockStack.length >= MAX_BLOCK_DEPTH
      ) {
        addWarning(context.result.warnings, `cyclic-block:${blockName}`);
        continue;
      }

      const columns = Math.max(1, integer(group, 70, 1));
      const rows = Math.max(1, integer(group, 71, 1));
      const requestedInstances = columns * rows;
      const instanceLimit = Math.min(requestedInstances, context.maxEntities);
      if (!Number.isSafeInteger(requestedInstances) || requestedInstances > instanceLimit) {
        addWarning(context.result.warnings, 'entity-limit-exceeded');
      }
      for (let instance = 0; instance < instanceLimit; instance += 1) {
        if (context.budget.exceeded) return;
        if (!consumeExpansion(
          context.budget,
          context.maxEntities,
          context.result.warnings,
        )) return;
        const column = instance % columns;
        const row = Math.floor(instance / columns);
        const localTransform = insertTransform(group, block, column, row);
        if (!localTransform) {
          addWarning(context.result.warnings, 'invalid-insert');
          break;
        }
        const composedTransform = composeTransforms(transform, localTransform);
        if (!isFiniteTransform(composedTransform)) {
          addWarning(context.result.warnings, 'invalid-insert');
          continue;
        }
        processDxfEntities(
          block.groups,
          context,
          composedTransform,
          layer,
          [...blockStack, blockKey],
        );
      }
      continue;
    }

    if (!consumeEntity(
      context.budget,
      context.maxEntities,
      context.result.warnings,
    )) return;

    if (group.type === 'LWPOLYLINE') {
      const parsed = verticesFromLwPolylineGroup(
        group,
        context.maxVertices,
        context.result.warnings,
      );
      if (parsed.exceeded) continue;
      addPolyline(
        context.result,
        context.closedRings,
        parsed.vertices.map((vertex) => ({
          ...vertex,
        })),
        (integer(group, 70) & 1) !== 0,
        layer,
        'LWPOLYLINE',
        transform,
        context.curveSegments,
        context.maxVertices,
        context.budget,
        context.maxTotalVertices,
      );
      continue;
    }

    if (group.type === 'POLYLINE') {
      const vertices: DxfVertex[] = [];
      let exceeded = false;
      let cursor = index + 1;
      for (; cursor < groups.length; cursor += 1) {
        const child = groups[cursor];
        if (child.type === 'SEQEND') break;
        if (child.type !== 'VERTEX') break;
        if (vertices.length >= context.maxVertices) {
          exceeded = true;
          addWarning(context.result.warnings, 'vertex-limit-exceeded');
          continue;
        }
        const point = pointFromCodes(child, 10, 20);
        const bulge = number(child, 42) ?? 0;
        if (point && Number.isFinite(bulge)) {
          vertices.push({
            point,
            bulge,
          });
        } else addWarning(context.result.warnings, 'invalid-coordinate');
      }
      index = cursor < groups.length && groups[cursor].type === 'SEQEND'
        ? cursor
        : cursor - 1;
      if (exceeded) continue;
      addPolyline(
        context.result,
        context.closedRings,
        vertices,
        (integer(group, 70) & 1) !== 0,
        layer,
        'POLYLINE',
        transform,
        context.curveSegments,
        context.maxVertices,
        context.budget,
        context.maxTotalVertices,
      );
      continue;
    }

    if (group.type === 'LINE') {
      addLine(
        group,
        context.result,
        transform,
        layer,
        context.maxVertices,
        context.budget,
        context.maxTotalVertices,
      );
    } else if (group.type === 'ARC') {
      addArc(
        group,
        context.result,
        context.curveSegments,
        transform,
        layer,
        context.maxVertices,
        context.budget,
        context.maxTotalVertices,
      );
    } else {
      addCircle(
        group,
        context.result,
        context.closedRings,
        context.curveSegments,
        transform,
        layer,
        context.maxVertices,
        context.budget,
        context.maxTotalVertices,
      );
    }
  }
}

/**
 * Parse the conservative ASCII DXF subset emitted by dxfExport plus common
 * LINE/ARC/CIRCLE, legacy POLYLINE, and BLOCK/INSERT records. Unsupported
 * records are reported and skipped.
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
  if (typeof dxfText !== 'string' || dxfText.length === 0) {
    result.warnings.push('invalid-dxf');
    return result;
  }

  const maxInputCharacters = limit(
    options.maxInputCharacters,
    DEFAULT_MAX_INPUT_CHARACTERS,
    MAX_INPUT_CHARACTERS,
  );
  if (dxfText.length > maxInputCharacters) {
    result.warnings.push('input-size-limit-exceeded');
    return result;
  }
  if (!/\S/.test(dxfText)) {
    result.warnings.push('invalid-dxf');
    return result;
  }

  const curveSegments = limit(options.curveSegments, 64, 4096);
  const maxEntities = limit(options.maxEntities, DEFAULT_MAX_ENTITIES, 100_000);
  const maxVertices = limit(
    options.maxVerticesPerEntity,
    DEFAULT_MAX_VERTICES,
    1_000_000,
  );
  const maxTotalVertices = limit(
    options.maxTotalVertices,
    DEFAULT_MAX_TOTAL_VERTICES,
    10_000_000,
  );
  const maxGroupPairs = limit(
    options.maxGroupPairs,
    groupPairLimit(maxEntities, maxVertices, maxTotalVertices),
    MAX_GROUP_PAIRS,
  );
  const pairs = tokenize(dxfText, result.warnings, maxGroupPairs);
  const groups = groupPairs(pairs);
  if (groups.length === 0) {
    addWarning(result.warnings, 'invalid-dxf');
    return result;
  }
  result.unit = readHeaderUnit(groups, result.warnings);

  const closedRings = new Map<string, Ring[]>();
  const blocks = collectBlocks(groups, result.warnings);
  processDxfEntities(
    collectSectionGroups(groups, 'ENTITIES'),
    {
      result,
      closedRings,
      blocks,
      curveSegments,
      maxEntities,
      maxVertices,
      maxTotalVertices,
      budget: {
        count: 0,
        expansions: 0,
        outputVertices: 0,
        exceeded: false,
      },
    },
    unitTransform(result.unit, options.targetUnit),
  );

  if (!groups.some((group) => group.type === 'EOF')) {
    addWarning(result.warnings, 'missing-eof');
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
  const maxInputCharacters = limit(
    options.maxInputCharacters,
    DEFAULT_MAX_INPUT_CHARACTERS,
    MAX_INPUT_CHARACTERS,
  );
  // The supported interchange format is ASCII DXF, so byte size is a safe
  // conservative bound on characters and can be checked before allocating a
  // second full-file string through FileReader.
  if (file.size > maxInputCharacters) {
    return Promise.resolve({
      polygons: [],
      polylines: [],
      unit: null,
      warnings: ['input-size-limit-exceeded'],
    });
  }
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
