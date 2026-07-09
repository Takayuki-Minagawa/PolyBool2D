import type { Project } from '../app/projectTypes';
import type { PolygonGeometry, Ring } from '../geometry/types';
import { boundsForEntities } from '../app/transform';
import { downloadText, timestamp } from './download';

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

function polygonToPath(geom: PolygonGeometry, flipY: (y: number) => number): string {
  return [geom.outer, ...geom.holes].map((r) => ringToPath(r, flipY)).join(' ');
}

/**
 * Build a standalone SVG document string for the project's polygons.
 * World Y is up; SVG Y is down, so Y is flipped about the content bounds.
 */
export function buildSvg(project: Project): string {
  const polygons = project.entities.filter((e) => e.type === 'polygon');
  const bounds = boundsForEntities(project.entities) ?? {
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
      return `  <path d="${d}" fill="${FILL}" fill-opacity="0.7" fill-rule="evenodd" stroke="${STROKE}" stroke-width="1" />`;
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
