import type { PolygonEntity, ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';

type Props = {
  entity: PolygonEntity;
  view: ViewTransform;
  selected: boolean;
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

export function PolygonShape({
  entity,
  view,
  selected,
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
      fillOpacity={Math.max(0, Math.min(1, entity.style.opacity * 0.28))}
      fillRule="evenodd"
      stroke={
        invalid
          ? 'var(--cad-invalid-stroke, #e53935)'
          : selected
            ? 'var(--cad-selected-stroke)'
            : color ?? entity.style.stroke
      }
      strokeWidth={selected ? 2 : 1.4}
      opacity={entity.visible ? 1 : 0}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      style={{ cursor: locked ? 'not-allowed' : 'pointer' }}
    />
  );
}
