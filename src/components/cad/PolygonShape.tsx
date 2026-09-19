import { memo } from 'react';
import { displayStrokeWidth } from '../../app/displayPreferences';
import type { PolygonEntity, ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';

type Props = {
  entity: PolygonEntity;
  view: ViewTransform;
  selected: boolean;
  printWidths?: boolean;
  color?: string;
  invalid?: boolean;
  locked?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGPathElement>) => void;
  onContextMenu?: (e: React.MouseEvent<SVGPathElement>) => void;
};

function ringToPath(ring: { x: number; y: number }[], view: ViewTransform): string {
  if (ring.length === 0) return '';
  const pts = ring.map((p) => worldToScreen(p, view));
  return (
    `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} ` +
    pts
      .slice(1)
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ') +
    ' Z'
  );
}

export const PolygonShape = memo(function PolygonShape({
  entity,
  view,
  selected, printWidths = false,
  color,
  invalid = false,
  locked = false,
  onPointerDown,
  onContextMenu,
}: Props) {
  const { geometry } = entity;
  const path =
    ringToPath(geometry.outer, view) +
    ' ' +
    geometry.holes.map((h) => ringToPath(h, view)).join(' ');

  return (
    <path
      d={path}
      fill={color ?? entity.style.fill}
      fillOpacity={Math.max(0, Math.min(1, (entity.style.fillOpacity ?? entity.style.opacity * 0.28)))}
      fillRule="evenodd"
      stroke={
        invalid
          ? 'var(--cad-invalid-stroke, #e53935)'
          : selected
            ? 'var(--cad-selected-stroke)'
            : color ?? entity.style.stroke
      }
      strokeWidth={selected ? 2 : displayStrokeWidth(entity.style.strokeWidth, view.scale, printWidths)}
      strokeLinecap={entity.style.lineCap ?? 'round'} strokeLinejoin={entity.style.lineJoin ?? 'round'}
      strokeDasharray={entity.style.dashArray?.map((v) => v * view.scale).join(' ')}
      strokeDashoffset={(entity.style.dashOffset ?? 0) * view.scale}
      opacity={entity.visible ? 1 : 0}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      style={{ cursor: locked ? 'not-allowed' : 'pointer' }}
    />
  );
});
