import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { makeId } from '../app/idUtils';
import { createEmptyProject } from '../app/projectFactory';
import type { Entity, LineStyle, Project } from '../app/projectTypes';
import type { Point } from '../geometry/types';
import { cleanDrawingLines } from '../geometry/lineCleanup';
import { nestRingsAsPolygons } from '../geometry/ringNesting';
import { DEFAULT_PRINT_LAYOUT } from './printLayout';

export type PdfImportOptions = {
  rotation: number;
  /** Model millimeters per PDF point, after two-point calibration. */
  unitsPerPoint: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  lines: boolean;
  fills: boolean;
  text: boolean;
};
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    cMapUrl: `${import.meta.env.BASE_URL}pdf-cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-fonts/`,
  }).promise;
}

type Matrix = number[];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function transform(p: Point, m: Matrix): Point {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}

/** Clip one segment to the user-selected rectangular crop, retaining intersections. */
export function clipPdfSegment(
  a: Point,
  b: Point,
  crop: NonNullable<PdfImportOptions['crop']>,
): Point[] {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  let start = 0,
    end = 1;
  const p = [-dx, dx, -dy, dy],
    q = [
      a.x - crop.x,
      crop.x + crop.width - a.x,
      a.y - crop.y,
      crop.y + crop.height - a.y,
    ];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return [];
      continue;
    }
    const u = q[i] / p[i];
    if (p[i] < 0) start = Math.max(start, u);
    else end = Math.min(end, u);
    if (start > end) return [];
  }
  return [
    { x: a.x + start * dx, y: a.y + start * dy },
    { x: a.x + end * dx, y: a.y + end * dy },
  ];
}
function clipPolyline(
  points: Point[],
  crop: NonNullable<PdfImportOptions['crop']>,
): Point[][] {
  const result: Point[][] = [];
  for (let i = 1; i < points.length; i++) {
    const part = clipPdfSegment(points[i - 1], points[i], crop);
    if (!part.length) continue;
    const previous = result.at(-1);
    if (
      previous &&
      previous.at(-1)!.x === part[0].x &&
      previous.at(-1)!.y === part[0].y
    )
      previous.push(part[1]);
    else result.push(part);
  }
  return result;
}

export async function importPdfPage(
  page: PDFPageProxy,
  name: string,
  options: PdfImportOptions,
  signal?: AbortSignal,
  progress?: (fraction: number) => void,
): Promise<{ project: Project; warnings: string[]; duplicates: number }> {
  const { OPS } = await import('pdfjs-dist');
  const list = await page.getOperatorList();
  const viewport = page.getViewport({
    scale: 1,
    rotation: (page.rotate + options.rotation) % 360,
  });
  const crop = options.crop ?? {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  };
  if (!(
    options.unitsPerPoint > 0 &&
    Number.isFinite(options.unitsPerPoint) &&
    crop.width > 0 &&
    crop.height > 0
  ))
    throw new Error('Invalid PDF calibration or crop');
  const factor = options.unitsPerPoint;
  const project = createEmptyProject();
  project.name = name;
  project.unit = 'mm';
  project.layers = [];
  const warnings = new Set<string>();
  const entities: Entity[] = [];
  const layer = (category: string, color: string) => {
    const id = `${category}-${color}`;
    if (!project.layers.some((l) => l.id === id))
      project.layers.push({
        id,
        name: `${category} ${color}`,
        color,
        visible: true,
        locked: false,
      });
    return id;
  };
  const modelPoint = (p: Point) => ({
    x: (p.x - crop.x) * factor,
    y: (crop.y + crop.height - p.y) * factor,
  });
  let state = {
    matrix: [1, 0, 0, 1, 0, 0],
    color: '#000000',
    fill: '#000000',
    width: 1,
    cap: 0,
    join: 0,
    dash: [] as number[],
    offset: 0,
    alpha: 1,
    fillAlpha: 1,
  };
  const stack: (typeof state)[] = [];
  let paths: Point[][] = [],
    current: Point[] = [];
  let pen: Point = { x: 0, y: 0 };
  const screenPoint = (p: Point) =>
    transform(transform(p, state.matrix), viewport.transform);
  const close = () => {
    if (current.length) current.push({ ...current[0] });
  };
  const curve = (a: Point, b: Point, end: Point) => {
    const start = pen;
    for (let step = 1; step <= 16; step++) {
      const t = step / 16,
        u = 1 - t;
      current.push(
        screenPoint({
          x:
            u * u * u * start.x +
            3 * u * u * t * a.x +
            3 * u * t * t * b.x +
            t * t * t * end.x,
          y:
            u * u * u * start.y +
            3 * u * u * t * a.y +
            3 * u * t * t * b.y +
            t * t * t * end.y,
        }),
      );
    }
    pen = end;
  };
  const lineStyle = (color: string): LineStyle => {
    const scale =
      Math.sqrt(
        Math.abs(
          state.matrix[0] * state.matrix[3] - state.matrix[1] * state.matrix[2],
        ),
      ) * factor;
    return {
      stroke: color,
      strokeWidth: state.width * scale,
      opacity: state.alpha,
      dashArray: state.dash.map((n) => n * scale),
      dashOffset: state.offset * scale,
      lineCap: (['butt', 'round', 'square'] as const)[state.cap] ?? 'butt',
      lineJoin: (['miter', 'round', 'bevel'] as const)[state.join] ?? 'miter',
    };
  };
  const paint = (stroke: boolean, fill: boolean) => {
    if (stroke && options.lines)
      for (const path of paths)
        for (const points of clipPolyline(path, crop)) {
          entities.push({
            id: makeId('pdf'),
            type: 'guide-line',
            kind: 'polyline',
            name: `PDF line ${entities.length + 1}`,
            layerId: layer('Lines', state.color),
            points: points.map(modelPoint),
            style: lineStyle(state.color),
            visible: true,
            locked: false,
          });
        }
    if (fill && options.fills) {
      const complete = paths.filter(
        (path) =>
          path.length >= 3 &&
          path.every(
            (p) =>
              p.x >= crop.x &&
              p.x <= crop.x + crop.width &&
              p.y >= crop.y &&
              p.y <= crop.y + crop.height,
          ),
      );
      if (complete.length !== paths.length)
        warnings.add('cropped-fills-omitted');
      for (const geometry of nestRingsAsPolygons(
        complete.map((path) => path.map(modelPoint)),
      )) {
        entities.push({
          id: makeId('pdf'),
          type: 'polygon',
          name: `PDF fill ${entities.length + 1}`,
          layerId: layer('Fills', state.fill),
          geometry,
          style: {
            fill: state.fill,
            stroke: state.fill,
            strokeWidth: 0,
            opacity: state.fillAlpha,
            fillOpacity: state.fillAlpha,
          },
          visible: true,
          locked: false,
        });
      }
    }
    paths = [];
    current = [];
  };
  for (let i = 0; i < list.fnArray.length; i++) {
    if (i % 2000 === 0) {
      signal?.throwIfAborted();
      progress?.(i / list.fnArray.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (entities.length > 300_000)
      throw new Error('PDF entity limit exceeded (300000)');
    const args = list.argsArray[i],
      op = list.fnArray[i];
    switch (op) {
      case OPS.save:
        stack.push({
          ...state,
          matrix: [...state.matrix],
          dash: [...state.dash],
        });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state = { ...state, matrix: multiply(state.matrix, args) };
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ...state });
        if (args[0])
          state = { ...state, matrix: multiply(state.matrix, args[0]) };
        break;
      case OPS.paintFormXObjectEnd:
        state = stack.pop() ?? state;
        break;
      case OPS.setLineWidth:
        state.width = args[0];
        break;
      case OPS.setLineCap:
        state.cap = args[0];
        break;
      case OPS.setLineJoin:
        state.join = args[0];
        break;
      case OPS.setDash:
        state.dash = args[0];
        state.offset = args[1];
        break;
      case OPS.setStrokeRGBColor:
        state.color =
          '#' +
          Array.from(args as number[])
            .map((n) => Math.round(n).toString(16).padStart(2, '0'))
            .join('');
        break;
      case OPS.setFillRGBColor:
        state.fill =
          '#' +
          Array.from(args as number[])
            .map((n) => Math.round(n).toString(16).padStart(2, '0'))
            .join('');
        break;
      case OPS.setGState:
        for (const [key, value] of args[0]) {
          if (key === 'CA') state.alpha = value;
          if (key === 'ca') state.fillAlpha = value;
        }
        break;
      case OPS.constructPath: {
        const [operations, coords] = args;
        let j = 0;
        for (const operation of operations) {
          const point = () => ({ x: coords[j++], y: coords[j++] });
          if (operation === OPS.moveTo) {
            pen = point();
            current = [screenPoint(pen)];
            paths.push(current);
          } else if (operation === OPS.lineTo) {
            pen = point();
            current.push(screenPoint(pen));
          } else if (operation === OPS.curveTo) {
            const a = point(),
              b = point();
            curve(a, b, point());
          } else if (operation === OPS.curveTo2) {
            const a = { ...pen },
              b = point();
            curve(a, b, point());
          } else if (operation === OPS.curveTo3) {
            const a = point(),
              b = point();
            curve(a, b, b);
          } else if (operation === OPS.closePath) close();
          else if (operation === OPS.rectangle) {
            const p = point(),
              w = coords[j++],
              h = coords[j++];
            current = [
              p,
              { x: p.x + w, y: p.y },
              { x: p.x + w, y: p.y + h },
              { x: p.x, y: p.y + h },
              p,
            ].map(screenPoint);
            paths.push(current);
            pen = p;
          }
        }
        break;
      }
      case OPS.closePath:
        close();
        break;
      case OPS.stroke:
        paint(true, false);
        break;
      case OPS.closeStroke:
        close();
        paint(true, false);
        break;
      case OPS.fill:
      case OPS.eoFill:
        paint(false, true);
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
        paint(true, true);
        break;
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        close();
        paint(true, true);
        break;
      case OPS.endPath:
        paths = [];
        current = [];
        break;
      case OPS.clip:
      case OPS.eoClip:
        warnings.add('pdf-clipping-path');
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
        warnings.add('images-not-vector');
        break;
      case OPS.shadingFill:
      case OPS.setFillColorN:
      case OPS.setStrokeColorN:
        warnings.add('patterns-not-supported');
        break;
    }
  }
  if (options.text) {
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const m = multiply(viewport.transform, item.transform);
      const p = { x: m[4], y: m[5] };
      if (
        p.x < crop.x ||
        p.x > crop.x + crop.width ||
        p.y < crop.y ||
        p.y > crop.y + crop.height
      )
        continue;
      const position = modelPoint(p),
        height = Math.hypot(m[2], m[3]) * factor;
      const angle = -Math.atan2(m[1], m[0]);
      // The native annotation anchor is the center; PDF text starts on its baseline.
      position.x +=
        (Math.cos(angle) * item.width * factor) / 2 -
        Math.sin(angle) * height * 0.35;
      position.y +=
        (Math.sin(angle) * item.width * factor) / 2 +
        Math.cos(angle) * height * 0.35;
      entities.push({
        id: makeId('pdf-text'),
        type: 'guide-line',
        kind: 'annotation',
        name: item.str,
        label: item.str,
        layerId: layer('Text', '#000000'),
        points: [position],
        textHeight: height,
        rotationDeg: (angle * 180) / Math.PI,
        style: { stroke: '#000000', strokeWidth: 0, opacity: 1 },
        visible: true,
        locked: false,
      });
    }
    if (content.items.length) warnings.add('text-fonts-approximated');
  }
  if (!project.layers.length) project.layers = createEmptyProject().layers;
  project.entities = entities;
  const cleaned = cleanDrawingLines(project, false);
  project.entities = cleaned.entities;
  project.printLayout = {
    ...DEFAULT_PRINT_LAYOUT,
    scale: (factor * 72) / 25.4,
  };
  signal?.throwIfAborted();
  progress?.(1);
  return { project, warnings: [...warnings], duplicates: cleaned.removed };
}
