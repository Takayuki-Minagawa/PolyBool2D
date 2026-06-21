import type { AreaUnit, Unit } from './projectTypes';

/** Millimetres represented by one project coordinate unit. */
export const UNIT_TO_MM: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

export const UNIT_LABEL: Record<Unit, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
};

const AREA_UNIT_DIVISOR_FROM_MM2: Record<AreaUnit, number> = {
  mm2: 1,
  cm2: 100,
  m2: 1_000_000,
};

export const AREA_UNIT_LABEL: Record<AreaUnit, string> = {
  mm2: 'mm²',
  cm2: 'cm²',
  m2: 'm²',
};

export const AREA_UNITS: AreaUnit[] = ['mm2', 'cm2', 'm2'];

/**
 * Convert a geometric area (expressed in project-coordinate units squared)
 * into the requested display area unit.
 */
export function convertArea(areaCoordSq: number, unit: Unit, areaUnit: AreaUnit): number {
  const factor = UNIT_TO_MM[unit];
  const mm2 = areaCoordSq * factor * factor;
  return mm2 / AREA_UNIT_DIVISOR_FROM_MM2[areaUnit];
}

/** Format an area with its unit label, e.g. "1.250 m²". */
export function formatArea(
  areaCoordSq: number,
  unit: Unit,
  areaUnit: AreaUnit,
  decimals: number,
): string {
  const value = convertArea(areaCoordSq, unit, areaUnit);
  return `${value.toFixed(decimals)} ${AREA_UNIT_LABEL[areaUnit]}`;
}

/**
 * Format a length. Coordinates are already expressed in the project unit,
 * so the value is shown as-is with the unit label, e.g. "40.00 mm".
 */
export function formatLength(lengthCoord: number, unit: Unit, decimals: number): string {
  return `${lengthCoord.toFixed(decimals)} ${UNIT_LABEL[unit]}`;
}
