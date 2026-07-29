import {
  booleanOpDWithPolyTree,
  ClipType,
  EndType,
  FillRule,
  inflatePathsD,
  JoinType,
  PolyPathD,
  PolyTreeD,
  type PathD,
  type PathsD,
  type PointD,
} from 'clipper2-ts';
import { multiPolygonArea, signedRingArea } from './area';
import {
  ensureHoleCW,
  ensureOuterCCW,
  normalizeMultiPolygon,
} from './normalize';
import { validatePolygon } from './validation';
import type {
  GeometryEngine,
  GeometryValidationIssue,
  GeometryValidationResult,
  MultiPolygonGeometry,
  PolygonGeometry,
  Ring,
} from './types';

/** ClipperD supports decimal precisions in the inclusive range [-8, 8]. */
const MAX_CLIPPER_PRECISION = 8;
const MIN_CLIPPER_PRECISION = -8;
const SAFE_INTEGER_MARGIN = 0.99;

export type Clipper2JoinType = 'round' | 'miter' | 'square';

export type Clipper2OffsetOptions = {
  join?: Clipper2JoinType;
  miterLimit?: number;
  /**
   * Maximum radial deviation in project units. Clipper2 chooses the number of
   * arc segments automatically from this value.
   */
  arcTolerance?: number;
};

function ringToPath(ring: Ring): PathD {
  return ring.map(({ x, y }) => ({ x, y }));
}

function multiPolygonToPaths(input: MultiPolygonGeometry): PathsD {
  return input.flatMap((polygon) => [
    ringToPath(polygon.outer),
    ...polygon.holes.map(ringToPath),
  ]);
}

function clipperPrecision(paths: PathsD, expansion = 0): number {
  let maxCoordinate = 0;
  for (const path of paths) {
    for (const point of path) {
      maxCoordinate = Math.max(
        maxCoordinate,
        Math.abs(point.x),
        Math.abs(point.y),
      );
    }
  }
  maxCoordinate += Math.abs(expansion);
  if (!Number.isFinite(maxCoordinate)) {
    throw new RangeError('Clipper2 coordinates must be finite');
  }
  if (maxCoordinate === 0) return MAX_CLIPPER_PRECISION;

  const safeScale = (Number.MAX_SAFE_INTEGER * SAFE_INTEGER_MARGIN)
    / maxCoordinate;
  const precision = Math.floor(Math.log10(safeScale));
  if (precision < MIN_CLIPPER_PRECISION) {
    throw new RangeError('Clipper2 coordinates exceed the supported range');
  }
  return Math.min(MAX_CLIPPER_PRECISION, precision);
}

function pathToRing(path: PathD): Ring {
  return path.map(({ x, y }: PointD) => ({ x, y }));
}

/**
 * Convert Clipper2's containment tree into the application's outer+holes
 * model. Islands nested inside holes become independent polygons, matching
 * GeoJSON/MultiPolygon semantics.
 */
function collectPolyPath(
  node: PolyPathD,
  output: MultiPolygonGeometry,
): void {
  if (!node.isHole && node.poly && node.poly.length >= 3) {
    const polygon: PolygonGeometry = {
      outer: pathToRing(node.poly),
      holes: [],
    };
    for (let index = 0; index < node.count; index += 1) {
      const child = node.child(index);
      if (child.isHole && child.poly && child.poly.length >= 3) {
        polygon.holes.push(pathToRing(child.poly));
      }
    }
    output.push(polygon);
  }

  for (let index = 0; index < node.count; index += 1) {
    collectPolyPath(node.child(index), output);
  }
}

function executeBoolean(
  operation: ClipType,
  subject: MultiPolygonGeometry,
  clip: MultiPolygonGeometry | null,
): MultiPolygonGeometry {
  const normalizedSubject = normalizeMultiPolygon(subject);
  if (normalizedSubject.length === 0) return [];
  const normalizedClip = clip ? normalizeMultiPolygon(clip) : null;
  const subjectPaths = multiPolygonToPaths(normalizedSubject);
  const clipPaths = normalizedClip
    ? multiPolygonToPaths(normalizedClip)
    : null;
  const precision = clipperPrecision([
    ...subjectPaths,
    ...(clipPaths ?? []),
  ]);
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(
    operation,
    subjectPaths,
    clipPaths,
    tree,
    FillRule.NonZero,
    precision,
  );
  const output: MultiPolygonGeometry = [];
  for (let index = 0; index < tree.count; index += 1) {
    collectPolyPath(tree.child(index), output);
  }
  return normalizeMultiPolygon(output);
}

/**
 * Resolve self-crossing paths with Clipper2's non-zero fill rule. Repair must
 * intentionally bypass normalizeMultiPolygon because a bow-tie has zero
 * signed area before its intersections are split.
 */
export function repairWithClipper2(
  input: MultiPolygonGeometry,
): MultiPolygonGeometry {
  if (input.length === 0) return [];
  const orientedInput = input.map((polygon) => ({
    outer:
      signedRingArea(polygon.outer) === 0
        ? polygon.outer
        : ensureOuterCCW(polygon.outer),
    holes: polygon.holes.map((hole) =>
      signedRingArea(hole) === 0 ? hole : ensureHoleCW(hole),
    ),
  }));
  const paths = multiPolygonToPaths(orientedInput);
  if (paths.length === 0) return [];
  const precision = clipperPrecision(paths);
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(
    ClipType.Union,
    paths,
    null,
    tree,
    FillRule.NonZero,
    precision,
  );
  const output: MultiPolygonGeometry = [];
  for (let index = 0; index < tree.count; index += 1) {
    collectPolyPath(tree.child(index), output);
  }
  return normalizeMultiPolygon(output);
}

function joinType(value: Clipper2JoinType | undefined): JoinType {
  switch (value) {
    case 'miter':
      return JoinType.Miter;
    case 'square':
      return JoinType.Square;
    default:
      return JoinType.Round;
  }
}

/**
 * Native Clipper2 polygon offset. Positive values expand material and negative
 * values contract it; correctly oriented holes move in the opposite direction.
 */
export function offsetWithClipper2(
  input: MultiPolygonGeometry,
  distance: number,
  options: Clipper2OffsetOptions = {},
): MultiPolygonGeometry {
  if (!Number.isFinite(distance) || input.length === 0) return [];
  const normalized = normalizeMultiPolygon(input);
  if (normalized.length === 0 || distance === 0) return normalized;
  const paths = multiPolygonToPaths(normalized);
  const resolvedMiterLimit = Number.isFinite(options.miterLimit)
    ? Math.max(1, options.miterLimit!)
    : 2;
  const maximumExpansion = Math.abs(distance) * (
    options.join === 'miter' ? resolvedMiterLimit : 1
  );
  const precision = clipperPrecision(paths, maximumExpansion);

  const inflated = inflatePathsD(
    paths,
    distance,
    joinType(options.join),
    EndType.Polygon,
    resolvedMiterLimit,
    precision,
    Number.isFinite(options.arcTolerance)
      ? Math.max(0, options.arcTolerance!)
      : 0,
  );
  if (inflated.length === 0) return [];

  // Rebuild containment (outer/hole relationships) after the offset.
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(
    ClipType.Union,
    inflated,
    null,
    tree,
    FillRule.NonZero,
    precision,
  );
  const output: MultiPolygonGeometry = [];
  for (let index = 0; index < tree.count; index += 1) {
    collectPolyPath(tree.child(index), output);
  }
  return normalizeMultiPolygon(output);
}

/**
 * GeometryEngine implementation backed by the actively maintained Clipper2
 * TypeScript port. The registry can swap this in without changing callers.
 */
export class Clipper2Engine implements GeometryEngine {
  union(input: MultiPolygonGeometry): MultiPolygonGeometry {
    if (input.length === 0) return [];
    return executeBoolean(ClipType.Union, input, null);
  }

  difference(
    subject: MultiPolygonGeometry,
    cutters: MultiPolygonGeometry,
  ): MultiPolygonGeometry {
    if (subject.length === 0) return [];
    if (cutters.length === 0) return normalizeMultiPolygon(subject);
    return executeBoolean(ClipType.Difference, subject, cutters);
  }

  intersection(input: MultiPolygonGeometry): MultiPolygonGeometry {
    if (input.length === 0) return [];
    let result: MultiPolygonGeometry = normalizeMultiPolygon([input[0]]);
    for (let index = 1; index < input.length && result.length > 0; index += 1) {
      result = executeBoolean(ClipType.Intersection, result, [input[index]]);
    }
    return result;
  }

  xor(input: MultiPolygonGeometry): MultiPolygonGeometry {
    if (input.length === 0) return [];
    let result: MultiPolygonGeometry = normalizeMultiPolygon([input[0]]);
    for (let index = 1; index < input.length; index += 1) {
      result = executeBoolean(ClipType.Xor, result, [input[index]]);
    }
    return result;
  }

  area(input: MultiPolygonGeometry): number {
    return multiPolygonArea(input);
  }

  normalize(input: MultiPolygonGeometry): MultiPolygonGeometry {
    return normalizeMultiPolygon(input);
  }

  validate(input: MultiPolygonGeometry): GeometryValidationResult {
    const issues = new Set<GeometryValidationIssue>();
    let valid = true;
    for (const polygon of input) {
      const result = validatePolygon(polygon);
      if (!result.valid) {
        valid = false;
        for (const issue of result.issues) issues.add(issue);
      }
    }
    return { valid, issues: [...issues] };
  }

  repair(input: MultiPolygonGeometry): MultiPolygonGeometry {
    return repairWithClipper2(input);
  }

  offset(
    input: MultiPolygonGeometry,
    distance: number,
    options: Clipper2OffsetOptions = {},
  ): MultiPolygonGeometry {
    return offsetWithClipper2(input, distance, options);
  }
}

export const clipper2Engine = new Clipper2Engine();
