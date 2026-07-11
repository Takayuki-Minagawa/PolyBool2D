import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useAppStore } from '../../app/appStore';
import { hasBlockingOverlay, isEditableTarget } from '../../app/domGuards';
import type { Entity, PolygonEntity } from '../../app/projectTypes';
import { isEntityEffectivelyLocked, isEntityEffectivelyVisible } from '../../app/layers';
import {
  boundsForEntities,
  defaultView,
  fitBoundsToView,
  screenToWorld,
  zoomAtPoint,
} from '../../app/transform';
import { constrainPointToAngle, snapWorldPoint } from '../../app/snapping';
import { translatePolygon } from '../../geometry/translate';
import { pointAtDistance, parseDrawingDistance } from '../../geometry/drawingInput';
import { arcToPolyline } from '../../geometry/primitives';
import type { Point } from '../../geometry/types';

const MOVE_THRESHOLD_PX = 3;

function distanceInScreen(a: Point, b: Point, scale: number): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale;
}

type ViewportSize = {
  width: number;
  height: number;
};

type MoveDrag = {
  startWorld: Point;
  originals: Map<string, Entity>;
  moved: boolean;
};

export function useCadViewportInteractions(size: ViewportSize) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [numericInput, setNumericInput] = useState('');

  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const tool = useAppStore((s) => s.activeTool);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const preview = useAppStore((s) => s.preview);
  const setPreview = useAppStore((s) => s.setPreview);
  const snapEnabled = useAppStore((s) => s.ui.snapEnabled);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const addRectangle = useAppStore((s) => s.addRectangle);
  const addCircle = useAppStore((s) => s.addCircle);
  const addEllipse = useAppStore((s) => s.addEllipse);
  const addLinearEntity = useAppStore((s) => s.addLinearEntity);
  const addHole = useAppStore((s) => s.addHole);
  const addPolygonFromOuter = useAppStore((s) => s.addPolygonFromOuter);
  const selectEntity = useAppStore((s) => s.selectEntity);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const knifeSelected = useAppStore((s) => s.knifeSelected);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const deleteVertex = useAppStore((s) => s.deleteVertex);
  const updateEntityGeometryTransient = useAppStore((s) => s.updateEntityGeometryTransient);
  const updateEntitiesTransient = useAppStore((s) => s.updateEntitiesTransient);
  const validateEntity = useAppStore((s) => s.validateEntity);

  const isPanningRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(
    null,
  );
  const draggingVertexRef = useRef<{
    entityId: string;
    ringType: 'outer' | 'hole';
    holeIndex?: number;
    vertexIndex: number;
    startScreen: Point;
    moved: boolean;
  } | null>(null);
  const moveDragRef = useRef<MoveDrag | null>(null);
  const pendingSelectRef = useRef<string | null>(null);
  const rectStartRef = useRef<Point | null>(null);
  const circleStartRef = useRef<Point | null>(null);
  const ellipseStartRef = useRef<Point | null>(null);
  const guideStartRef = useRef<Point | null>(null);
  const knifeStartRef = useRef<Point | null>(null);
  const shiftKeyRef = useRef(false);
  const spaceKeyRef = useRef(false);

  const fitViewToContent = useCallback(() => {
    const visibleEntities = project.entities.filter((entity) =>
      isEntityEffectivelyVisible(project, entity),
    );
    const selectedVisibleEntities = visibleEntities.filter((entity) =>
      selectedIds.includes(entity.id),
    );
    const entities =
      selectedVisibleEntities.length > 0 ? selectedVisibleEntities : visibleEntities;
    const bounds = boundsForEntities(entities);
    setView(
      bounds
        ? fitBoundsToView(bounds, size.width, size.height)
        : defaultView(size.width, size.height),
    );
  }, [project, selectedIds, setView, size.height, size.width]);

  const zoomBy = useCallback(
    (factor: number) => {
      const center = { x: size.width / 2, y: size.height / 2 };
      setView((prev) => zoomAtPoint(prev, center, factor));
    },
    [setView, size.height, size.width],
  );

  function getMousePoint(e: ReactPointerEvent | ReactWheelEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function drawingAnchor(): Point | undefined {
    switch (preview.type) {
      case 'polygon':
      case 'hole':
      case 'polyline':
      case 'measure':
        return preview.points.at(-1);
      case 'rectangle':
      case 'knife':
      case 'guide-line':
        return preview.start;
      case 'circle':
      case 'ellipse':
        return preview.center;
      case 'arc':
        return preview.start ?? preview.center;
      default:
        return undefined;
    }
  }

  function getWorldPoint(screen: Point, anchor = drawingAnchor()): Point {
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
      angleIncrementDeg: supportsAngularConstraint && snapEnabled && project.settings.angleSnapEnabled
        ? project.settings.angleSnapIncrementDeg
        : undefined,
      ortho: supportsAngularConstraint && shiftKeyRef.current,
    };
    return snapEnabled
      ? snapWorldPoint(world, project, view, context)
      : constrainPointToAngle(world, context);
  }

  function onWheel(e: ReactWheelEvent<SVGSVGElement>) {
    e.preventDefault();
    setView((prev) =>
      zoomAtPoint(prev, getMousePoint(e), Math.exp(-e.deltaY * 0.0015)),
    );
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 1) {
      isPanningRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        offX: view.offsetX,
        offY: view.offsetY,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'pan' || spaceKeyRef.current) {
      isPanningRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        offX: view.offsetX,
        offY: view.offsetY,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const screen = getMousePoint(e);
    const w = getWorldPoint(screen);
    setNumericInput('');

    if (tool === 'rectangle') {
      rectStartRef.current = w;
      setPreview({ type: 'rectangle', start: w, cursor: w, constrainSquare: shiftKeyRef.current });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'circle') {
      circleStartRef.current = w;
      setPreview({ type: 'circle', center: w, cursor: w });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'ellipse') {
      ellipseStartRef.current = w;
      setPreview({ type: 'ellipse', center: w, cursor: w });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'guide-line') {
      guideStartRef.current = w;
      setPreview({ type: 'guide-line', start: w, cursor: w });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'knife') {
      knifeStartRef.current = w;
      setPreview({ type: 'knife', start: w, cursor: w });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'hole') {
      if (preview.type !== 'hole') {
        const target = project.entities.find(
          (entity) => entity.id === selectedIds[0] && entity.type === 'polygon',
        );
        if (!target || selectedIds.length !== 1) {
          useAppStore.getState().setErrorMessage('errors.holeNeedsTarget');
          return;
        }
        setPreview({ type: 'hole', entityId: target.id, points: [w], cursor: null });
      } else {
        const points = [...preview.points];
        if (points.length >= 3 && distanceInScreen(points[0], w, view.scale) < 8) {
          const created = addHole(preview.entityId, points);
          setPreview({ type: 'none' });
          if (created) setActiveTool('select');
          return;
        }
        setPreview({ ...preview, points: [...points, w], cursor: null });
      }
      return;
    }
    if (tool === 'polygon' || tool === 'polyline') {
      if (preview.type !== tool) {
        setPreview(
          tool === 'polygon'
            ? { type: 'polygon', points: [w], cursor: null }
            : { type: 'polyline', points: [w], cursor: null },
        );
      } else {
        const points = [...preview.points];
        if (
          tool === 'polygon' &&
          points.length >= 3 &&
          distanceInScreen(points[0], w, view.scale) < 8
        ) {
          const created = addPolygonFromOuter(points, {
            sourceShape: 'polygon',
            createdByOperation: 'draw',
          });
          setPreview({ type: 'none' });
          if (created) setActiveTool('select');
          return;
        }
        setPreview({ ...preview, points: [...points, w], cursor: null });
      }
      return;
    }
    if (tool === 'arc') {
      if (preview.type !== 'arc') {
        setPreview({ type: 'arc', center: w, start: null, cursor: w });
      } else if (!preview.start) {
        setPreview({ ...preview, start: w, cursor: w });
      } else {
        const points = arcToPolyline(
          preview.center,
          preview.start,
          w,
          project.settings.circleSegments,
        );
        const created = addLinearEntity(points, 'arc');
        setPreview({ type: 'none' });
        if (created) setActiveTool('select');
      }
      return;
    }
    if (tool === 'measure') {
      if (preview.type !== 'measure') {
        setPreview({ type: 'measure', points: [w], cursor: null });
      } else {
        setPreview({ type: 'measure', points: [...preview.points, w], cursor: null });
      }
      return;
    }
    if (tool === 'select' && e.target === svgRef.current) {
      clearSelection();
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const screen = getMousePoint(e);

    if (isPanningRef.current) {
      setView({
        scale: view.scale,
        offsetX: isPanningRef.current.offX + (e.clientX - isPanningRef.current.startX),
        offsetY: isPanningRef.current.offY + (e.clientY - isPanningRef.current.startY),
      });
      return;
    }
    if (moveDragRef.current) {
      const drag = moveDragRef.current;
      const raw = screenToWorld(screen, view);
      const dx = raw.x - drag.startWorld.x;
      const dy = raw.y - drag.startWorld.y;
      if (!drag.moved) {
        if (Math.sqrt(dx * dx + dy * dy) * view.scale < MOVE_THRESHOLD_PX) return;
        useAppStore.getState().pushHistory();
        drag.moved = true;
      }
      const updates = new Map<string, Entity>();
      for (const [id, original] of drag.originals) {
        updates.set(
          id,
          original.type === 'polygon'
            ? { ...original, geometry: translatePolygon(original.geometry, dx, dy) }
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
      return;
    }
    const w = getWorldPoint(screen);
    setStatusMessage(
      `X: ${w.x.toFixed(project.settings.coordinatePrecision)}, Y: ${w.y.toFixed(project.settings.coordinatePrecision)}`,
    );
    if (draggingVertexRef.current) {
      const drag = draggingVertexRef.current;
      if (!drag.moved) {
        const dxScreen = screen.x - drag.startScreen.x;
        const dyScreen = screen.y - drag.startScreen.y;
        if (Math.sqrt(dxScreen * dxScreen + dyScreen * dyScreen) < MOVE_THRESHOLD_PX) return;
        useAppStore.getState().pushHistory();
        drag.moved = true;
      }
      const ent = project.entities.find(
        (x) => x.id === drag.entityId && x.type === 'polygon',
      ) as PolygonEntity | undefined;
      if (!ent) return;
      const newGeom = {
        outer: ent.geometry.outer.map((p, i) =>
          drag.ringType === 'outer' && i === drag.vertexIndex ? w : p,
        ),
        holes: ent.geometry.holes.map((h, hi) =>
          drag.ringType === 'hole' && hi === drag.holeIndex
            ? h.map((p, i) => (i === drag.vertexIndex ? w : p))
            : h,
        ),
      };
      updateEntityGeometryTransient(drag.entityId, newGeom);
      return;
    }
    if (rectStartRef.current && tool === 'rectangle' && preview.type === 'rectangle') {
      setPreview({
        type: 'rectangle',
        start: rectStartRef.current,
        cursor: w,
        constrainSquare: shiftKeyRef.current,
      });
      return;
    }
    if (circleStartRef.current && tool === 'circle' && preview.type === 'circle') {
      setPreview({ type: 'circle', center: circleStartRef.current, cursor: w });
      return;
    }
    if (ellipseStartRef.current && tool === 'ellipse' && preview.type === 'ellipse') {
      setPreview({ type: 'ellipse', center: ellipseStartRef.current, cursor: w });
      return;
    }
    if (guideStartRef.current && tool === 'guide-line' && preview.type === 'guide-line') {
      setPreview({ type: 'guide-line', start: guideStartRef.current, cursor: w });
      return;
    }
    if (knifeStartRef.current && tool === 'knife' && preview.type === 'knife') {
      setPreview({ type: 'knife', start: knifeStartRef.current, cursor: w });
      return;
    }
    if (
      (tool === 'polygon' && preview.type === 'polygon') ||
      (tool === 'polyline' && preview.type === 'polyline') ||
      (tool === 'hole' && preview.type === 'hole') ||
      (tool === 'measure' && preview.type === 'measure')
    ) {
      setPreview({ ...preview, cursor: w });
      return;
    }
    if (tool === 'arc' && preview.type === 'arc') {
      setPreview({ ...preview, cursor: w });
    }
  }

  function onPointerCancel() {
    isPanningRef.current = null;
    moveDragRef.current = null;
    pendingSelectRef.current = null;
    draggingVertexRef.current = null;
    rectStartRef.current = null;
    circleStartRef.current = null;
    ellipseStartRef.current = null;
    guideStartRef.current = null;
    knifeStartRef.current = null;
    setNumericInput('');
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (isPanningRef.current) {
      isPanningRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }
    if (moveDragRef.current) {
      const drag = moveDragRef.current;
      moveDragRef.current = null;
      if (!drag.moved && pendingSelectRef.current) {
        selectEntity(pendingSelectRef.current, false);
      }
      pendingSelectRef.current = null;
      return;
    }
    if (draggingVertexRef.current) {
      const drag = draggingVertexRef.current;
      draggingVertexRef.current = null;
      if (drag.moved) validateEntity(drag.entityId);
      return;
    }
    const screen = getMousePoint(e);
    const w = getWorldPoint(screen);

    if (rectStartRef.current && tool === 'rectangle') {
      let end = w;
      if (shiftKeyRef.current) {
        const dx = end.x - rectStartRef.current.x;
        const dy = end.y - rectStartRef.current.y;
        const s = Math.max(Math.abs(dx), Math.abs(dy));
        end = {
          x: rectStartRef.current.x + Math.sign(dx || 1) * s,
          y: rectStartRef.current.y + Math.sign(dy || 1) * s,
        };
      }
      if (Math.abs(end.x - rectStartRef.current.x) > 0 && Math.abs(end.y - rectStartRef.current.y) > 0) {
        const created = addRectangle(rectStartRef.current, end);
        if (created) setActiveTool('select');
      }
      rectStartRef.current = null;
      setPreview({ type: 'none' });
      return;
    }
    if (circleStartRef.current && tool === 'circle') {
      const dx = w.x - circleStartRef.current.x;
      const dy = w.y - circleStartRef.current.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 0) {
        const created = addCircle(circleStartRef.current, r);
        if (created) setActiveTool('select');
      }
      circleStartRef.current = null;
      setPreview({ type: 'none' });
      return;
    }
    if (ellipseStartRef.current && tool === 'ellipse') {
      const center = ellipseStartRef.current;
      const radiusX = Math.abs(w.x - center.x);
      const radiusY = Math.abs(w.y - center.y);
      if (radiusX > 0 && radiusY > 0) {
        const created = addEllipse(center, radiusX, radiusY);
        if (created) setActiveTool('select');
      }
      ellipseStartRef.current = null;
      setPreview({ type: 'none' });
      return;
    }
    if (guideStartRef.current && tool === 'guide-line') {
      const start = guideStartRef.current;
      guideStartRef.current = null;
      setPreview({ type: 'none' });
      const created = addLinearEntity([start, w], 'guide');
      if (created) setActiveTool('select');
      return;
    }
    if (knifeStartRef.current && tool === 'knife') {
      const start = knifeStartRef.current;
      knifeStartRef.current = null;
      setPreview({ type: 'none' });
      const sel = selectedIds[0];
      if (!sel) {
        useAppStore.getState().setErrorMessage('errors.knifeNoTarget');
        return;
      }
      const ok = knifeSelected(sel, start, w);
      if (ok) setActiveTool('select');
    }
  }

  function onShapePointerDown(entityId: string, e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const entity = useAppStore.getState().project.entities.find((item) => item.id === entityId);
    if (
      !entity ||
      !isEntityEffectivelyVisible(useAppStore.getState().project, entity) ||
      isEntityEffectivelyLocked(useAppStore.getState().project, entity)
    ) {
      return;
    }
    if (tool === 'select') {
      if (e.button !== 0 || spaceKeyRef.current) return;
      e.stopPropagation();
      if (e.shiftKey) {
        selectEntity(entityId, true);
        return;
      }
      const state = useAppStore.getState();
      const alreadySelected = state.selectedEntityIds.includes(entityId);
      const ids = alreadySelected ? state.selectedEntityIds : [entityId];
      if (!alreadySelected) selectEntity(entityId, false);
      pendingSelectRef.current = alreadySelected ? entityId : null;

      const originals = new Map<string, Entity>();
      for (const ent of state.project.entities) {
        if (
          ids.includes(ent.id) &&
          !isEntityEffectivelyLocked(state.project, ent)
        ) {
          originals.set(ent.id, ent);
        }
      }
      moveDragRef.current = {
        startWorld: screenToWorld(getMousePoint(e), view),
        originals,
        moved: false,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (tool === 'vertex-edit') {
      e.stopPropagation();
      selectEntity(entityId, e.shiftKey);
    } else if (tool === 'knife') {
      e.stopPropagation();
      selectEntity(entityId, false);
    }
  }

  function onVertexPointerDown(
    entityId: string,
    ringType: 'outer' | 'hole',
    holeIndex: number | undefined,
    vertexIndex: number,
    e: ReactPointerEvent<SVGCircleElement>,
  ) {
    if (e.button !== 0) return;
    if (tool !== 'select' && tool !== 'vertex-edit') return;
    e.stopPropagation();
    if (e.altKey) {
      deleteVertex({ entityId, ringType, holeIndex, vertexIndex });
      return;
    }
    draggingVertexRef.current = {
      entityId,
      ringType,
      holeIndex,
      vertexIndex,
      startScreen: getMousePoint(e),
      moved: false,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    function finishPointSequence() {
      const state = useAppStore.getState();
      const p = state.preview;
      if (p.type === 'polygon' && p.points.length >= 3) {
        const created = state.addPolygonFromOuter(p.points, {
          sourceShape: 'polygon',
          createdByOperation: 'draw',
        });
        state.setPreview({ type: 'none' });
        if (created) state.setActiveTool('select');
      } else if (p.type === 'hole' && p.points.length >= 3) {
        const created = state.addHole(p.entityId, p.points);
        state.setPreview({ type: 'none' });
        if (created) state.setActiveTool('select');
      } else if (p.type === 'polyline' && p.points.length >= 2) {
        const created = state.addLinearEntity(p.points, 'polyline');
        state.setPreview({ type: 'none' });
        if (created) state.setActiveTool('select');
      } else if (p.type === 'measure') {
        state.setPreview({ type: 'none' });
      }
    }

    function commitNumericDistance(distanceValue: number): boolean {
      const state = useAppStore.getState();
      const p = state.preview;
      if (
        (p.type === 'polygon' ||
          p.type === 'hole' ||
          p.type === 'polyline' ||
          p.type === 'measure') &&
        p.cursor
      ) {
        const anchor = p.points.at(-1);
        const point = anchor ? pointAtDistance(anchor, p.cursor, distanceValue) : null;
        if (!point) return false;
        state.setPreview({ ...p, points: [...p.points, point], cursor: null });
        return true;
      }
      if (p.type === 'circle') {
        const created = state.addCircle(p.center, distanceValue);
        state.setPreview({ type: 'none' });
        circleStartRef.current = null;
        if (created) state.setActiveTool('select');
        return created !== null;
      }
      if (p.type === 'guide-line') {
        const end = pointAtDistance(p.start, p.cursor, distanceValue);
        if (!end) return false;
        const created = state.addLinearEntity([p.start, end], 'guide');
        state.setPreview({ type: 'none' });
        guideStartRef.current = null;
        if (created) state.setActiveTool('select');
        return created !== null;
      }
      if (p.type === 'knife') {
        const end = pointAtDistance(p.start, p.cursor, distanceValue);
        const target = state.selectedEntityIds[0];
        if (!end || !target) return false;
        const ok = state.knifeSelected(target, p.start, end);
        state.setPreview({ type: 'none' });
        knifeStartRef.current = null;
        if (ok) state.setActiveTool('select');
        return ok;
      }
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      const isTyping = isEditableTarget(e.target);
      if (isTyping || hasBlockingOverlay()) return;
      if (e.key === 'Shift') shiftKeyRef.current = true;
      if (e.key === ' ') spaceKeyRef.current = true;
      const drawing = useAppStore.getState().preview.type !== 'none';
      if (
        drawing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setNumericInput((current) => {
          const key = e.key === ',' ? '.' : e.key;
          if (key === '.' && current.includes('.')) return current;
          return `${current}${key}`;
        });
        return;
      }
      if (drawing && e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (numericInput) {
          setNumericInput((current) => current.slice(0, -1));
        } else {
          const state = useAppStore.getState();
          const current = state.preview;
          if (
            current.type === 'polygon' ||
            current.type === 'hole' ||
            current.type === 'polyline' ||
            current.type === 'measure'
          ) {
            if (current.points.length <= 1) state.setPreview({ type: 'none' });
            else state.setPreview({ ...current, points: current.points.slice(0, -1), cursor: null });
          }
        }
        return;
      }
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'f'
      ) {
        e.preventDefault();
        fitViewToContent();
      }
      if (e.key === 'Escape') {
        setNumericInput('');
        setPreview({ type: 'none' });
        rectStartRef.current = null;
        circleStartRef.current = null;
        ellipseStartRef.current = null;
        guideStartRef.current = null;
        knifeStartRef.current = null;
      }
      if (e.key === 'Enter') {
        if (numericInput) {
          const distanceValue = parseDrawingDistance(numericInput);
          if (distanceValue && commitNumericDistance(distanceValue)) {
            e.preventDefault();
            setNumericInput('');
            return;
          }
        }
        finishPointSequence();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') shiftKeyRef.current = false;
      if (e.key === ' ') spaceKeyRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fitViewToContent, numericInput, setPreview]);

  return {
    svgRef,
    fitViewToContent,
    zoomBy,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onShapePointerDown,
    onVertexPointerDown,
    numericInput,
    cursor: isPanningRef.current || tool === 'pan' || spaceKeyRef.current ? 'grabbing' : 'crosshair',
  };
}
