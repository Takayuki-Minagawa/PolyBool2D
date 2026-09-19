import { paperSize, printBounds, type PrintLayout } from './printLayout';
import type { Entity, LinearEntity, Project } from '../app/projectTypes';
import type { PolygonGeometry, Ring } from '../geometry/types';
import { boundsForEntities } from '../app/transform';
import { expandBBox } from '../geometry/measure';
import { downloadText, timestamp } from './download';
import { isEntityEffectivelyVisible, layerForEntity } from '../app/layers';
import {
  dimensionLabel,
  entityTextHeight,
  resolveAngularDimension,
  resolveLinearDimension,
} from './dimensionExport';

const PADDING = 16;
const FILL = '#3a8dde';
const STROKE = '#1b3a5b';

function ringToPath(ring: Ring, flipY: (y: number) => number): string {
  if (ring.length === 0) return '';
  const head = `M ${fmt(ring[0].x)} ${fmt(flipY(ring[0].y))}`;
  const rest = ring
    .slice(1)
    .map((p) => `L ${fmt(p.x)} ${fmt(flipY(p.y))}`)
    .join(' ');
  return `${head} ${rest} Z`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');
}

function xmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function polygonToPath(geom: PolygonGeometry, flipY: (y: number) => number): string {
  return [geom.outer, ...geom.holes].map((r) => ringToPath(r, flipY)).join(' ');
}

function svgPoint(
  point: { x: number; y: number },
  shiftX: (x: number) => number,
  flipY: (y: number) => number,
): { x: number; y: number } {
  return { x: shiftX(point.x), y: flipY(point.y) };
}

function svgLine(
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  width: number,
  opacity: number,
  shiftX: (x: number) => number,
  flipY: (y: number) => number,
): string {
  const a = svgPoint(start, shiftX, flipY);
  const b = svgPoint(end, shiftX, flipY);
  return `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${xmlAttribute(color)}" stroke-width="${fmt(width)}" opacity="${fmt(opacity)}" />`;
}

function svgPolyline(
  points: { x: number; y: number }[],
  color: string,
  width: number,
  opacity: number,
  shiftX: (x: number) => number,
  flipY: (y: number) => number,
): string {
  const value = points
    .map((point) => {
      const mapped = svgPoint(point, shiftX, flipY);
      return `${fmt(mapped.x)},${fmt(mapped.y)}`;
    })
    .join(' ');
  return `<polyline points="${xmlAttribute(value)}" fill="none" stroke="${xmlAttribute(color)}" stroke-width="${fmt(width)}" opacity="${fmt(opacity)}" />`;
}

function svgText(
  text: string,
  position: { x: number; y: number },
  rotationDeg: number,
  color: string,
  height: number,
  opacity: number,
  shiftX: (x: number) => number,
  flipY: (y: number) => number,
): string {
  const mapped = svgPoint(position, shiftX, flipY);
  const rotation = Number.isFinite(rotationDeg) ? -rotationDeg : 0;
  const transform = rotation === 0
    ? ''
    : ` transform="rotate(${fmt(rotation)} ${fmt(mapped.x)} ${fmt(mapped.y)})"`;
  return `<text x="${fmt(mapped.x)}" y="${fmt(mapped.y)}"${transform} fill="${xmlAttribute(color)}" fill-opacity="${fmt(opacity)}" font-size="${fmt(height)}" text-anchor="middle" dominant-baseline="middle">${xmlAttribute(text)}</text>`;
}

function linearEntitySvg(
  entity: LinearEntity,
  project: Project,
  color: string,
  shiftX: (x: number) => number,
  flipY: (y: number) => number,
): string {
  const opacity = Math.max(0, Math.min(1, entity.style.opacity));
  if (entity.kind === 'annotation') {
    const insertionPoint = entity.points[0];
    if (!insertionPoint) return '';
    return svgText(
      entity.label ?? entity.name,
      insertionPoint,
      entity.rotationDeg ?? 0,
      color,
      entityTextHeight(entity),
      opacity,
      shiftX,
      flipY,
    );
  }
  if (entity.kind === 'linear-dimension') {
    const geometry = resolveLinearDimension(entity);
    if (!geometry) return '';
    const label = dimensionLabel(
      entity,
      project.unit,
      project.settings.coordinatePrecision,
    );
    return [
      svgLine(
        geometry.extensionStart[0],
        geometry.extensionStart[1],
        color,
        entity.style.strokeWidth,
        opacity,
        shiftX,
        flipY,
      ),
      svgLine(
        geometry.extensionEnd[0],
        geometry.extensionEnd[1],
        color,
        entity.style.strokeWidth,
        opacity,
        shiftX,
        flipY,
      ),
      svgLine(
        geometry.dimensionStart,
        geometry.dimensionEnd,
        color,
        entity.style.strokeWidth,
        opacity,
        shiftX,
        flipY,
      ).replace('<line ', '<line marker-start="url(#dimension-arrow)" marker-end="url(#dimension-arrow)" '),
      svgText(
        label,
        geometry.labelPosition,
        (geometry.angleRad * 180) / Math.PI,
        color,
        entityTextHeight(entity),
        opacity,
        shiftX,
        flipY,
      ),
    ].join('');
  }
  if (entity.kind === 'angular-dimension') {
    const geometry = resolveAngularDimension(entity);
    if (!geometry) return '';
    const label = dimensionLabel(
      entity,
      project.unit,
      project.settings.coordinatePrecision,
    );
    return [
      svgLine(
        geometry.center,
        geometry.arcPoints[0],
        color,
        entity.style.strokeWidth,
        opacity,
        shiftX,
        flipY,
      ),
      svgLine(
        geometry.center,
        geometry.arcPoints.at(-1)!,
        color,
        entity.style.strokeWidth,
        opacity,
        shiftX,
        flipY,
      ),
      svgPolyline(
        geometry.arcPoints,
        color,
        entity.style.strokeWidth,
        opacity,
        shiftX,
        flipY,
      ).replace('<polyline ', '<polyline marker-start="url(#dimension-arrow)" marker-end="url(#dimension-arrow)" '),
      svgText(
        label,
        geometry.labelPosition,
        0,
        color,
        entityTextHeight(entity),
        opacity,
        shiftX,
        flipY,
      ),
    ].join('');
  }
  return svgPolyline(
    entity.points,
    color,
    entity.style.strokeWidth,
    opacity,
    shiftX,
    flipY,
  );
}

/**
 * Build a standalone SVG document string for visible exportable geometry.
 * World Y is up; SVG Y is down, so Y is flipped about the content bounds.
 */
export function buildSvg(project: Project, layout?: PrintLayout): string {
  const entities = project.entities.filter(
    (entity): entity is Entity =>
      isEntityEffectivelyVisible(project, entity) &&
      (entity.type === 'polygon' || entity.kind !== 'guide'),
  );
  let bounds = boundsForEntities(entities);
  for (const entity of entities) {
    if (entity.type !== 'guide-line' || entity.kind !== 'angular-dimension') continue;
    const geometry = resolveAngularDimension(entity);
    if (!geometry) continue;
    for (const point of geometry.arcPoints) bounds = expandBBox(bounds, point);
  }
  bounds ??= {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  };
  if (layout) bounds = printBounds(project, layout);
  const padding = layout ? 0 : PADDING;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  // Map world coords into a viewBox whose origin is the padded top-left.
  const flipY = (y: number) => bounds.maxY - y + padding;
  const shiftX = (x: number) => x - bounds.minX + padding;

  const shapes = entities
    .map((e) => {
      const color = layerForEntity(project, e)?.color ?? (e.style.stroke.startsWith('var(') ? STROKE : e.style.stroke);
      const attributes = `stroke-linecap="${e.style.lineCap ?? 'round'}" stroke-linejoin="${e.style.lineJoin ?? 'round'}" stroke-dasharray="${(e.style.dashArray ?? []).join(' ')}" stroke-dashoffset="${e.style.dashOffset ?? 0}"`;
      if (e.type === 'polygon') {
        const shifted: PolygonGeometry = {
          outer: e.geometry.outer.map((p) => ({ x: shiftX(p.x), y: p.y })),
          holes: e.geometry.holes.map((h) => h.map((p) => ({ x: shiftX(p.x), y: p.y }))),
        };
        const d = polygonToPath(shifted, flipY);
        return `  <path ${attributes} d="${xmlAttribute(d)}" fill="${xmlAttribute(color || FILL)}" fill-opacity="${Math.max(0, Math.min(1, (e.style.fillOpacity ?? e.style.opacity * 0.28)))}" fill-rule="evenodd" stroke="${xmlAttribute(color)}" stroke-width="${fmt(e.style.strokeWidth)}" />`;
      }
      return `  <g ${attributes}>${linearEntitySvg(e, project, color, shiftX, flipY)}</g>`;
    })
    .join('\n');

  const physical = layout ? paperSize(layout) : null;
  const inset = layout ? layout.margin * width / physical![0] : 0;
  const printable = `<rect x="${fmt(inset)}" y="${fmt(inset)}" width="${fmt(width - inset * 2)}" height="${fmt(height - inset * 2)}" />`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${physical ? physical[0] + 'mm' : fmt(width)}" height="${physical ? physical[1] + 'mm' : fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    entities.some((entity) => entity.type === 'guide-line' && ['linear-dimension', 'angular-dimension'].includes(entity.kind)) ? '<defs><marker id="dimension-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 7 0 L 0 3.5 L 7 7 Z" fill="context-stroke" /></marker></defs>' : '',
    layout ? `<defs><clipPath id="print-clip">${printable}</clipPath></defs><g clip-path="url(#print-clip)">` : '',
    shapes,
    layout ? '</g>' : '',
    layout?.frame ? `<g fill="none" stroke="#000" stroke-width="${width / physical![0] * 0.2}">${printable}</g>` : '',
    '</svg>',
    '',
  ].join('\n');
}

export function exportSvgFile(project: Project): void {
  downloadText(buildSvg(project), `cad-project-${timestamp()}.svg`, 'image/svg+xml');
}
