import type { DrawingPreview } from '../../app/appStore';
import type { ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';

type Props = {
  preview: DrawingPreview;
  view: ViewTransform;
  circleSegments: number;
};

export function ToolPreview({ preview, view, circleSegments }: Props) {
  if (preview.type === 'none') return null;

  if (preview.type === 'polygon') {
    const pts = preview.points.map((p) => worldToScreen(p, view));
    if (preview.cursor)
      pts.push(worldToScreen(preview.cursor, view));
    if (pts.length === 0) return null;
    const d =
      `M ${pts[0].x} ${pts[0].y} ` +
      pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
    return (
      <g pointerEvents="none">
        <path
          d={d}
          fill="none"
          stroke="var(--cad-preview-color)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--cad-preview-color)" />
        ))}
      </g>
    );
  }

  if (preview.type === 'rectangle') {
    let { start, cursor } = preview;
    if (preview.constrainSquare) {
      const dx = cursor.x - start.x;
      const dy = cursor.y - start.y;
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      cursor = {
        x: start.x + Math.sign(dx || 1) * s,
        y: start.y + Math.sign(dy || 1) * s,
      };
    }
    const ps = [
      worldToScreen(start, view),
      worldToScreen({ x: cursor.x, y: start.y }, view),
      worldToScreen(cursor, view),
      worldToScreen({ x: start.x, y: cursor.y }, view),
    ];
    const d =
      `M ${ps[0].x} ${ps[0].y} ` +
      ps.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ') +
      ' Z';
    return (
      <path
        d={d}
        fill="none"
        stroke="var(--cad-preview-color)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        pointerEvents="none"
      />
    );
  }

  if (preview.type === 'circle') {
    const dx = preview.cursor.x - preview.center.x;
    const dy = preview.cursor.y - preview.center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r <= 0) return null;
    const n = circleSegments;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push(
        worldToScreen(
          {
            x: preview.center.x + Math.cos(t) * r,
            y: preview.center.y + Math.sin(t) * r,
          },
          view,
        ),
      );
    }
    const d =
      `M ${pts[0].x} ${pts[0].y} ` +
      pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ') +
      ' Z';
    return (
      <path
        d={d}
        fill="none"
        stroke="var(--cad-preview-color)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        pointerEvents="none"
      />
    );
  }

  if (preview.type === 'knife') {
    const a = worldToScreen(preview.start, view);
    const b = worldToScreen(preview.cursor, view);
    return (
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="var(--cad-knife-color)"
        strokeWidth={1.6}
        strokeDasharray="6 3"
        pointerEvents="none"
      />
    );
  }

  return null;
}
