import type { Project, Unit } from '../app/projectTypes';
import { boundsForEntities, type Bounds } from '../app/transform';
import { isEntityEffectivelyVisible } from '../app/layers';

export type PrintLayout = {
  paper: 'A3' | 'A4';
  orientation: 'landscape' | 'portrait';
  scale: number;
  margin: number;
  origin: 'drawing' | 'custom';
  originX: number;
  originY: number;
  frame: boolean;
};
export const DEFAULT_PRINT_LAYOUT: PrintLayout = {
  paper: 'A3',
  orientation: 'landscape',
  scale: 50,
  margin: 0,
  origin: 'custom',
  originX: 0,
  originY: 0,
  frame: false,
};
export const millimetersPerUnit = (unit: Unit) =>
  unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1;
export function parsePrintLayout(raw: unknown): PrintLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const finite = (key: string, fallback: number, min: number, max: number) =>
    typeof v[key] === 'number' && Number.isFinite(v[key])
      ? Math.max(min, Math.min(max, v[key] as number))
      : fallback;
  return {
    paper: v.paper === 'A4' ? 'A4' : 'A3',
    orientation: v.orientation === 'portrait' ? 'portrait' : 'landscape',
    scale: finite('scale', 50, 0.01, 1_000_000),
    margin: finite('margin', 0, 0, 100),
    origin: v.origin === 'drawing' ? 'drawing' : 'custom',
    originX: finite('originX', 0, -1e12, 1e12),
    originY: finite('originY', 0, -1e12, 1e12),
    frame: v.frame === true,
  };
}
export function paperSize(layout: PrintLayout): [number, number] {
  const [short, long] = layout.paper === 'A3' ? [297, 420] : [210, 297];
  return layout.orientation === 'landscape' ? [long, short] : [short, long];
}
export function printBounds(project: Project, layout: PrintLayout): Bounds {
  const [width, height] = paperSize(layout);
  const factor = layout.scale / millimetersPerUnit(project.unit);
  const drawing = boundsForEntities(
    project.entities.filter((e) => isEntityEffectivelyVisible(project, e)),
  );
  const minX =
    layout.origin === 'drawing'
      ? (drawing?.minX ?? 0) - layout.margin * factor
      : layout.originX;
  const minY =
    layout.origin === 'drawing'
      ? (drawing?.minY ?? 0) - layout.margin * factor
      : layout.originY;
  return {
    minX,
    minY,
    maxX: minX + width * factor,
    maxY: minY + height * factor,
  };
}
export function clippedEntityCount(
  project: Project,
  layout: PrintLayout,
): number {
  const page = printBounds(project, layout);
  const inset =
    (layout.margin * layout.scale) / millimetersPerUnit(project.unit);
  return project.entities.filter((entity) => {
    if (
      !isEntityEffectivelyVisible(project, entity) ||
      (entity.type === 'guide-line' && entity.kind === 'guide')
    )
      return false;
    const b = boundsForEntities([entity]);
    const extra =
      entity.type === 'guide-line' &&
      ['annotation', 'linear-dimension', 'angular-dimension'].includes(
        entity.kind,
      )
        ? (entity.textHeight ?? 2.5) *
          Math.max(1, (entity.label ?? entity.name).length / 2)
        : entity.style.strokeWidth / 2;
    return (
      b &&
      (b.minX - extra < page.minX + inset ||
        b.minY - extra < page.minY + inset ||
        b.maxX + extra > page.maxX - inset ||
        b.maxY + extra > page.maxY - inset)
    );
  }).length;
}
