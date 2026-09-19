import type { Project } from '../app/projectTypes';
import { buildSvg } from './svgExport';
import { paperSize, type PrintLayout } from './printLayout';

/** Keep drawing paths vector-based; use the browser's font shaping for non-Latin labels. */
async function prepareText(svg: SVGSVGElement): Promise<void> {
  await document.fonts?.ready;
  for (const node of svg.querySelectorAll('text')) {
    if (!/[^\x00-\x7f]/.test(node.textContent ?? '')) continue;
    const box = node.getBBox();
    if (!box.width || !box.height) continue;
    const canvas = document.createElement('canvas');
    const scale = Math.min(8, 4096 / Math.max(box.width, box.height));
    canvas.width = Math.ceil(box.width * scale);
    canvas.height = Math.ceil(box.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.font = `${node.getAttribute('font-size') ?? 12}px sans-serif`;
    ctx.fillStyle = node.getAttribute('fill') ?? '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.textContent ?? '', 0, box.height / 2);
    const image = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'image',
    );
    for (const [name, value] of Object.entries({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    }))
      image.setAttribute(name, String(value));
    image.setAttribute('href', canvas.toDataURL('image/png'));
    if (node.hasAttribute('transform'))
      image.setAttribute('transform', node.getAttribute('transform')!);
    image.setAttribute('opacity', node.getAttribute('fill-opacity') ?? '1');
    node.replaceWith(image);
  }
}

export async function buildPdf(
  projects: Project[],
  layout: PrintLayout,
  signal?: AbortSignal,
  progress?: (page: number) => void,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');
  const [width, height] = paperSize(layout);
  const pdf = new jsPDF({
    orientation: layout.orientation,
    unit: 'mm',
    format: [width, height],
    compress: true,
    precision: 8,
  });
  pdf.setProperties({ title: projects[0]?.name ?? 'PolyBool2D' });
  for (const [index, project] of projects.entries()) {
    signal?.throwIfAborted();
    progress?.(index + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (index) pdf.addPage([width, height], layout.orientation);
    const svg = new DOMParser().parseFromString(
      buildSvg(project, layout),
      'image/svg+xml',
    ).documentElement as unknown as SVGSVGElement;
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden';
    container.appendChild(svg);
    document.body.appendChild(container);
    try {
      await prepareText(svg);
      await pdf.svg(svg, { x: 0, y: 0, width, height });
    } finally {
      container.remove();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
  }
  return pdf.output('blob');
}
