import type { LinearEntity, Unit } from '../app/projectTypes';
import {
  angularDimensionGeometry,
  formatDimension,
  linearDimensionGeometry,
  type AngularDimensionGeometry,
  type LinearDimensionGeometry,
} from '../geometry/dimensions';

export function resolveLinearDimension(
  entity: LinearEntity,
): LinearDimensionGeometry | null {
  if (entity.kind !== 'linear-dimension' || entity.points.length < 3) return null;
  const [start, end, anchor] = entity.points;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return null;
  const normalX = -dy / length;
  const normalY = dx / length;
  const midpointX = (start.x + end.x) / 2;
  const midpointY = (start.y + end.y) / 2;
  const offset =
    (anchor.x - midpointX) * normalX +
    (anchor.y - midpointY) * normalY;
  return linearDimensionGeometry(start, end, offset);
}

export function resolveAngularDimension(
  entity: LinearEntity,
): AngularDimensionGeometry | null {
  if (entity.kind !== 'angular-dimension' || entity.points.length < 3) return null;
  const [center, start, end, radiusAnchor] = entity.points;
  const radius = radiusAnchor
    ? Math.hypot(radiusAnchor.x - center.x, radiusAnchor.y - center.y)
    : undefined;
  return angularDimensionGeometry(center, start, end, radius);
}

export function dimensionLabel(
  entity: LinearEntity,
  unit: Unit,
  fallbackPrecision: number,
): string {
  if (entity.label !== undefined) return entity.label;
  const precision = entity.precision ?? fallbackPrecision;
  if (entity.kind === 'linear-dimension') {
    const geometry = resolveLinearDimension(entity);
    return geometry
      ? formatDimension(geometry.value, { precision, unit })
      : '';
  }
  if (entity.kind === 'angular-dimension') {
    const geometry = resolveAngularDimension(entity);
    return geometry
      ? formatDimension((geometry.valueRad * 180) / Math.PI, {
          precision,
          suffix: '°',
        })
      : '';
  }
  return entity.label ?? '';
}

export function entityTextHeight(entity: LinearEntity): number {
  return Number.isFinite(entity.textHeight) && entity.textHeight! > 0
    ? entity.textHeight!
    : 2.5;
}
