import type { Layer, LinearEntity, PolygonEntity, Project, Unit } from '../app/projectTypes';
import type { Point } from '../geometry/types';
import { downloadText, timestamp } from './download';
import { isEntityEffectivelyVisible } from '../app/layers';
import {
  dimensionLabel,
  entityTextHeight,
  resolveAngularDimension,
  resolveLinearDimension,
} from './dimensionExport';

const INSUNITS: Record<Unit, number> = {
  mm: 4,
  cm: 5,
  m: 6,
};

function dxfNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  if (Object.is(rounded, -0)) return '0';
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(9).replace(/\.?0+$/, '');
}

function dxfName(value: string): string {
  const clean = value
    .replace(/[<>/\\":;?*|=\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 255);
  return clean || '0';
}

function uniqueLayerNames(layers: Layer[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>(['0']);
  for (const layer of layers) {
    const base = dxfName(layer.name);
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      const tail = `_${suffix}`;
      name = `${base.slice(0, 255 - tail.length)}${tail}`;
      suffix += 1;
    }
    used.add(name);
    result.set(layer.id, name);
  }
  return result;
}

function pair(lines: string[], code: number, value: string | number): void {
  lines.push(String(code), String(value));
}

function appendPolyline(
  lines: string[],
  points: Point[],
  layerName: string,
  closed: boolean,
): void {
  if (points.length < (closed ? 3 : 2)) return;
  pair(lines, 0, 'LWPOLYLINE');
  pair(lines, 100, 'AcDbEntity');
  pair(lines, 8, layerName);
  pair(lines, 100, 'AcDbPolyline');
  pair(lines, 90, points.length);
  pair(lines, 70, closed ? 1 : 0);
  for (const point of points) {
    pair(lines, 10, dxfNumber(point.x));
    pair(lines, 20, dxfNumber(point.y));
  }
}

function appendLine(
  lines: string[],
  start: Point,
  end: Point,
  layerName: string,
): void {
  pair(lines, 0, 'LINE');
  pair(lines, 100, 'AcDbEntity');
  pair(lines, 8, layerName);
  pair(lines, 100, 'AcDbLine');
  pair(lines, 10, dxfNumber(start.x));
  pair(lines, 20, dxfNumber(start.y));
  pair(lines, 30, 0);
  pair(lines, 11, dxfNumber(end.x));
  pair(lines, 21, dxfNumber(end.y));
  pair(lines, 31, 0);
}

function dxfText(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 2048);
}

function appendText(
  lines: string[],
  text: string,
  position: Point,
  height: number,
  rotationDeg: number,
  layerName: string,
): void {
  const safeText = dxfText(text);
  if (!safeText) return;
  pair(lines, 0, 'TEXT');
  pair(lines, 100, 'AcDbEntity');
  pair(lines, 8, layerName);
  pair(lines, 100, 'AcDbText');
  pair(lines, 10, dxfNumber(position.x));
  pair(lines, 20, dxfNumber(position.y));
  pair(lines, 30, 0);
  pair(lines, 40, dxfNumber(height));
  pair(lines, 1, safeText);
  pair(lines, 50, dxfNumber(rotationDeg));
}

function polygons(project: Project): PolygonEntity[] {
  return project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' && isEntityEffectivelyVisible(project, entity),
  );
}

function linearEntities(project: Project): LinearEntity[] {
  return project.entities.filter(
    (entity): entity is LinearEntity =>
      entity.type === 'guide-line' &&
      entity.kind !== 'guide' &&
      isEntityEffectivelyVisible(project, entity),
  );
}

function appendLinearEntity(
  lines: string[],
  entity: LinearEntity,
  project: Project,
  layerName: string,
): void {
  if (entity.kind === 'annotation') {
    const insertionPoint = entity.points[0];
    if (!insertionPoint) return;
    appendText(
      lines,
      entity.label ?? entity.name,
      insertionPoint,
      entityTextHeight(entity),
      entity.rotationDeg ?? 0,
      layerName,
    );
    return;
  }
  if (entity.kind === 'linear-dimension') {
    const geometry = resolveLinearDimension(entity);
    if (!geometry) return;
    appendLine(lines, geometry.extensionStart[0], geometry.extensionStart[1], layerName);
    appendLine(lines, geometry.extensionEnd[0], geometry.extensionEnd[1], layerName);
    appendLine(lines, geometry.dimensionStart, geometry.dimensionEnd, layerName);
    appendText(
      lines,
      dimensionLabel(entity, project.unit, project.settings.coordinatePrecision),
      geometry.labelPosition,
      entityTextHeight(entity),
      (geometry.angleRad * 180) / Math.PI,
      layerName,
    );
    return;
  }
  if (entity.kind === 'angular-dimension') {
    const geometry = resolveAngularDimension(entity);
    if (!geometry) return;
    appendLine(lines, geometry.center, geometry.arcPoints[0], layerName);
    appendLine(lines, geometry.center, geometry.arcPoints.at(-1)!, layerName);
    appendPolyline(lines, geometry.arcPoints, layerName, false);
    appendText(
      lines,
      dimensionLabel(entity, project.unit, project.settings.coordinatePrecision),
      geometry.labelPosition,
      entityTextHeight(entity),
      0,
      layerName,
    );
    return;
  }
  appendPolyline(lines, entity.points, layerName, false);
}

/**
 * Build a conservative ASCII DXF document. Polygon rings are closed
 * LWPOLYLINE entities; polylines and sampled arcs are emitted open.
 */
export function buildDxf(project: Project): string {
  const lines: string[] = [];
  const layerNames = uniqueLayerNames(project.layers);

  pair(lines, 0, 'SECTION');
  pair(lines, 2, 'HEADER');
  pair(lines, 9, '$ACADVER');
  // LWPOLYLINE was standardised after R12. AC1015 keeps the file readable by
  // modern CAD tools while retaining the small, line-pair ASCII subset.
  pair(lines, 1, 'AC1015');
  pair(lines, 9, '$INSUNITS');
  pair(lines, 70, INSUNITS[project.unit]);
  pair(lines, 0, 'ENDSEC');

  pair(lines, 0, 'SECTION');
  pair(lines, 2, 'TABLES');
  pair(lines, 0, 'TABLE');
  pair(lines, 2, 'LAYER');
  pair(lines, 70, project.layers.length + 1);
  pair(lines, 0, 'LAYER');
  pair(lines, 2, '0');
  pair(lines, 70, 0);
  pair(lines, 62, 7);
  pair(lines, 6, 'CONTINUOUS');
  for (const layer of project.layers) {
    pair(lines, 0, 'LAYER');
    pair(lines, 2, layerNames.get(layer.id) ?? '0');
    pair(lines, 70, layer.locked ? 4 : 0);
    pair(lines, 62, layer.visible ? 7 : -7);
    pair(lines, 6, 'CONTINUOUS');
  }
  pair(lines, 0, 'ENDTAB');
  pair(lines, 0, 'ENDSEC');

  pair(lines, 0, 'SECTION');
  pair(lines, 2, 'ENTITIES');
  for (const polygon of polygons(project)) {
    const layerName = layerNames.get(polygon.layerId) ?? '0';
    appendPolyline(lines, polygon.geometry.outer, layerName, true);
    for (const hole of polygon.geometry.holes) appendPolyline(lines, hole, layerName, true);
  }
  for (const entity of linearEntities(project)) {
    appendLinearEntity(
      lines,
      entity,
      project,
      layerNames.get(entity.layerId) ?? '0',
    );
  }
  pair(lines, 0, 'ENDSEC');
  pair(lines, 0, 'EOF');

  return `${lines.join('\r\n')}\r\n`;
}

export function exportDxfFile(project: Project): void {
  downloadText(buildDxf(project), `cad-project-${timestamp()}.dxf`, 'application/dxf');
}
