import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../app/appStore';
import { useGlobalShortcutHandler } from '../../app/globalShortcuts';
import { isEntityEffectivelyLocked, isEntityEffectivelyVisible } from '../../app/layers';
import type { ToolName, ViewTransform } from '../../app/projectTypes';
import { entityIntersectsSelection, type SelectionMode } from '../../app/selection';
import { screenToWorld } from '../../app/transform';
import type { Point } from '../../geometry/types';

const DRAG_THRESHOLD_PX = 3;

type SelectionBox = { start: Point; end: Point; mode: SelectionMode };
type SelectionDrag = {
  start: Point;
  additive: boolean;
  selectedIds: string[];
  pointerId: number;
  target: SVGSVGElement;
};

export function useBoxSelection({
  tool,
  projectId,
  view,
  getMousePoint,
}: {
  tool: ToolName;
  projectId: string;
  view: ViewTransform;
  getMousePoint: (event: ReactPointerEvent) => Point;
}) {
  const dragRef = useRef<SelectionDrag | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const cancel = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setSelectionBox(null);
    if (drag?.target.hasPointerCapture?.(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
  }, []);

  // A rectangle belongs to the view, project and tool in which it began.
  useEffect(() => cancel(), [cancel, tool, projectId, view]);
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, [cancel]);

  useGlobalShortcutHandler({
    onKeyDown: (event) => {
      if (!dragRef.current || event.key === 'Shift') return false;
      cancel();
      if (event.key === 'Escape') {
        event.preventDefault();
        return true;
      }
      return false;
    },
  }, 30);

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): boolean {
    if (tool !== 'select' || event.button !== 0 || event.target !== event.currentTarget) {
      return false;
    }
    if (dragRef.current) return true;
    const start = getMousePoint(event);
    dragRef.current = {
      start,
      additive: event.shiftKey,
      selectedIds: [...useAppStore.getState().selectedEntityIds],
      pointerId: event.pointerId,
      target: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    return true;
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): boolean {
    const drag = dragRef.current;
    if (!drag) return false;
    if (drag.pointerId !== event.pointerId) return true;
    const end = getMousePoint(event);
    if (Math.hypot(end.x - drag.start.x, end.y - drag.start.y) >= DRAG_THRESHOLD_PX) {
      setSelectionBox({ start: drag.start, end, mode: end.x >= drag.start.x ? 'window' : 'crossing' });
    } else {
      setSelectionBox(null);
    }
    return true;
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>): boolean {
    const drag = dragRef.current;
    if (!drag) return false;
    if (drag.pointerId !== event.pointerId) return true;
    const end = getMousePoint(event);
    const state = useAppStore.getState();
    if (Math.hypot(end.x - drag.start.x, end.y - drag.start.y) < DRAG_THRESHOLD_PX) {
      if (!drag.additive) state.clearSelection();
    } else {
      const a = screenToWorld(drag.start, view);
      const b = screenToWorld(end, view);
      const bounds = {
        minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
      };
      const mode = end.x >= drag.start.x ? 'window' : 'crossing';
      const ids = state.project.entities.filter((entity) =>
        isEntityEffectivelyVisible(state.project, entity) &&
        !isEntityEffectivelyLocked(state.project, entity) &&
        entityIntersectsSelection(entity, bounds, mode),
      ).map((entity) => entity.id);
      state.selectMany(drag.additive ? [...drag.selectedIds, ...ids] : ids);
    }
    cancel();
    return true;
  }

  return { selectionBox, onPointerDown, onPointerMove, onPointerUp, cancel };
}
