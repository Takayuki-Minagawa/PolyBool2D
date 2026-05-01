import type { Point } from '../geometry/types';
import type { Entity, ViewTransform } from './projectTypes';

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function worldToScreen(p: Point, view: ViewTransform): Point {
  return {
    x: p.x * view.scale + view.offsetX,
    y: -p.y * view.scale + view.offsetY,
  };
}

export function screenToWorld(p: Point, view: ViewTransform): Point {
  return {
    x: (p.x - view.offsetX) / view.scale,
    y: -(p.y - view.offsetY) / view.scale,
  };
}

export function defaultView(width: number, height: number): ViewTransform {
  return {
    scale: 0.5,
    offsetX: width / 2,
    offsetY: height / 2,
  };
}

function expandBounds(bounds: Bounds | null, point: Point): Bounds {
  if (!bounds) {
    return {
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    };
  }
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

export function boundsForEntities(entities: Entity[]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const entity of entities) {
    if (entity.type === 'polygon') {
      for (const point of entity.geometry.outer) {
        bounds = expandBounds(bounds, point);
      }
      for (const hole of entity.geometry.holes) {
        for (const point of hole) {
          bounds = expandBounds(bounds, point);
        }
      }
    } else if (entity.type === 'guide-line') {
      for (const point of entity.points) {
        bounds = expandBounds(bounds, point);
      }
    }
  }
  return bounds;
}

export function fitBoundsToView(
  bounds: Bounds,
  width: number,
  height: number,
  padding = 48,
): ViewTransform {
  if (width <= 0 || height <= 0) return defaultView(width, height);

  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.max(
    0.0001,
    Math.min(
      1000,
      Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight),
    ),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    scale,
    offsetX: width / 2 - centerX * scale,
    offsetY: height / 2 + centerY * scale,
  };
}
