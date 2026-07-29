import { isEntityEffectivelyVisible } from '../app/layers';
import type { PolygonEntity, Project, Unit } from '../app/projectTypes';
import {
  calculateMultiPolygonSectionProperties,
  calculateSectionProperties,
  type SectionProperties,
} from '../geometry/sectionProperties';

export type SectionReportRow = {
  entityId: string;
  name: string;
  layerId: string;
  properties: SectionProperties;
};

export type SectionReportData = {
  projectId: string;
  projectName: string;
  unit: Unit;
  generatedAt: string;
  rows: SectionReportRow[];
  total: SectionProperties | null;
};

export type SectionReportOptions = {
  entityIds?: readonly string[];
  generatedAt?: string;
};

function visiblePolygons(
  project: Project,
  entityIds: readonly string[] | undefined,
): PolygonEntity[] {
  const selected = entityIds ? new Set(entityIds) : null;
  return project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' &&
      (selected === null || selected.has(entity.id)) &&
      isEntityEffectivelyVisible(project, entity),
  );
}

/** Create serializable report data, suitable for UI, printing, or later PDF output. */
export function buildSectionReportData(
  project: Project,
  options: SectionReportOptions = {},
): SectionReportData {
  const entities = visiblePolygons(project, options.entityIds);
  const rows = entities.flatMap((entity) => {
    const properties = calculateSectionProperties(entity.geometry);
    return properties
      ? [{
          entityId: entity.id,
          name: entity.name,
          layerId: entity.layerId,
          properties,
        }]
      : [];
  });
  return {
    projectId: project.id,
    projectName: project.name,
    unit: project.unit,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    rows,
    total: calculateMultiPolygonSectionProperties(
      rows.map((row) => (
        entities.find((entity) => entity.id === row.entityId)!.geometry
      )),
    ),
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!,
  );
}

function format(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

function cells(properties: SectionProperties, unit: Unit): string {
  const areaUnit = `${unit}²`;
  const inertiaUnit = `${unit}⁴`;
  const modulusUnit = `${unit}³`;
  return [
    `<td>${format(properties.area)} ${areaUnit}</td>`,
    `<td>(${format(properties.centroid.x)}, ${format(properties.centroid.y)}) ${unit}</td>`,
    `<td>${format(properties.ix)} ${inertiaUnit}</td>`,
    `<td>${format(properties.iy)} ${inertiaUnit}</td>`,
    `<td>${format(properties.ixy)} ${inertiaUnit}</td>`,
    `<td>${format(properties.sectionModulus.x)} ${modulusUnit}</td>`,
    `<td>${format(properties.sectionModulus.y)} ${modulusUnit}</td>`,
    `<td>${format(properties.radiusOfGyration.x)} ${unit}</td>`,
    `<td>${format(properties.radiusOfGyration.y)} ${unit}</td>`,
  ].join('');
}

/**
 * Build a complete standalone HTML document. The print stylesheet keeps the
 * report readable when opened in a new window and passed to window.print().
 */
export function buildSectionReportHtml(data: SectionReportData): string {
  const rows = data.rows.map((row) => (
    `<tr><th scope="row">${escapeHtml(row.name)}</th>${cells(row.properties, data.unit)}</tr>`
  )).join('');
  const total = data.total
    ? `<tr class="total"><th scope="row">Total</th>${cells(data.total, data.unit)}</tr>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.projectName)} — Section properties</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 24px; color: #17202a; }
    h1 { margin: 0 0 4px; font-size: 1.4rem; }
    .meta { margin: 0 0 20px; color: #52606d; font-size: .85rem; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 6px 7px; border: 1px solid #aeb7c2; text-align: right; }
    thead th, tbody th { background: #edf2f7; font-weight: 650; }
    tbody th { text-align: left; }
    .total th, .total td { border-top: 2px solid #34495e; font-weight: 700; }
    @page { size: landscape; margin: 12mm; }
    @media print {
      body { margin: 0; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(data.projectName)}</h1>
  <p class="meta">Section properties · ${escapeHtml(data.generatedAt)} · coordinates in ${data.unit}</p>
  <table>
    <thead><tr>
      <th>Entity</th><th>Area</th><th>Centroid</th><th>Ix</th><th>Iy</th><th>Ixy</th>
      <th>Zx</th><th>Zy</th><th>rx</th><th>ry</th>
    </tr></thead>
    <tbody>${rows}${total}</tbody>
  </table>
</body>
</html>`;
}

export function buildProjectSectionReportHtml(
  project: Project,
  options: SectionReportOptions = {},
): string {
  return buildSectionReportHtml(buildSectionReportData(project, options));
}
