import { memo } from 'react';
import type {
  LinearEntity,
  Unit,
  ViewTransform,
} from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';
import {
  angularDimensionGeometry,
  formatDimension,
  linearDimensionGeometry,
} from '../../geometry/dimensions';
import { LinearShape } from './LinearShape';

type Props = {
  entity: LinearEntity;
  view: ViewTransform;
  unit: Unit;
  color: string;
  selected: boolean;
  locked?: boolean;
  onPointerDown?: (event: React.PointerEvent<SVGElement>) => void;
  onContextMenu?: (event: React.MouseEvent<SVGElement>) => void;
};

function offsetFromAnchor(entity: LinearEntity): number {
  if (entity.points.length < 3) return 0;
  const [start, end, anchor] = entity.points;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return 0;
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  return (
    (anchor.x - midpoint.x) * (-dy / length) +
    (anchor.y - midpoint.y) * (dx / length)
  );
}

export const DimensionEntityShape = memo(function DimensionEntityShape({
  entity,
  view,
  unit,
  color,
  selected,
  locked = false,
  onPointerDown,
  onContextMenu,
}: Props) {
  const stroke = selected ? 'var(--cad-selected-stroke)' : color;
  const common = {
    stroke,
    strokeWidth: selected ? 2 : 1.25,
    fill: 'none',
    opacity: entity.style.opacity,
    onPointerDown,
    onContextMenu,
    style: { cursor: locked ? 'not-allowed' : 'pointer' },
  };

  if (entity.kind === 'annotation') {
    const insertion = entity.points[0];
    if (!insertion) return null;
    const screen = worldToScreen(insertion, view);
    return (
      <text
        {...common}
        x={screen.x}
        y={screen.y}
        fill={stroke}
        fontSize={Math.max(10, (entity.textHeight ?? 2.5) * view.scale)}
        transform={`rotate(${-entity.rotationDeg! || 0} ${screen.x} ${screen.y})`}
        dominantBaseline="central"
        stroke="none"
      >
        {entity.label ?? entity.name}
      </text>
    );
  }

  if (entity.kind === 'linear-dimension' && entity.points.length >= 3) {
    const geometry = linearDimensionGeometry(
      entity.points[0],
      entity.points[1],
      offsetFromAnchor(entity),
    );
    if (!geometry) return null;
    const dimensionStart = worldToScreen(geometry.dimensionStart, view);
    const dimensionEnd = worldToScreen(geometry.dimensionEnd, view);
    const extensionStart = geometry.extensionStart.map((point) =>
      worldToScreen(point, view),
    );
    const extensionEnd = geometry.extensionEnd.map((point) =>
      worldToScreen(point, view),
    );
    const label = worldToScreen(geometry.labelPosition, view);
    const text = entity.label ?? formatDimension(geometry.value, {
      precision: entity.precision,
      unit,
    });
    return (
      <g {...common}>
        <line
          x1={extensionStart[0].x}
          y1={extensionStart[0].y}
          x2={extensionStart[1].x}
          y2={extensionStart[1].y}
        />
        <line
          x1={extensionEnd[0].x}
          y1={extensionEnd[0].y}
          x2={extensionEnd[1].x}
          y2={extensionEnd[1].y}
        />
        <line
          x1={dimensionStart.x}
          y1={dimensionStart.y}
          x2={dimensionEnd.x}
          y2={dimensionEnd.y}
          markerStart="url(#dimension-arrow)"
          markerEnd="url(#dimension-arrow)"
        />
        <text
          x={label.x}
          y={label.y - 5}
          className="saved-dimension-text"
          textAnchor="middle"
          stroke="none"
          fill={stroke}
        >
          {text}
        </text>
      </g>
    );
  }

  if (entity.kind === 'angular-dimension' && entity.points.length >= 3) {
    const radius = entity.points[3]
      ? Math.hypot(
          entity.points[3].x - entity.points[0].x,
          entity.points[3].y - entity.points[0].y,
        )
      : undefined;
    const geometry = angularDimensionGeometry(
      entity.points[0],
      entity.points[1],
      entity.points[2],
      radius,
    );
    if (!geometry) return null;
    const center = worldToScreen(geometry.center, view);
    const first = worldToScreen(geometry.arcPoints[0], view);
    const last = worldToScreen(geometry.arcPoints.at(-1)!, view);
    const arc = geometry.arcPoints.map((point) => worldToScreen(point, view));
    const label = worldToScreen(geometry.labelPosition, view);
    const text = entity.label ?? formatDimension(
      (geometry.valueRad * 180) / Math.PI,
      { precision: entity.precision, suffix: '°' },
    );
    return (
      <g {...common}>
        <line x1={center.x} y1={center.y} x2={first.x} y2={first.y} />
        <line x1={center.x} y1={center.y} x2={last.x} y2={last.y} />
        <polyline
          points={arc.map((point) => `${point.x},${point.y}`).join(' ')}
          markerStart="url(#dimension-arrow)"
          markerEnd="url(#dimension-arrow)"
        />
        <text
          x={label.x}
          y={label.y - 5}
          className="saved-dimension-text"
          textAnchor="middle"
          stroke="none"
          fill={stroke}
        >
          {text}
        </text>
      </g>
    );
  }

  return (
    <LinearShape
      points={entity.points}
      view={view}
      color={color}
      selected={selected}
      infinite={entity.kind === 'guide'}
      dashed={entity.kind === 'guide'}
      locked={locked}
      opacity={entity.style.opacity}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    />
  );
});
