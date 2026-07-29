import { useCallback, useRef } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useAppStore } from '../../app/appStore';
import {
  isEntityEffectivelyVisible,
} from '../../app/layers';
import {
  boundsForEntities,
  defaultView,
  fitBoundsToView,
  screenToWorld,
} from '../../app/transform';
import {
  constrainPointToAngle,
  snapWorldPoint,
} from '../../app/snapping';
import { setViewportCursor } from '../../app/viewportStatusStore';
import type { Point } from '../../geometry/types';
import { useDrawingKeyboard } from './useDrawingKeyboard';
import { useDrawingTools } from './useDrawingTools';
import { useEntityDragging } from './useEntityDragging';
import { usePanZoom } from './usePanZoom';

type ViewportSize = {
  width: number;
  height: number;
};

export function useCadViewportInteractions(size: ViewportSize) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shiftKeyRef = useRef(false);
  const spaceKeyRef = useRef(false);

  const project = useAppStore((state) => state.project);
  const selectedIds = useAppStore((state) => state.selectedEntityIds);
  const tool = useAppStore((state) => state.activeTool);
  const view = useAppStore((state) => state.view);
  const preview = useAppStore((state) => state.preview);
  const snapEnabled = useAppStore((state) => state.ui.snapEnabled);
  const snapRevision = useAppStore((state) => state.snapRevision);
  const setView = useAppStore((state) => state.setView);
  const setPreview = useAppStore((state) => state.setPreview);
  const selectEntity = useAppStore((state) => state.selectEntity);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const deleteVertex = useAppStore((state) => state.deleteVertex);
  const updateEntityGeometryTransient = useAppStore(
    (state) => state.updateEntityGeometryTransient,
  );
  const updateEntitiesTransient = useAppStore(
    (state) => state.updateEntitiesTransient,
  );
  const validateEntity = useAppStore((state) => state.validateEntity);

  const fitViewToContent = useCallback(() => {
    const visibleEntities = project.entities.filter((entity) =>
      isEntityEffectivelyVisible(project, entity),
    );
    const selectedVisibleEntities = visibleEntities.filter((entity) =>
      selectedIds.includes(entity.id),
    );
    const entities =
      selectedVisibleEntities.length > 0
        ? selectedVisibleEntities
        : visibleEntities;
    const bounds = boundsForEntities(entities);
    setView(
      bounds
        ? fitBoundsToView(bounds, size.width, size.height)
        : defaultView(size.width, size.height),
    );
  }, [project, selectedIds, setView, size.height, size.width]);

  function getMousePoint(
    event: ReactPointerEvent | ReactWheelEvent,
  ): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  const drawing = useDrawingTools({
    project,
    selectedIds,
    tool,
    view,
    preview,
    shiftKeyRef,
    setPreview,
    clearSelection,
  });

  function getWorldPoint(
    screen: Point,
    anchor = drawing.drawingAnchor(),
  ): Point {
    const world = screenToWorld(screen, view);
    const supportsAngularConstraint =
      tool === 'polygon' ||
      tool === 'hole' ||
      tool === 'polyline' ||
      tool === 'measure' ||
      tool === 'guide-line' ||
      tool === 'knife' ||
      tool === 'arc';
    const context = {
      anchor,
      angleIncrementDeg:
        supportsAngularConstraint &&
        snapEnabled &&
        project.settings.angleSnapEnabled
          ? project.settings.angleSnapIncrementDeg
          : undefined,
      ortho: supportsAngularConstraint && shiftKeyRef.current,
    };
    return snapEnabled
      ? snapWorldPoint(world, project, view, context, snapRevision)
      : constrainPointToAngle(world, context);
  }

  const entityDragging = useEntityDragging({
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
  });

  const panZoom = usePanZoom({
    size,
    tool,
    view,
    spaceKeyRef,
    setView,
    getMousePoint,
  });

  const drawingKeyboard = useDrawingKeyboard({
    fitViewToContent,
    cancelDrawing: drawing.cancelDrawing,
    clearTransientToolState: drawing.clearTransientToolState,
    shiftKeyRef,
    spaceKeyRef,
  });

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (panZoom.beginPan(event)) return;
    if (event.button !== 0) return;
    const world = getWorldPoint(getMousePoint(event));
    drawingKeyboard.resetNumericInput();
    drawing.onPointerDown(world, event);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const screen = getMousePoint(event);
    if (panZoom.movePan(event) || entityDragging.onPointerMove(screen)) return;
    const world = getWorldPoint(screen);
    setViewportCursor(world);
    drawing.onPointerMove(world, event);
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
    if (panZoom.endPan(event) || entityDragging.onPointerUp()) return;
    drawing.onPointerUp(getWorldPoint(getMousePoint(event)), event);
  }

  function onPointerCancel(): void {
    panZoom.cancelPan();
    entityDragging.cancel();
    drawing.clearTransientToolState();
    drawingKeyboard.resetNumericInput();
    setViewportCursor(null);
  }

  function onPointerLeave(): void {
    setViewportCursor(null);
  }

  return {
    svgRef,
    fitViewToContent,
    zoomBy: panZoom.zoomBy,
    onWheel: panZoom.onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onShapePointerDown: entityDragging.onShapePointerDown,
    onVertexPointerDown: entityDragging.onVertexPointerDown,
    numericInput: drawingKeyboard.numericInput,
    cursor:
      panZoom.isPanning() || tool === 'pan' || spaceKeyRef.current
        ? 'grabbing'
        : 'crosshair',
  };
}
