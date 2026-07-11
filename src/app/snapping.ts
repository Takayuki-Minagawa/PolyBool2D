import { nearestEdgePoint, nearestVertex, snapToGrid } from '../geometry/snap';
import type { Point } from '../geometry/types';
import type { Project, ViewTransform } from './projectTypes';
import { isEntityEffectivelyVisible } from './layers';
import { BBoxSpatialIndex } from '../geometry/spatialIndex';

type Segment = { a: Point; b: Point };
type SnapIndex = {
  vertices: BBoxSpatialIndex<Point>;
  segments: BBoxSpatialIndex<Segment>;
  infiniteGuides: Segment[];
};

const SNAP_INDEX_CACHE = new WeakMap<Project, SnapIndex>();

function segmentBox(segment: Segment) {
  return {
    minX: Math.min(segment.a.x, segment.b.x),
    minY: Math.min(segment.a.y, segment.b.y),
    maxX: Math.max(segment.a.x, segment.b.x),
    maxY: Math.max(segment.a.y, segment.b.y),
  };
}

function buildSnapIndex(project: Project): SnapIndex {
  const cached = SNAP_INDEX_CACHE.get(project);
  if (cached) return cached;
  const vertices: Point[] = [];
  const segments: Segment[] = [];
  const infiniteGuides: Segment[] = [];
  for (const entity of project.entities) {
    if (!isEntityEffectivelyVisible(project, entity)) continue;
    if (entity.type === 'polygon') {
      for (const ring of [entity.geometry.outer, ...entity.geometry.holes]) {
        for (let index = 0; index < ring.length; index++) {
          vertices.push(ring[index]);
          segments.push({ a: ring[index], b: ring[(index + 1) % ring.length] });
        }
      }
      continue;
    }
    vertices.push(...entity.points);
    if (entity.kind === 'guide' && entity.points.length >= 2) {
      infiniteGuides.push({ a: entity.points[0], b: entity.points[1] });
    } else {
      for (let index = 1; index < entity.points.length; index++) {
        segments.push({ a: entity.points[index - 1], b: entity.points[index] });
      }
    }
  }
  const index: SnapIndex = {
    vertices: new BBoxSpatialIndex(
      vertices.map((point) => ({
        bbox: { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y },
        value: point,
      })),
    ),
    segments: new BBoxSpatialIndex(
      segments.map((segment) => ({ bbox: segmentBox(segment), value: segment })),
    ),
    infiniteGuides,
  };
  SNAP_INDEX_CACHE.set(project, index);
  return index;
}

function nearestPointOnInfiniteLine(point: Point, segment: Segment): Point | null {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!(lengthSquared > 0)) return null;
  const t =
    ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) /
    lengthSquared;
  return { x: segment.a.x + t * dx, y: segment.a.y + t * dy };
}

export type SnapContext = {
  /** Previous drawing point used as the origin for angular constraints. */
  anchor?: Point;
  /** Quantise the segment direction to this increment in degrees. */
  angleIncrementDeg?: number;
  /** Force horizontal/vertical direction regardless of angleIncrementDeg. */
  ortho?: boolean;
};

export function constrainPointToAngle(point: Point, context: SnapContext = {}): Point {
  const { anchor } = context;
  if (!anchor) return point;
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !Number.isFinite(length)) return point;
  const incrementDeg = context.ortho ? 90 : context.angleIncrementDeg;
  if (!incrementDeg || !Number.isFinite(incrementDeg) || incrementDeg <= 0) {
    return point;
  }
  const step = (Math.min(180, incrementDeg) * Math.PI) / 180;
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / step) * step;
  return {
    x: anchor.x + Math.cos(snappedAngle) * length,
    y: anchor.y + Math.sin(snappedAngle) * length,
  };
}

/**
 * Snap a world-space point against the project's polygons and grid,
 * honouring the per-project snap settings. Returns the input unchanged
 * when nothing is within tolerance.
 */
export function snapWorldPoint(
  world: Point,
  project: Project,
  view: ViewTransform,
  context: SnapContext = {},
): Point {
  const { settings } = project;
  const tolWorld = settings.snapTolerancePx / view.scale;

  const index = buildSnapIndex(project);
  const query = {
    minX: world.x - tolWorld,
    minY: world.y - tolWorld,
    maxX: world.x + tolWorld,
    maxY: world.y + tolWorld,
  };
  const allVertices = index.vertices.queryValues(query);
  const allSegments = index.segments.queryValues(query);

  if (settings.snapToVertex) {
    const v = nearestVertex(world, allVertices);
    if (v && v.distance < tolWorld) {
      // Exact object snaps take precedence over angular constraints. Applying
      // angle quantisation here would move the point away from the vertex.
      return v.point;
    }
  }
  if (settings.snapToEdge) {
    const e = nearestEdgePoint(world, allSegments);
    if (e) {
      if (e.midpointDistance < tolWorld) {
        return e.midpoint;
      }
      if (e.distance < tolWorld / 2) {
        return e.point;
      }
    }
    let nearestGuide: { point: Point; distance: number } | null = null;
    for (const guide of index.infiniteGuides) {
      const point = nearestPointOnInfiniteLine(world, guide);
      if (!point) continue;
      const distance = Math.hypot(point.x - world.x, point.y - world.y);
      if (!nearestGuide || distance < nearestGuide.distance) {
        nearestGuide = { point, distance };
      }
    }
    if (nearestGuide && nearestGuide.distance < tolWorld / 2) {
      return nearestGuide.point;
    }
  }
  if (settings.snapToGrid) {
    const g = snapToGrid(world, settings.gridSize);
    const dx = g.x - world.x;
    const dy = g.y - world.y;
    if (Math.sqrt(dx * dx + dy * dy) * view.scale < settings.snapTolerancePx) {
      return g;
    }
  }
  return constrainPointToAngle(world, context);
}
