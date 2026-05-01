import type { PolygonEntity, ViewTransform } from '../../app/projectTypes';
import { worldToScreen } from '../../app/transform';

type Props = {
  entity: PolygonEntity;
  view: ViewTransform;
  onVertexPointerDown: (
    ringType: 'outer' | 'hole',
    holeIndex: number | undefined,
    vertexIndex: number,
    e: React.PointerEvent<SVGCircleElement>,
  ) => void;
};

export function VertexHandles({ entity, view, onVertexPointerDown }: Props) {
  const handles: React.ReactElement[] = [];
  const drawRing = (
    ring: { x: number; y: number }[],
    ringType: 'outer' | 'hole',
    holeIndex?: number,
  ) => {
    ring.forEach((p, i) => {
      const sp = worldToScreen(p, view);
      handles.push(
        <circle
          key={`${ringType}-${holeIndex ?? 'o'}-${i}`}
          cx={sp.x}
          cy={sp.y}
          r={4}
          fill="var(--cad-handle-fill)"
          stroke="var(--cad-handle-stroke)"
          strokeWidth={1.5}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) =>
            onVertexPointerDown(ringType, holeIndex, i, e)
          }
        />,
      );
    });
  };
  drawRing(entity.geometry.outer, 'outer');
  entity.geometry.holes.forEach((h, hi) => drawRing(h, 'hole', hi));
  return <g>{handles}</g>;
}
