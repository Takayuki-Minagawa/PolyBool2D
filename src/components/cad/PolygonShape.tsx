import type { PolygonEntity, ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';

type Props = {
  entity: PolygonEntity;
  view: ViewTransform;
  selected: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGPathElement>) => void;
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

export function PolygonShape({ entity, view, selected, onPointerDown }: Props) {
  const { geometry } = entity;
  const path =
    ringToPath(geometry.outer, view) +
    ' ' +
    geometry.holes.map((h) => ringToPath(h, view)).join(' ');

  return (
    <path
      d={path}
      fill="var(--cad-fill)"
      fillRule="evenodd"
      stroke={selected ? 'var(--cad-selected-stroke)' : 'var(--cad-stroke)'}
      strokeWidth={selected ? 2 : 1.4}
      onPointerDown={onPointerDown}
      style={{ cursor: 'pointer' }}
    />
  );
}
