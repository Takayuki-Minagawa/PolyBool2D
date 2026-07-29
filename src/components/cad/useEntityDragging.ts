import { useRef, type MutableRefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../app/appStore';
import {
  isEntityEffectivelyLocked,
  isEntityEffectivelyVisible,
} from '../../app/layers';
import type {
  Entity,
  PolygonEntity,
  Project,
  ToolName,
  ViewTransform,
} from '../../app/projectTypes';
import { screenToWorld } from '../../app/transform';
import { translatePolygon } from '../../geometry/translate';
import type { Point } from '../../geometry/types';

const MOVE_THRESHOLD_PX = 3;

type MoveDrag = {
  startWorld: Point;
  originals: Map<string, Entity>;
  moved: boolean;
};

type UseEntityDraggingOptions = {
  project: Project;
  tool: ToolName;
  view: ViewTransform;
  spaceKeyRef: MutableRefObject<boolean>;
  getMousePoint: (event: ReactPointerEvent) => Point;
  getWorldPoint: (screen: Point) => Point;
  selectEntity: (id: string, additive: boolean) => void;
  deleteVertex: ReturnType<typeof useAppStore.getState>['deleteVertex'];
  updateEntityGeometryTransient:
    ReturnType<typeof useAppStore.getState>['updateEntityGeometryTransient'];
  updateEntitiesTransient:
    ReturnType<typeof useAppStore.getState>['updateEntitiesTransient'];
  validateEntity: ReturnType<typeof useAppStore.getState>['validateEntity'];
};

export function useEntityDragging({
  project,
  tool,
  view,
  spaceKeyRef,
  getMousePoint,
  getWorldPoint,
  selectEntity,
  deleteVertex,
  updateEntityGeometryTransient,
  updateEntitiesTransient,
  validateEntity,
}: UseEntityDraggingOptions) {
  const vertexDragRef = useRef<{
    entityId: string;
    ringType: 'outer' | 'hole';
    holeIndex?: number;
    vertexIndex: number;
    startScreen: Point;
    moved: boolean;
  } | null>(null);
  const moveDragRef = useRef<MoveDrag | null>(null);
  const pendingSelectRef = useRef<string | null>(null);

  function onPointerMove(screen: Point): boolean {
    if (moveDragRef.current) {
      const drag = moveDragRef.current;
      const raw = screenToWorld(screen, view);
      const dx = raw.x - drag.startWorld.x;
      const dy = raw.y - drag.startWorld.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) * view.scale < MOVE_THRESHOLD_PX) return true;
        useAppStore.getState().pushHistory();
        drag.moved = true;
      }
      const updates = new Map<string, Entity>();
      for (const [id, original] of drag.originals) {
        updates.set(
          id,
          original.type === 'polygon'
            ? {
                ...original,
                geometry: translatePolygon(original.geometry, dx, dy),
              }
            : {
                ...original,
                points: original.points.map((point) => ({
                  x: point.x + dx,
                  y: point.y + dy,
                })),
              },
        );
      }
      updateEntitiesTransient(updates);
      return true;
    }

    const drag = vertexDragRef.current;
    if (!drag) return false;
    if (!drag.moved) {
      const dx = screen.x - drag.startScreen.x;
      const dy = screen.y - drag.startScreen.y;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return true;
      useAppStore.getState().pushHistory();
      drag.moved = true;
    }
    const entity = project.entities.find(
      (item) => item.id === drag.entityId && item.type === 'polygon',
    ) as PolygonEntity | undefined;
    if (!entity) return true;
    const world = getWorldPoint(screen);
    updateEntityGeometryTransient(drag.entityId, {
      outer: entity.geometry.outer.map((point, index) =>
        drag.ringType === 'outer' && index === drag.vertexIndex
          ? world
          : point,
      ),
      holes: entity.geometry.holes.map((hole, holeIndex) =>
        drag.ringType === 'hole' && holeIndex === drag.holeIndex
          ? hole.map((point, index) =>
              index === drag.vertexIndex ? world : point,
            )
          : hole,
      ),
    });
    return true;
  }

  function onPointerUp(): boolean {
    if (moveDragRef.current) {
      const drag = moveDragRef.current;
      moveDragRef.current = null;
      if (!drag.moved && pendingSelectRef.current) {
        selectEntity(pendingSelectRef.current, false);
      }
      pendingSelectRef.current = null;
      return true;
    }
    if (vertexDragRef.current) {
      const drag = vertexDragRef.current;
      vertexDragRef.current = null;
      if (drag.moved) validateEntity(drag.entityId);
      return true;
    }
    return false;
  }

  function onShapePointerDown(
    entityId: string,
    event: ReactPointerEvent,
  ): void {
    if (event.button !== 0) return;
    const state = useAppStore.getState();
    const entity = state.project.entities.find((item) => item.id === entityId);
    if (
      !entity ||
      !isEntityEffectivelyVisible(state.project, entity) ||
      isEntityEffectivelyLocked(state.project, entity)
    ) {
      return;
    }
    if (tool === 'select') {
      if (spaceKeyRef.current) return;
      event.stopPropagation();
      if (event.shiftKey) {
        selectEntity(entityId, true);
        return;
      }
      const alreadySelected = state.selectedEntityIds.includes(entityId);
      const ids = alreadySelected ? state.selectedEntityIds : [entityId];
      if (!alreadySelected) selectEntity(entityId, false);
      pendingSelectRef.current = alreadySelected ? entityId : null;
      const originals = new Map<string, Entity>();
      for (const item of state.project.entities) {
        if (
          ids.includes(item.id) &&
          !isEntityEffectivelyLocked(state.project, item)
        ) {
          originals.set(item.id, item);
        }
      }
      moveDragRef.current = {
        startWorld: screenToWorld(getMousePoint(event), view),
        originals,
        moved: false,
      };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } else if (tool === 'vertex-edit') {
      event.stopPropagation();
      selectEntity(entityId, event.shiftKey);
    } else if (tool === 'knife') {
      event.stopPropagation();
      selectEntity(entityId, false);
    }
  }

  function onVertexPointerDown(
    entityId: string,
    ringType: 'outer' | 'hole',
    holeIndex: number | undefined,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ): void {
    if (event.button !== 0 || (tool !== 'select' && tool !== 'vertex-edit')) {
      return;
    }
    event.stopPropagation();
    if (event.altKey) {
      deleteVertex({ entityId, ringType, holeIndex, vertexIndex });
      return;
    }
    vertexDragRef.current = {
      entityId,
      ringType,
      holeIndex,
      vertexIndex,
      startScreen: getMousePoint(event),
      moved: false,
    };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  function cancel(): void {
    moveDragRef.current = null;
    pendingSelectRef.current = null;
    vertexDragRef.current = null;
  }

  return {
    onPointerMove,
    onPointerUp,
    onShapePointerDown,
    onVertexPointerDown,
    cancel,
  };
}
