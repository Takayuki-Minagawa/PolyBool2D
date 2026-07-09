import { nearestEdgePoint, nearestVertex, snapToGrid } from '../geometry/snap';
import type { Point } from '../geometry/types';
import type { Project, ViewTransform } from './projectTypes';

/**
 * Snap a world-space point against the project's polygons and grid,
 * honouring the per-project snap settings. Returns the input unchanged
 * when nothing is within tolerance.
 */
export function snapWorldPoint(
  world: Point,
  project: Project,
  view: ViewTransform,
): Point {
  const { settings } = project;
  if (!settings.snapEnabled) return world;
  const tolWorld = settings.snapTolerancePx / view.scale;

  const allVertices: Point[] = [];
  const allSegments: { a: Point; b: Point }[] = [];
  for (const e of project.entities) {
    if (e.type !== 'polygon') continue;
    for (const ring of [e.geometry.outer, ...e.geometry.holes]) {
      for (let i = 0; i < ring.length; i++) {
        allVertices.push(ring[i]);
        allSegments.push({ a: ring[i], b: ring[(i + 1) % ring.length] });
      }
    }
  }

  if (settings.snapToVertex) {
    const v = nearestVertex(world, allVertices);
    if (v && v.distance < tolWorld) return v.point;
  }
  if (settings.snapToEdge) {
    const e = nearestEdgePoint(world, allSegments);
    if (e) {
      if (e.midpointDistance < tolWorld) return e.midpoint;
      if (e.distance < tolWorld / 2) return e.point;
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
  return world;
}
