import type { Point } from '../../geometry/types';
import type { ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';

type Props = {
  points: Point[];
  view: ViewTransform;
  color: string;
  selected: boolean;
  infinite?: boolean;
  dashed?: boolean;
  locked?: boolean;
  opacity?: number;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onContextMenu?: (e: React.MouseEvent<SVGElement>) => void;
};

const GUIDE_EXTENT = 100_000;

export const LinearShape = memo(function LinearShape({
  points,
  view,
  color,
  selected,
  infinite = false,
  dashed = false,
  locked = false,
  opacity = 1,
  onPointerDown,
  onContextMenu,
}: Props) {
  const screenPoints = points.map((point) => worldToScreen(point, view));
  if (screenPoints.length < 2) return null;
  const stroke = selected ? 'var(--cad-selected-stroke)' : color;
  const common = {
    fill: 'none',
    stroke,
    strokeWidth: selected ? 2 : 1.25,
    strokeDasharray: dashed ? '7 5' : undefined,
    onPointerDown,
    onContextMenu,
    opacity,
    style: { cursor: locked ? 'not-allowed' : 'pointer' },
  };

  if (infinite) {
    const [a, b] = screenPoints;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return null;
    const ux = dx / length;
    const uy = dy / length;
    return (
      <line
        x1={a.x - ux * GUIDE_EXTENT}
        y1={a.y - uy * GUIDE_EXTENT}
        x2={a.x + ux * GUIDE_EXTENT}
        y2={a.y + uy * GUIDE_EXTENT}
        {...common}
      />
    );
  }

  return (
    <polyline
      points={screenPoints.map((point) => `${point.x},${point.y}`).join(' ')}
      {...common}
    />
  );
});
import { memo } from 'react';
