import type { MultiPolygonGeometry, Point, PolygonGeometry, Ring } from './types';
import type { BBox } from './measure';
import {
  AREA_RELATIVE_TOLERANCE,
  isFinitePoint,
  isFiniteRing,
} from './numeric';

type RingIntegrals = {
  area: number;
  firstX: number;
  firstY: number;
  ix: number;
  iy: number;
  ixy: number;
};

export type SectionModulus = {
  /** Governing (smallest) elastic modulus about the horizontal centroidal axis. */
  x: number;
  /** Governing (smallest) elastic modulus about the vertical centroidal axis. */
  y: number;
  xPositive: number;
  xNegative: number;
  yPositive: number;
  yNegative: number;
};

export type RadiusOfGyration = {
  x: number;
  y: number;
  principalMax: number;
  principalMin: number;
};

export type PrincipalSectionProperties = {
  max: number;
  min: number;
  /** Counter-clockwise rotation of the maximum-inertia axis, in radians. */
  angleRad: number;
};

export type SectionProperties = {
  area: number;
  centroid: Point;
  /** Centroidal second moment about the horizontal x axis. */
  ix: number;
  /** Centroidal second moment about the vertical y axis. */
  iy: number;
  /** Centroidal product of inertia integral ∫x*y dA. */
  ixy: number;
  principal: PrincipalSectionProperties;
  sectionModulus: SectionModulus;
  radiusOfGyration: RadiusOfGyration;
  bounds: BBox;
};

const PRODUCT_INERTIA_RELATIVE_TOLERANCE = AREA_RELATIVE_TOLERANCE * 0.01;

function referencePoint(polygons: MultiPolygonGeometry): Point | null {
  for (const polygon of polygons) {
    if (polygon.outer.length > 0 && isFinitePoint(polygon.outer[0])) {
      return polygon.outer[0];
    }
  }
  return null;
}

function integrateRing(ring: Ring, origin: Point): RingIntegrals | null {
  if (ring.length < 3 || !isFiniteRing(ring)) return null;
  let twiceArea = 0;
  let firstX6 = 0;
  let firstY6 = 0;
  let ix12 = 0;
  let iy12 = 0;
  let ixy24 = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const x0 = current.x - origin.x;
    const y0 = current.y - origin.y;
    const x1 = next.x - origin.x;
    const y1 = next.y - origin.y;
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    firstX6 += (x0 + x1) * cross;
    firstY6 += (y0 + y1) * cross;
    ix12 += (y0 * y0 + y0 * y1 + y1 * y1) * cross;
    iy12 += (x0 * x0 + x0 * x1 + x1 * x1) * cross;
    ixy24 += (
      2 * x0 * y0 +
      x0 * y1 +
      x1 * y0 +
      2 * x1 * y1
    ) * cross;
  }

  const area = twiceArea / 2;
  if (!Number.isFinite(area) || area === 0) return null;
  return {
    area,
    firstX: firstX6 / 6,
    firstY: firstY6 / 6,
    ix: ix12 / 12,
    iy: iy12 / 12,
    ixy: ixy24 / 24,
  };
}

function addRing(
  totals: RingIntegrals,
  ring: Ring,
  desiredSign: 1 | -1,
  origin: Point,
): boolean {
  const values = integrateRing(ring, origin);
  if (!values) return false;
  const orientation = values.area > 0 ? 1 : -1;
  const factor = desiredSign / orientation;
  totals.area += values.area * factor;
  totals.firstX += values.firstX * factor;
  totals.firstY += values.firstY * factor;
  totals.ix += values.ix * factor;
  totals.iy += values.iy * factor;
  totals.ixy += values.ixy * factor;
  return true;
}

function expandBounds(bounds: BBox | null, ring: Ring): BBox | null {
  let next = bounds;
  for (const point of ring) {
    if (!isFinitePoint(point)) return null;
    next = next
      ? {
          minX: Math.min(next.minX, point.x),
          minY: Math.min(next.minY, point.y),
          maxX: Math.max(next.maxX, point.x),
          maxY: Math.max(next.maxY, point.y),
        }
      : { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  }
  return next;
}

function nonNegative(value: number, scale: number): number {
  if (value >= 0) return value;
  return Math.abs(value) <= Math.max(1, scale) * AREA_RELATIVE_TOLERANCE
    ? 0
    : value;
}

function safeModulus(moment: number, distance: number): number {
  return distance > 0 ? moment / distance : Number.POSITIVE_INFINITY;
}

/**
 * Calculate area, centroidal second moments, section moduli, principal moments
 * and radii of gyration. Polygon holes are subtracted regardless of ring winding.
 */
export function calculateMultiPolygonSectionProperties(
  polygons: MultiPolygonGeometry,
): SectionProperties | null {
  if (polygons.length === 0) return null;
  const origin = referencePoint(polygons);
  if (!origin) return null;
  const totals: RingIntegrals = {
    area: 0,
    firstX: 0,
    firstY: 0,
    ix: 0,
    iy: 0,
    ixy: 0,
  };
  let bounds: BBox | null = null;

  for (const polygon of polygons) {
    if (!addRing(totals, polygon.outer, 1, origin)) return null;
    bounds = expandBounds(bounds, polygon.outer);
    if (!bounds) return null;
    for (const hole of polygon.holes) {
      if (!addRing(totals, hole, -1, origin)) return null;
    }
  }
  if (!(totals.area > 0) || !Number.isFinite(totals.area) || !bounds) return null;

  const localCentroidX = totals.firstX / totals.area;
  const localCentroidY = totals.firstY / totals.area;
  const centroid = {
    x: origin.x + localCentroidX,
    y: origin.y + localCentroidY,
  };
  const rawIx = totals.ix - totals.area * localCentroidY * localCentroidY;
  const rawIy = totals.iy - totals.area * localCentroidX * localCentroidX;
  const rawIxy = totals.ixy - totals.area * localCentroidX * localCentroidY;
  const scale = Math.max(Math.abs(totals.ix), Math.abs(totals.iy), 1);
  const ix = nonNegative(rawIx, scale);
  const iy = nonNegative(rawIy, scale);
  const ixy = Math.abs(rawIxy) <= scale * PRODUCT_INERTIA_RELATIVE_TOLERANCE
    ? 0
    : rawIxy;
  if (ix < 0 || iy < 0 || !Number.isFinite(ix) || !Number.isFinite(iy)) return null;

  const average = (ix + iy) / 2;
  const radius = Math.hypot((ix - iy) / 2, ixy);
  const principalMax = average + radius;
  const principalMin = nonNegative(average - radius, scale);
  if (principalMin < 0 || !Number.isFinite(principalMax)) return null;
  const principalAngle = radius === 0
    ? 0
    : 0.5 * Math.atan2(-2 * ixy, ix - iy);

  const xPositive = safeModulus(ix, bounds.maxY - centroid.y);
  const xNegative = safeModulus(ix, centroid.y - bounds.minY);
  const yPositive = safeModulus(iy, bounds.maxX - centroid.x);
  const yNegative = safeModulus(iy, centroid.x - bounds.minX);

  return {
    area: totals.area,
    centroid,
    ix,
    iy,
    ixy,
    principal: {
      max: principalMax,
      min: principalMin,
      angleRad: principalAngle,
    },
    sectionModulus: {
      x: Math.min(xPositive, xNegative),
      y: Math.min(yPositive, yNegative),
      xPositive,
      xNegative,
      yPositive,
      yNegative,
    },
    radiusOfGyration: {
      x: Math.sqrt(ix / totals.area),
      y: Math.sqrt(iy / totals.area),
      principalMax: Math.sqrt(principalMax / totals.area),
      principalMin: Math.sqrt(principalMin / totals.area),
    },
    bounds,
  };
}

export function calculateSectionProperties(
  polygon: PolygonGeometry,
): SectionProperties | null {
  return calculateMultiPolygonSectionProperties([polygon]);
}

/** Short alias suited to calculations and selectors. */
export const sectionProperties = calculateSectionProperties;
