import { circleToRing, rectangleToRing } from '../geometry/circle';
import { pointInRing } from '../geometry/intersections';
import { normalizePolygon, normalizeRing } from '../geometry/normalize';
import { signedRingArea } from '../geometry/area';
import type { Point, PolygonGeometry, Ring } from '../geometry/types';

const NUMBER_PATTERN = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const PATH_TOKEN_PATTERN = /[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_MAX_RINGS = 1000;
const NON_RENDERED_CONTAINERS = new Set(['defs', 'clippath', 'mask', 'marker', 'pattern', 'symbol']);

type SvgMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

const IDENTITY_MATRIX: SvgMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export type SvgImportOptions = {
  circleSegments?: number;
  curveSamples?: number;
  flipY?: boolean;
  maxElements?: number;
  /** Maximum total rings/subpaths accepted before nesting analysis. */
  maxRings?: number;
};

export type SvgImportResult = {
  polygons: PolygonGeometry[];
  warnings: string[];
};

function numberAttr(element: Element, name: string, fallback = 0): number {
  const value = Number.parseFloat(element.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function multiplyMatrix(left: SvgMatrix, right: SvgMatrix): SvgMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function translationMatrix(x: number, y: number): SvgMatrix {
  return { ...IDENTITY_MATRIX, e: x, f: y };
}

function parseTransform(value: string): SvgMatrix | null {
  if (value.trim().length === 0) return IDENTITY_MATRIX;
  const commandPattern = /([A-Za-z]+)\s*\(([^)]*)\)/g;
  let matrix = IDENTITY_MATRIX;
  let lastIndex = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = commandPattern.exec(value)) !== null) {
    if (value.slice(lastIndex, match.index).replace(/[\s,]/g, '').length > 0) return null;
    lastIndex = commandPattern.lastIndex;
    matched = true;
    const command = match[1].toLowerCase();
    const argumentText = match[2];
    if (argumentText.replace(NUMBER_PATTERN, '').replace(/[\s,]/g, '').length > 0) return null;
    const numbers = argumentText.match(NUMBER_PATTERN)?.map(Number) ?? [];
    if (numbers.some((number) => !Number.isFinite(number))) return null;
    let next: SvgMatrix;
    if (command === 'matrix' && numbers.length === 6) {
      next = {
        a: numbers[0],
        b: numbers[1],
        c: numbers[2],
        d: numbers[3],
        e: numbers[4],
        f: numbers[5],
      };
    } else if (command === 'translate' && (numbers.length === 1 || numbers.length === 2)) {
      next = translationMatrix(numbers[0], numbers[1] ?? 0);
    } else if (command === 'scale' && (numbers.length === 1 || numbers.length === 2)) {
      next = { a: numbers[0], b: 0, c: 0, d: numbers[1] ?? numbers[0], e: 0, f: 0 };
    } else if (command === 'rotate' && (numbers.length === 1 || numbers.length === 3)) {
      const radians = (numbers[0] * Math.PI) / 180;
      const rotation = {
        a: Math.cos(radians),
        b: Math.sin(radians),
        c: -Math.sin(radians),
        d: Math.cos(radians),
        e: 0,
        f: 0,
      };
      next = numbers.length === 3
        ? multiplyMatrix(
            multiplyMatrix(translationMatrix(numbers[1], numbers[2]), rotation),
            translationMatrix(-numbers[1], -numbers[2]),
          )
        : rotation;
    } else if (command === 'skewx' && numbers.length === 1) {
      next = { ...IDENTITY_MATRIX, c: Math.tan((numbers[0] * Math.PI) / 180) };
    } else if (command === 'skewy' && numbers.length === 1) {
      next = { ...IDENTITY_MATRIX, b: Math.tan((numbers[0] * Math.PI) / 180) };
    } else {
      return null;
    }
    matrix = multiplyMatrix(matrix, next);
  }
  if (!matched || value.slice(lastIndex).replace(/[\s,]/g, '').length > 0) return null;
  return matrix;
}

function transformForElement(element: Element): SvgMatrix | null {
  const ancestors: Element[] = [];
  let current: Element | null = element;
  while (current) {
    ancestors.unshift(current);
    if (current === element.ownerDocument.documentElement) break;
    current = current.parentElement;
  }
  let matrix = IDENTITY_MATRIX;
  for (const ancestor of ancestors) {
    const transform = parseTransform(ancestor.getAttribute('transform') ?? '');
    if (!transform) return null;
    matrix = multiplyMatrix(matrix, transform);
  }
  return matrix;
}

function isRenderedShape(element: Element): boolean {
  let current = element.parentElement;
  while (current) {
    if (NON_RENDERED_CONTAINERS.has(current.localName.toLowerCase())) return false;
    current = current.parentElement;
  }
  return true;
}

function mapPoint(point: Point, flipY: boolean, matrix: SvgMatrix): Point {
  const transformed = {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
  return { x: transformed.x, y: flipY ? -transformed.y : transformed.y };
}

function normalizedPolygon(
  outer: Ring,
  flipY: boolean,
  matrix: SvgMatrix,
): PolygonGeometry | null {
  return normalizePolygon({
    outer: outer.map((point) => mapPoint(point, flipY, matrix)),
    holes: [],
  });
}

function polygonPoints(value: string): Ring | null {
  const values = value.match(NUMBER_PATTERN)?.map(Number) ?? [];
  if (values.length < 6 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const ring: Ring = [];
  for (let i = 0; i < values.length; i += 2) ring.push({ x: values[i], y: values[i + 1] });
  return ring;
}

function isCommand(token: string): boolean {
  return /^[A-Za-z]$/.test(token);
}

type LinearPathParseResult = { rings: Ring[]; limitExceeded: boolean };

/** Parse polygonal path commands, including their relative lower-case forms. */
function parseLinearPath(pathData: string, maxRings: number): LinearPathParseResult | null {
  const tokens = pathData.match(PATH_TOKEN_PATTERN) ?? [];
  if (tokens.length === 0) return { rings: [], limitExceeded: false };
  if (tokens.some((token) => isCommand(token) && !/^[MmLlHhVvZz]$/.test(token))) return null;

  const rings: Ring[] = [];
  let index = 0;
  let command = '';
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let points: Ring | null = null;
  let limitExceeded = false;

  const readNumber = (): number | null => {
    if (index >= tokens.length || isCommand(tokens[index])) return null;
    const value = Number(tokens[index]);
    index += 1;
    return Number.isFinite(value) ? value : null;
  };
  const finish = () => {
    if (points && points.length >= 3) {
      if (rings.length >= maxRings) limitExceeded = true;
      else rings.push(points);
    }
    points = null;
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index];
      index += 1;
      if (command === 'Z' || command === 'z') {
        finish();
        if (limitExceeded) return { rings, limitExceeded: true };
        current = { ...start };
        command = '';
        continue;
      }
    }
    if (!command) return null;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper === 'M' || upper === 'L') {
      const x = readNumber();
      const y = readNumber();
      if (x === null || y === null) return null;
      const next = {
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
      };
      if (upper === 'M') {
        finish();
        if (limitExceeded) return { rings, limitExceeded: true };
        points = [next];
        start = { ...next };
        command = relative ? 'l' : 'L';
      } else {
        if (!points) return null;
        points.push(next);
      }
      current = next;
      continue;
    }

    if (upper === 'H') {
      const x = readNumber();
      if (x === null || !points) return null;
      current = { x: relative ? current.x + x : x, y: current.y };
      points.push({ ...current });
      continue;
    }

    if (upper === 'V') {
      const y = readNumber();
      if (y === null || !points) return null;
      current = { x: current.x, y: relative ? current.y + y : y };
      points.push({ ...current });
      continue;
    }

    return null;
  }
  finish();
  return { rings, limitExceeded };
}

type MeasurablePath = SVGPathElement & {
  getTotalLength: () => number;
  getPointAtLength: (distance: number) => DOMPoint;
};

function hasPathMeasurement(element: SVGPathElement): element is MeasurablePath {
  const candidate = element as Partial<MeasurablePath>;
  return typeof candidate.getTotalLength === 'function' && typeof candidate.getPointAtLength === 'function';
}

function sampleCurvedPath(pathData: string, samples: number): Ring | null {
  if (typeof document === 'undefined') return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  svg.appendChild(path);
  document.body?.appendChild(svg);
  try {
    if (!hasPathMeasurement(path)) return null;
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    const count = Math.max(8, Math.min(4096, Math.floor(samples)));
    const ring: Ring = [];
    for (let i = 0; i < count; i += 1) {
      const point = path.getPointAtLength((length * i) / count);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      ring.push({ x: point.x, y: point.y });
    }
    return ring;
  } catch {
    return null;
  } finally {
    svg.remove();
  }
}

function ringsToPolygons(rings: Ring[], flipY: boolean, matrix: SvgMatrix): PolygonGeometry[] {
  const normalized = rings
    .map((ring) => normalizeRing(ring.map((point) => mapPoint(point, flipY, matrix))))
    .filter((ring): ring is Ring => ring !== null)
    .sort((a, b) => Math.abs(signedRingArea(b)) - Math.abs(signedRingArea(a)));
  const nodes: { ring: Ring; parent: number | null; depth: number }[] = [];

  for (const ring of normalized) {
    let parent: number | null = null;
    let parentArea = Number.POSITIVE_INFINITY;
    for (let i = 0; i < nodes.length; i += 1) {
      const candidate = nodes[i];
      const area = Math.abs(signedRingArea(candidate.ring));
      if (area < parentArea && pointInRing(ring[0], candidate.ring)) {
        parent = i;
        parentArea = area;
      }
    }
    nodes.push({ ring, parent, depth: parent === null ? 0 : nodes[parent].depth + 1 });
  }

  const polygons = new Map<number, PolygonGeometry>();
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.depth % 2 === 0) {
      polygons.set(i, { outer: node.ring, holes: [] });
      continue;
    }
    let ancestor = node.parent;
    while (ancestor !== null && nodes[ancestor].depth % 2 !== 0) ancestor = nodes[ancestor].parent;
    if (ancestor !== null) polygons.get(ancestor)?.holes.push(node.ring);
  }

  return [...polygons.values()]
    .map(normalizePolygon)
    .filter((polygon): polygon is PolygonGeometry => polygon !== null);
}

export function importSvgString(svgText: string, options: SvgImportOptions = {}): SvgImportResult {
  const warnings: string[] = [];
  if (typeof DOMParser === 'undefined') return { polygons: [], warnings: ['dom-parser-unavailable'] };
  const xml = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (xml.getElementsByTagName('parsererror').length > 0 || xml.documentElement.localName !== 'svg') {
    return { polygons: [], warnings: ['invalid-svg'] };
  }

  const flipY = options.flipY !== false;
  const circleSegments = Math.max(8, Math.min(4096, Math.floor(options.circleSegments ?? 64)));
  const curveSamples = Math.max(8, Math.min(4096, Math.floor(options.curveSamples ?? 96)));
  const requestedMaxRings = options.maxRings;
  const maxRings = Number.isFinite(requestedMaxRings)
    ? Math.max(1, Math.min(10_000, Math.floor(requestedMaxRings!)))
    : DEFAULT_MAX_RINGS;
  const elements = [...xml.querySelectorAll('polygon, rect, circle, ellipse, path')]
    .filter(isRenderedShape);
  const limit = Math.max(1, Math.floor(options.maxElements ?? 5000));
  if (elements.length > limit) warnings.push('element-limit-exceeded');
  const polygons: PolygonGeometry[] = [];
  let ringCount = 0;

  for (const element of elements.slice(0, limit)) {
    if (ringCount >= maxRings) {
      warnings.push('ring-limit-exceeded');
      break;
    }
    const tag = element.localName.toLowerCase();
    const transform = transformForElement(element);
    if (!transform) {
      warnings.push('unsupported-transform');
      continue;
    }
    if (tag === 'polygon') {
      const ring = polygonPoints(element.getAttribute('points') ?? '');
      const polygon = ring ? normalizedPolygon(ring, flipY, transform) : null;
      if (polygon) {
        polygons.push(polygon);
        ringCount += 1;
      } else warnings.push('invalid-polygon');
      continue;
    }

    if (tag === 'rect') {
      const x = numberAttr(element, 'x');
      const y = numberAttr(element, 'y');
      const width = numberAttr(element, 'width', Number.NaN);
      const height = numberAttr(element, 'height', Number.NaN);
      const polygon = width > 0 && height > 0
        ? normalizedPolygon(
            rectangleToRing({ x, y }, { x: x + width, y: y + height }),
            flipY,
            transform,
          )
        : null;
      if (polygon) {
        polygons.push(polygon);
        ringCount += 1;
      } else warnings.push('invalid-rect');
      continue;
    }

    if (tag === 'circle') {
      const radius = numberAttr(element, 'r', Number.NaN);
      const ring = radius > 0
        ? circleToRing({ x: numberAttr(element, 'cx'), y: numberAttr(element, 'cy') }, radius, circleSegments)
        : null;
      const polygon = ring ? normalizedPolygon(ring, flipY, transform) : null;
      if (polygon) {
        polygons.push(polygon);
        ringCount += 1;
      } else warnings.push('invalid-circle');
      continue;
    }

    if (tag === 'ellipse') {
      const cx = numberAttr(element, 'cx');
      const cy = numberAttr(element, 'cy');
      const rx = numberAttr(element, 'rx', Number.NaN);
      const ry = numberAttr(element, 'ry', Number.NaN);
      const ring: Ring = [];
      if (rx > 0 && ry > 0) {
        for (let i = 0; i < circleSegments; i += 1) {
          const angle = (i / circleSegments) * Math.PI * 2;
          ring.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
        }
      }
      const polygon = normalizedPolygon(ring, flipY, transform);
      if (polygon) {
        polygons.push(polygon);
        ringCount += 1;
      } else warnings.push('invalid-ellipse');
      continue;
    }

    const pathData = element.getAttribute('d') ?? '';
    const linear = parseLinearPath(pathData, maxRings - ringCount);
    const moveCount = pathData.match(/[Mm]/g)?.length ?? 0;
    if (linear === null && moveCount > 1) {
      warnings.push('unsupported-path');
      continue;
    }
    if (linear?.limitExceeded) {
      warnings.push('ring-limit-exceeded');
      break;
    }
    const rings = linear
      ? linear.rings
      : [sampleCurvedPath(pathData, curveSamples)].filter((ring): ring is Ring => ring !== null);
    if (rings.length > maxRings - ringCount) {
      warnings.push('ring-limit-exceeded');
      break;
    }
    const imported = ringsToPolygons(rings, flipY, transform);
    if (imported.length > 0) {
      polygons.push(...imported);
      ringCount += rings.length;
    } else warnings.push(linear === null ? 'unsupported-path' : 'invalid-path');
  }

  return { polygons, warnings };
}

export function svgToPolygons(svgText: string, options: SvgImportOptions = {}): PolygonGeometry[] {
  return importSvgString(svgText, options).polygons;
}

export function importSvgFile(file: File, options: SvgImportOptions = {}): Promise<SvgImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(importSvgString(String(reader.result ?? ''), options));
    reader.onerror = () => resolve({ polygons: [], warnings: ['file-read-error'] });
    reader.readAsText(file);
  });
}
