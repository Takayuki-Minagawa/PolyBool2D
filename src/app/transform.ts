import type { Point } from '../geometry/types';
import type { ViewTransform } from './projectTypes';

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
