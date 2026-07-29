import { useRef, type MutableRefObject } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { ToolName, ViewTransform } from '../../app/projectTypes';
import { zoomAtPoint } from '../../app/transform';
import type { Point } from '../../geometry/types';

type ViewportSize = {
  width: number;
  height: number;
};

type UsePanZoomOptions = {
  size: ViewportSize;
  tool: ToolName;
  view: ViewTransform;
  spaceKeyRef: MutableRefObject<boolean>;
  setView: (
    view: ViewTransform | ((previous: ViewTransform) => ViewTransform),
  ) => void;
  getMousePoint: (
    event: ReactPointerEvent | ReactWheelEvent,
  ) => Point;
};

export function usePanZoom({
  size,
  tool,
  view,
  spaceKeyRef,
  setView,
  getMousePoint,
}: UsePanZoomOptions) {
  const panRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  function beginPan(event: ReactPointerEvent<SVGSVGElement>): boolean {
    const shouldPan =
      event.button === 1 ||
      (event.button === 0 && (tool === 'pan' || spaceKeyRef.current));
    if (!shouldPan) return false;
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: view.offsetX,
      offsetY: view.offsetY,
    };
    (event.target as Element).setPointerCapture?.(event.pointerId);
    return true;
  }

  function movePan(event: ReactPointerEvent<SVGSVGElement>): boolean {
    const pan = panRef.current;
    if (!pan) return false;
    setView({
      scale: view.scale,
      offsetX: pan.offsetX + event.clientX - pan.startX,
      offsetY: pan.offsetY + event.clientY - pan.startY,
    });
    return true;
  }

  function endPan(event: ReactPointerEvent<SVGSVGElement>): boolean {
    if (!panRef.current) return false;
    panRef.current = null;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    return true;
  }

  function onWheel(event: ReactWheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    setView((previous) =>
      zoomAtPoint(
        previous,
        getMousePoint(event),
        Math.exp(-event.deltaY * 0.0015),
      ),
    );
  }

  function zoomBy(factor: number): void {
    const center = { x: size.width / 2, y: size.height / 2 };
    setView((previous) => zoomAtPoint(previous, center, factor));
  }

  function cancelPan(): void {
    panRef.current = null;
  }

  return {
    beginPan,
    movePan,
    endPan,
    onWheel,
    zoomBy,
    cancelPan,
    isPanning: () => panRef.current !== null,
  };
}
