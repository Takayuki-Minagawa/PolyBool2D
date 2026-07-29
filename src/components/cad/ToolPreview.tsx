import type { DrawingPreview } from '../../app/appStore';
import type { Unit, ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';
import { formatLength } from '../../app/units';
import { distance } from '../../geometry/numeric';
import { angleAtPoint, arcToPolyline, polylineLength } from '../../geometry/primitives';

type Props = {
  preview: DrawingPreview;
  view: ViewTransform;
  circleSegments: number;
  unit: Unit;
  coordinatePrecision: number;
};

function DimensionLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      className="dimension-hud-text"
      x={x}
      y={y - 7}
      textAnchor="middle"
      aria-hidden="true"
    >
      {children}
    </text>
  );
}

export function ToolPreview({
  preview,
  view,
  circleSegments,
  unit,
  coordinatePrecision,
}: Props) {
  const fmt = (value: number) => formatLength(value, unit, coordinatePrecision);
  if (preview.type === 'none') return null;

  if (
    preview.type === 'polygon' ||
    preview.type === 'hole' ||
    preview.type === 'polyline' ||
    preview.type === 'linear-dimension' ||
    preview.type === 'angular-dimension'
  ) {
    const worldPoints = preview.cursor
      ? [...preview.points, preview.cursor]
      : preview.points;
    const pts = worldPoints.map((p) => worldToScreen(p, view));
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
        {worldPoints.slice(1).map((point, index) => {
          const previous = worldPoints[index];
          const a = pts[index];
          const b = pts[index + 1];
          return (
            <DimensionLabel
              key={`dimension-${index}`}
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2}
            >
              {fmt(distance(previous, point))}
            </DimensionLabel>
          );
        })}
      </g>
    );
  }

  if (preview.type === 'measure') {
    const worldPoints = preview.cursor
      ? [...preview.points, preview.cursor]
      : preview.points;
    if (worldPoints.length === 0) return null;
    const points = worldPoints.map((point) => worldToScreen(point, view));
    const d =
      points.length > 1
        ? `M ${points[0].x} ${points[0].y} ${points
            .slice(1)
            .map((point) => `L ${point.x} ${point.y}`)
            .join(' ')}`
        : '';
    const angle =
      worldPoints.length >= 3
        ? angleAtPoint(
            worldPoints[worldPoints.length - 3],
            worldPoints[worldPoints.length - 2],
            worldPoints[worldPoints.length - 1],
          )
        : null;
    const last = points[points.length - 1];
    return (
      <g pointerEvents="none">
        {d && (
          <path
            d={d}
            fill="none"
            stroke="var(--cad-measure-color, var(--cad-preview-color))"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        )}
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={3} fill="var(--cad-preview-color)" />
        ))}
        {worldPoints.slice(1).map((point, index) => {
          const a = points[index];
          const b = points[index + 1];
          return (
            <DimensionLabel key={index} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2}>
              {fmt(distance(worldPoints[index], point))}
            </DimensionLabel>
          );
        })}
        {worldPoints.length > 1 && (
          <DimensionLabel x={last.x} y={last.y - 18}>
            {`Σ ${fmt(polylineLength(worldPoints))}${
              angle === null ? '' : ` · ∠ ${((angle * 180) / Math.PI).toFixed(1)}°`
            }`}
          </DimensionLabel>
        )}
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
    const center = worldToScreen(
      { x: (start.x + cursor.x) / 2, y: (start.y + cursor.y) / 2 },
      view,
    );
    return (
      <g pointerEvents="none">
        <path
          d={d}
          fill="none"
          stroke="var(--cad-preview-color)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <DimensionLabel x={center.x} y={center.y}>
          {`W ${fmt(Math.abs(cursor.x - start.x))} × H ${fmt(Math.abs(cursor.y - start.y))}`}
        </DimensionLabel>
      </g>
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
    const centerScreen = worldToScreen(preview.center, view);
    const cursorScreen = worldToScreen(preview.cursor, view);
    return (
      <g pointerEvents="none">
        <path
          d={d}
          fill="none"
          stroke="var(--cad-preview-color)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          className="dimension-hud-guide"
          x1={centerScreen.x}
          y1={centerScreen.y}
          x2={cursorScreen.x}
          y2={cursorScreen.y}
        />
        <DimensionLabel
          x={(centerScreen.x + cursorScreen.x) / 2}
          y={(centerScreen.y + cursorScreen.y) / 2}
        >
          {`R ${fmt(r)}`}
        </DimensionLabel>
      </g>
    );
  }

  if (preview.type === 'ellipse') {
    const radiusX = Math.abs(preview.cursor.x - preview.center.x);
    const radiusY = Math.abs(preview.cursor.y - preview.center.y);
    if (!(radiusX > 0) || !(radiusY > 0)) return null;
    const center = worldToScreen(preview.center, view);
    return (
      <g pointerEvents="none">
        <ellipse
          cx={center.x}
          cy={center.y}
          rx={radiusX * view.scale}
          ry={radiusY * view.scale}
          fill="none"
          stroke="var(--cad-preview-color)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <DimensionLabel x={center.x} y={center.y}>
          {`Rx ${fmt(radiusX)} × Ry ${fmt(radiusY)}`}
        </DimensionLabel>
      </g>
    );
  }

  if (preview.type === 'arc') {
    if (!preview.start) {
      const center = worldToScreen(preview.center, view);
      const cursor = worldToScreen(preview.cursor, view);
      return (
        <g pointerEvents="none">
          <line
            x1={center.x}
            y1={center.y}
            x2={cursor.x}
            y2={cursor.y}
            stroke="var(--cad-preview-color)"
            strokeDasharray="4 3"
          />
          <DimensionLabel x={(center.x + cursor.x) / 2} y={(center.y + cursor.y) / 2}>
            {`R ${fmt(distance(preview.center, preview.cursor))}`}
          </DimensionLabel>
        </g>
      );
    }
    const worldPoints = arcToPolyline(
      preview.center,
      preview.start,
      preview.cursor,
      circleSegments,
    );
    const points = worldPoints.map((point) => worldToScreen(point, view));
    if (points.length < 2) return null;
    const d = `M ${points[0].x} ${points[0].y} ${points
      .slice(1)
      .map((point) => `L ${point.x} ${point.y}`)
      .join(' ')}`;
    return (
      <g pointerEvents="none">
        <path
          d={d}
          fill="none"
          stroke="var(--cad-preview-color)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <DimensionLabel x={points[Math.floor(points.length / 2)].x} y={points[Math.floor(points.length / 2)].y}>
          {`R ${fmt(distance(preview.center, preview.start))}`}
        </DimensionLabel>
      </g>
    );
  }

  if (preview.type === 'guide-line') {
    const a = worldToScreen(preview.start, view);
    const b = worldToScreen(preview.cursor, view);
    return (
      <g pointerEvents="none">
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--cad-guide-color, var(--cad-preview-color))"
          strokeWidth={1.4}
          strokeDasharray="8 5"
        />
        <DimensionLabel x={(a.x + b.x) / 2} y={(a.y + b.y) / 2}>
          {`L ${fmt(distance(preview.start, preview.cursor))}`}
        </DimensionLabel>
      </g>
    );
  }

  if (preview.type === 'knife') {
    const a = worldToScreen(preview.start, view);
    const b = worldToScreen(preview.cursor, view);
    return (
      <g pointerEvents="none">
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--cad-knife-color)"
          strokeWidth={1.6}
          strokeDasharray="6 3"
        />
        <DimensionLabel x={(a.x + b.x) / 2} y={(a.y + b.y) / 2}>
          {`L ${fmt(distance(preview.start, preview.cursor))}`}
        </DimensionLabel>
      </g>
    );
  }

  return null;
}
