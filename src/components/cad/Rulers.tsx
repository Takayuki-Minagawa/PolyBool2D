import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ViewTransform } from '../../app/projectTypes';
import { screenToWorld, worldToScreen } from '../../app/transform';

const RULER_SIZE = 22;
const TARGET_TICK_PX = 80;

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(Math.max(raw, Number.EPSILON)));
  const fraction = raw / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

function ticks(min: number, max: number, step: number): number[] {
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(step) ||
    step <= 0 ||
    min > max
  ) return [];
  const result: number[] = [];
  const firstIndex = Math.ceil(min / step);
  const lastIndex = Math.floor(max / step);
  const count = Math.min(500, Math.max(0, lastIndex - firstIndex + 1));
  for (let index = 0; index < count; index += 1) {
    const value = (firstIndex + index) * step;
    if (!Number.isFinite(value) || value > max) break;
    const normalized = Object.is(value, -0) ? 0 : value;
    if (result.at(-1) !== normalized) result.push(normalized);
  }
  return result;
}

function formatTick(value: number): string {
  const rounded = Math.abs(value) >= 1_000_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
    ? value.toExponential(2)
    : Number(value.toPrecision(6)).toString();
  return Object.is(value, -0) ? '0' : rounded;
}

export function Rulers({
  width,
  height,
  view,
  onCreateGuide,
}: {
  width: number;
  height: number;
  view: ViewTransform;
  onCreateGuide?: (orientation: 'horizontal' | 'vertical', coordinate: number) => void;
}) {
  const step = niceStep(TARGET_TICK_PX / view.scale);
  const dragCleanup = useRef<(() => void) | null>(null);
  const { xTicks, yTicks } = useMemo(() => {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= RULER_SIZE ||
      height <= RULER_SIZE ||
      !Number.isFinite(view.scale) ||
      view.scale <= 0 ||
      !Number.isFinite(view.offsetX) ||
      !Number.isFinite(view.offsetY)
    ) return { xTicks: [], yTicks: [] };
    const bottomLeft = screenToWorld({ x: RULER_SIZE, y: height }, view);
    const topRight = screenToWorld({ x: width, y: RULER_SIZE }, view);
    return {
      xTicks: ticks(bottomLeft.x, topRight.x, step),
      yTicks: ticks(bottomLeft.y, topRight.y, step),
    };
  }, [height, step, view, width]);

  useEffect(() => () => dragCleanup.current?.(), []);

  const beginGuideDrag = (
    orientation: 'horizontal' | 'vertical',
    event: ReactPointerEvent<SVGGElement>,
  ) => {
    if (!onCreateGuide || event.button !== 0) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    dragCleanup.current?.();

    const activePointerId = event.pointerId;
    const matchesPointer = (next: PointerEvent) =>
      !Number.isFinite(activePointerId) ||
      !Number.isFinite(next.pointerId) ||
      next.pointerId === activePointerId;
    const cleanup = () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cleanup);
      if (dragCleanup.current === cleanup) dragCleanup.current = null;
    };
    const cancel = (next: PointerEvent) => {
      if (!matchesPointer(next)) return;
      cleanup();
    };
    const finish = (next: PointerEvent) => {
      if (!matchesPointer(next)) return;
      cleanup();
      const rect = svg.getBoundingClientRect();
      if (
        !(rect.width > 0) ||
        !(rect.height > 0) ||
        !Number.isFinite(next.clientX) ||
        !Number.isFinite(next.clientY)
      ) return;
      const screen = {
        x: ((next.clientX - rect.left) * width) / rect.width,
        y: ((next.clientY - rect.top) * height) / rect.height,
      };
      const world = screenToWorld(screen, view);
      const coordinate = orientation === 'vertical' ? world.x : world.y;
      if (Number.isFinite(coordinate)) {
        onCreateGuide(orientation, coordinate);
      }
    };
    dragCleanup.current = cleanup;
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cleanup);
  };

  return (
    <g className="cad-rulers">
      <g
        data-ruler-orientation="vertical"
        onPointerDown={(event) => beginGuideDrag('vertical', event)}
      >
        <rect x={0} y={0} width={width} height={RULER_SIZE} className="cad-ruler-bg" />
        {xTicks.map((value) => {
          const x = worldToScreen({ x: value, y: 0 }, view).x;
          return (
            <g key={`x-${value}`}>
              <line x1={x} y1={RULER_SIZE - 7} x2={x} y2={RULER_SIZE} className="cad-ruler-tick" />
              <text x={x + 2} y={10} className="cad-ruler-text">{formatTick(value)}</text>
            </g>
          );
        })}
      </g>
      <g
        data-ruler-orientation="horizontal"
        onPointerDown={(event) => beginGuideDrag('horizontal', event)}
      >
        <rect x={0} y={0} width={RULER_SIZE} height={height} className="cad-ruler-bg" />
        {yTicks.map((value) => {
          const y = worldToScreen({ x: 0, y: value }, view).y;
          return (
            <g key={`y-${value}`}>
              <line x1={RULER_SIZE - 7} y1={y} x2={RULER_SIZE} y2={y} className="cad-ruler-tick" />
              <text x={2} y={y - 2} className="cad-ruler-text">{formatTick(value)}</text>
            </g>
          );
        })}
      </g>
      <rect x={0} y={0} width={RULER_SIZE} height={RULER_SIZE} className="cad-ruler-corner" />
    </g>
  );
}
