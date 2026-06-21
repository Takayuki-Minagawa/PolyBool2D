import type { PolygonEntity, Project } from '../app/projectTypes';
import { polygonArea } from '../geometry/area';
import { polygonPerimeter } from '../geometry/measure';
import { convertArea, AREA_UNIT_LABEL } from '../app/units';
import { downloadText } from './svgExport';

function polygons(project: Project): PolygonEntity[] {
  return project.entities.filter((e): e is PolygonEntity => e.type === 'polygon');
}

function csvField(value: string): string {
  let v = value;
  // Neutralize spreadsheet formula injection for text fields, but leave
  // legitimate (possibly negative) numbers untouched.
  if (/^[=+\-@\t\r]/.test(v) && !/^[+-]?(\d|\.\d)/.test(v)) {
    v = `'${v}`;
  }
  return /[",\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function row(values: (string | number)[]): string {
  return values.map((v) => csvField(String(v))).join(',');
}

/** Per-polygon summary CSV: name, area (in the project's display unit), perimeter, vertices. */
export function buildAreaCsv(project: Project): string {
  const { unit, settings } = project;
  const areaUnit = settings.areaDisplayUnit;
  const areaDecimals = settings.areaPrecision;
  const coordDecimals = settings.coordinatePrecision;
  const lines: string[] = [
    row(['name', `area_${AREA_UNIT_LABEL[areaUnit]}`, `perimeter_${unit}`, 'vertices', 'holes']),
  ];
  for (const p of polygons(project)) {
    const area = convertArea(polygonArea(p.geometry), unit, areaUnit);
    const perimeter = polygonPerimeter(p.geometry);
    lines.push(
      row([
        p.name,
        area.toFixed(areaDecimals),
        perimeter.toFixed(coordDecimals),
        p.geometry.outer.length,
        p.geometry.holes.length,
      ]),
    );
  }
  return lines.join('\n') + '\n';
}

/** Vertex coordinate listing CSV: entity, ring, index, x, y. */
export function buildVertexCsv(project: Project): string {
  const coordDecimals = project.settings.coordinatePrecision;
  const lines: string[] = [row(['entity', 'ring', 'index', 'x', 'y'])];
  for (const p of polygons(project)) {
    p.geometry.outer.forEach((pt, i) => {
      lines.push(row([p.name, 'outer', i, pt.x.toFixed(coordDecimals), pt.y.toFixed(coordDecimals)]));
    });
    p.geometry.holes.forEach((hole, hi) => {
      hole.forEach((pt, i) => {
        lines.push(
          row([p.name, `hole${hi}`, i, pt.x.toFixed(coordDecimals), pt.y.toFixed(coordDecimals)]),
        );
      });
    });
  }
  return lines.join('\n') + '\n';
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 13);
}

export function exportAreaCsvFile(project: Project): void {
  downloadText(buildAreaCsv(project), `cad-areas-${timestamp()}.csv`, 'text/csv');
}

export function exportVertexCsvFile(project: Project): void {
  downloadText(buildVertexCsv(project), `cad-vertices-${timestamp()}.csv`, 'text/csv');
}
