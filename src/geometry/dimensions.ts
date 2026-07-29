import type { Point } from './types';

export type LinearDimensionGeometry = {
  measuredStart: Point;
  measuredEnd: Point;
  dimensionStart: Point;
  dimensionEnd: Point;
  extensionStart: [Point, Point];
  extensionEnd: [Point, Point];
  labelPosition: Point;
  value: number;
  angleRad: number;
};

export type AngularDimensionGeometry = {
  center: Point;
  start: Point;
  end: Point;
  radius: number;
  startAngleRad: number;
  endAngleRad: number;
  sweepRad: number;
  arcPoints: Point[];
  labelPosition: Point;
  valueRad: number;
};

export type DimensionFormatOptions = {
  precision?: number;
  unit?: string;
  prefix?: string;
  suffix?: string;
};

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function clampPrecision(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 2;
  return Math.max(0, Math.min(12, Math.floor(value)));
}

export function formatDimension(
  value: number,
  options: DimensionFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(clampPrecision(options.precision));
  const number = fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
  const unit = options.unit ? ` ${options.unit}` : '';
  return `${options.prefix ?? ''}${number}${unit}${options.suffix ?? ''}`;
}

/**
 * Build an aligned linear dimension from two measured points and a signed
 * perpendicular offset. Extension lines include a small gap at the object.
 */
export function linearDimensionGeometry(
  start: Point,
  end: Point,
  offset: number,
  extensionGap = 2,
): LinearDimensionGeometry | null {
  if (
    !finitePoint(start) ||
    !finitePoint(end) ||
    !Number.isFinite(offset) ||
    !Number.isFinite(extensionGap)
  ) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const value = Math.hypot(dx, dy);
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(value) ||
    !(value > 0)
  ) return null;
  const nx = -dy / value;
  const ny = dx / value;
  const dimensionStart = {
    x: start.x + nx * offset,
    y: start.y + ny * offset,
  };
  const dimensionEnd = {
    x: end.x + nx * offset,
    y: end.y + ny * offset,
  };
  const gapDirection = Math.sign(offset || 1) * Math.max(0, extensionGap);
  const geometry: LinearDimensionGeometry = {
    measuredStart: { ...start },
    measuredEnd: { ...end },
    dimensionStart,
    dimensionEnd,
    extensionStart: [
      { x: start.x + nx * gapDirection, y: start.y + ny * gapDirection },
      dimensionStart,
    ],
    extensionEnd: [
      { x: end.x + nx * gapDirection, y: end.y + ny * gapDirection },
      dimensionEnd,
    ],
    labelPosition: {
      x: dimensionStart.x / 2 + dimensionEnd.x / 2,
      y: dimensionStart.y / 2 + dimensionEnd.y / 2,
    },
    value,
    angleRad: Math.atan2(dy, dx),
  };
  const generatedPoints = [
    geometry.dimensionStart,
    geometry.dimensionEnd,
    ...geometry.extensionStart,
    ...geometry.extensionEnd,
    geometry.labelPosition,
  ];
  return generatedPoints.every(finitePoint) ? geometry : null;
}

function positiveSweep(startAngle: number, endAngle: number): number {
  const full = Math.PI * 2;
  const sweep = (endAngle - startAngle) % full;
  return sweep < 0 ? sweep + full : sweep;
}

/**
 * Build an angular dimension arc. Angles are measured counter-clockwise in the
 * application's world coordinate system.
 */
export function angularDimensionGeometry(
  center: Point,
  start: Point,
  end: Point,
  radius?: number,
  segments = 24,
): AngularDimensionGeometry | null {
  if (
    !finitePoint(center) ||
    !finitePoint(start) ||
    !finitePoint(end) ||
    !Number.isFinite(segments)
  ) return null;
  const startDx = start.x - center.x;
  const startDy = start.y - center.y;
  const endDx = end.x - center.x;
  const endDy = end.y - center.y;
  if (
    !Number.isFinite(startDx) ||
    !Number.isFinite(startDy) ||
    !Number.isFinite(endDx) ||
    !Number.isFinite(endDy)
  ) return null;
  const startRadius = Math.hypot(startDx, startDy);
  const endRadius = Math.hypot(endDx, endDy);
  const resolvedRadius = radius ?? Math.min(startRadius, endRadius);
  if (
    !(startRadius > 0) ||
    !(endRadius > 0) ||
    !(resolvedRadius > 0) ||
    !Number.isFinite(startRadius) ||
    !Number.isFinite(endRadius) ||
    !Number.isFinite(resolvedRadius)
  ) return null;
  const startAngleRad = Math.atan2(startDy, startDx);
  const endAngleRad = Math.atan2(endDy, endDx);
  let sweepRad = positiveSweep(startAngleRad, endAngleRad);
  // Dimension the minor angle unless callers swap their defining rays.
  if (sweepRad > Math.PI) sweepRad -= Math.PI * 2;
  const count = Math.max(4, Math.min(256, Math.floor(segments)));
  const arcPoints: Point[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = startAngleRad + (sweepRad * index) / count;
    const point = {
      x: center.x + Math.cos(angle) * resolvedRadius,
      y: center.y + Math.sin(angle) * resolvedRadius,
    };
    if (!finitePoint(point)) return null;
    arcPoints.push(point);
  }
  const middleAngle = startAngleRad + sweepRad / 2;
  const labelPosition = {
    x: center.x + Math.cos(middleAngle) * resolvedRadius,
    y: center.y + Math.sin(middleAngle) * resolvedRadius,
  };
  if (!finitePoint(labelPosition)) return null;
  return {
    center: { ...center },
    start: { ...start },
    end: { ...end },
    radius: resolvedRadius,
    startAngleRad,
    endAngleRad,
    sweepRad,
    arcPoints,
    labelPosition,
    valueRad: Math.abs(sweepRad),
  };
}
