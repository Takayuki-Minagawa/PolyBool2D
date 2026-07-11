import type { Layer, PolygonEntity, Project, Unit } from '../app/projectTypes';
import type { Ring } from '../geometry/types';
import { downloadText, timestamp } from './download';
import { isEntityEffectivelyVisible } from '../app/layers';

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

function appendPolyline(lines: string[], ring: Ring, layerName: string): void {
  if (ring.length < 3) return;
  pair(lines, 0, 'LWPOLYLINE');
  pair(lines, 100, 'AcDbEntity');
  pair(lines, 8, layerName);
  pair(lines, 100, 'AcDbPolyline');
  pair(lines, 90, ring.length);
  pair(lines, 70, 1); // closed polyline
  for (const point of ring) {
    pair(lines, 10, dxfNumber(point.x));
    pair(lines, 20, dxfNumber(point.y));
  }
}

function polygons(project: Project): PolygonEntity[] {
  return project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' && isEntityEffectivelyVisible(project, entity),
  );
}

/**
 * Build a conservative ASCII DXF document. It uses only simple closed
 * LWPOLYLINE entities; every hole is emitted as its own closed polyline.
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
    appendPolyline(lines, polygon.geometry.outer, layerName);
    for (const hole of polygon.geometry.holes) appendPolyline(lines, hole, layerName);
  }
  pair(lines, 0, 'ENDSEC');
  pair(lines, 0, 'EOF');

  return `${lines.join('\r\n')}\r\n`;
}

export function exportDxfFile(project: Project): void {
  downloadText(buildDxf(project), `cad-project-${timestamp()}.dxf`, 'application/dxf');
}
