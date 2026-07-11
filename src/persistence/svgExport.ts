import type { PolygonEntity, Project } from '../app/projectTypes';
import type { PolygonGeometry, Ring } from '../geometry/types';
import { boundsForEntities } from '../app/transform';
import { downloadText, timestamp } from './download';
import { isEntityEffectivelyVisible, layerForEntity } from '../app/layers';

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

/**
 * Build a standalone SVG document string for the project's polygons.
 * World Y is up; SVG Y is down, so Y is flipped about the content bounds.
 */
export function buildSvg(project: Project): string {
  const polygons = project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' && isEntityEffectivelyVisible(project, entity),
  );
  const bounds = boundsForEntities(polygons) ?? {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  };
  const width = bounds.maxX - bounds.minX + PADDING * 2;
  const height = bounds.maxY - bounds.minY + PADDING * 2;
  // Map world coords into a viewBox whose origin is the padded top-left.
  const flipY = (y: number) => bounds.maxY - y + PADDING;
  const shiftX = (x: number) => x - bounds.minX + PADDING;

  const paths = polygons
    .map((e) => {
      const shifted: PolygonGeometry = {
        outer: e.geometry.outer.map((p) => ({ x: shiftX(p.x), y: p.y })),
        holes: e.geometry.holes.map((h) => h.map((p) => ({ x: shiftX(p.x), y: p.y }))),
      };
      const d = polygonToPath(shifted, flipY);
      const color = layerForEntity(project, e)?.color ?? STROKE;
      return `  <path d="${xmlAttribute(d)}" fill="${xmlAttribute(color || FILL)}" fill-opacity="${Math.max(0, Math.min(1, e.style.opacity * 0.28))}" fill-rule="evenodd" stroke="${xmlAttribute(color)}" stroke-width="${fmt(e.style.strokeWidth)}" />`;
    })
    .join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    paths,
    '</svg>',
    '',
  ].join('\n');
}

export function exportSvgFile(project: Project): void {
  downloadText(buildSvg(project), `cad-project-${timestamp()}.svg`, 'image/svg+xml');
}
