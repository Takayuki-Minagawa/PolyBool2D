import type { Project } from '../app/projectTypes';
import { downloadBlob, timestamp } from './download';
import { buildSvg } from './svgExport';

export const DEFAULT_PNG_MAX_DIMENSION = 4096;
export const DEFAULT_PNG_PIXEL_RATIO = 2;

export type PngExportOptions = {
  pixelRatio?: number;
  maxDimension?: number;
  background?: string | null;
};

export type RasterSize = {
  width: number;
  height: number;
};

export function calculateRasterSize(
  sourceWidth: number,
  sourceHeight: number,
  pixelRatio = DEFAULT_PNG_PIXEL_RATIO,
  maxDimension = DEFAULT_PNG_MAX_DIMENSION,
): RasterSize {
  const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1;
  const safeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1;
  const safeRatio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const safeMax = Number.isFinite(maxDimension) && maxDimension >= 1
    ? Math.floor(maxDimension)
    : DEFAULT_PNG_MAX_DIMENSION;
  const requestedWidth = safeWidth * safeRatio;
  const requestedHeight = safeHeight * safeRatio;
  const scale = Math.min(1, safeMax / Math.max(requestedWidth, requestedHeight));
  return {
    width: Math.max(1, Math.round(requestedWidth * scale)),
    height: Math.max(1, Math.round(requestedHeight * scale)),
  };
}

function svgDimensions(svg: string): { width: number; height: number } | null {
  if (typeof DOMParser === 'undefined') return null;
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror')) return null;
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  const width = Number.parseFloat(root.getAttribute('width') ?? '');
  const height = Number.parseFloat(root.getAttribute('height') ?? '');
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null;
}

export function projectSvgForPng(project: Project): string {
  return buildSvg(project);
}

export async function renderSvgToPngBlob(
  svg: string,
  options: PngExportOptions = {},
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const source = svgDimensions(svg);
  if (!source) return null;
  const size = calculateRasterSize(
    source.width,
    source.height,
    options.pixelRatio,
    options.maxDimension,
  );
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Unable to rasterize SVG'));
      next.src = imageUrl;
    });
    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function exportPngFile(
  project: Project,
  options: PngExportOptions = {},
): Promise<boolean> {
  const blob = await renderSvgToPngBlob(projectSvgForPng(project), options);
  if (!blob) return false;
  downloadBlob(blob, `cad-project-${timestamp()}.png`);
  return true;
}
