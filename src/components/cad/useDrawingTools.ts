import { useRef, type MutableRefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../app/appStore';
import type {
  DrawingPreview,
} from '../../app/store/types';
import {
  ToolBehaviorRegistry,
} from '../../app/toolRegistry';
import type {
  Project,
  ToolName,
  ViewTransform,
} from '../../app/projectTypes';
import { arcToPolyline } from '../../geometry/primitives';
import type { Point } from '../../geometry/types';

type DrawingPointerContext = {
  point: Point;
  event: ReactPointerEvent<SVGSVGElement>;
};

type UseDrawingToolsOptions = {
  project: Project;
  selectedIds: string[];
  tool: ToolName;
  view: ViewTransform;
  preview: DrawingPreview;
  shiftKeyRef: MutableRefObject<boolean>;
  setPreview: (preview: DrawingPreview) => void;
  clearSelection: () => void;
};

function distanceInScreen(a: Point, b: Point, scale: number): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale;
}

function capturePointer(event: ReactPointerEvent<SVGSVGElement>): void {
  (event.target as Element).setPointerCapture?.(event.pointerId);
}

export function useDrawingTools({
  project,
  selectedIds,
  tool,
  view,
  preview,
  shiftKeyRef,
  setPreview,
  clearSelection,
}: UseDrawingToolsOptions) {
  const rectangleStartRef = useRef<Point | null>(null);
  const circleStartRef = useRef<Point | null>(null);
  const ellipseStartRef = useRef<Point | null>(null);
  const guideStartRef = useRef<Point | null>(null);
  const knifeStartRef = useRef<Point | null>(null);

  function selectAfterCreate(created: unknown): void {
    if (created) useAppStore.getState().setActiveTool('select');
  }

  const registry = new ToolBehaviorRegistry<DrawingPointerContext>()
    .register('rectangle', {
      onPointerDown: ({ point, event }) => {
        rectangleStartRef.current = point;
        setPreview({
          type: 'rectangle',
          start: point,
          cursor: point,
          constrainSquare: shiftKeyRef.current,
        });
        capturePointer(event);
        return true;
      },
      onPointerMove: ({ point }) => {
        if (!rectangleStartRef.current || preview.type !== 'rectangle') return false;
        setPreview({
          type: 'rectangle',
          start: rectangleStartRef.current,
          cursor: point,
          constrainSquare: shiftKeyRef.current,
        });
        return true;
      },
      onPointerUp: ({ point }) => {
        const start = rectangleStartRef.current;
        if (!start) return false;
        let end = point;
        if (shiftKeyRef.current) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          end = {
            x: start.x + Math.sign(dx || 1) * side,
            y: start.y + Math.sign(dy || 1) * side,
          };
        }
        rectangleStartRef.current = null;
        setPreview({ type: 'none' });
        if (Math.abs(end.x - start.x) > 0 && Math.abs(end.y - start.y) > 0) {
          selectAfterCreate(useAppStore.getState().addRectangle(start, end));
        }
        return true;
      },
      cancel: () => {
        rectangleStartRef.current = null;
      },
    })
    .register('circle', {
      onPointerDown: ({ point, event }) => {
        circleStartRef.current = point;
        setPreview({ type: 'circle', center: point, cursor: point });
        capturePointer(event);
        return true;
      },
      onPointerMove: ({ point }) => {
        if (!circleStartRef.current || preview.type !== 'circle') return false;
        setPreview({ type: 'circle', center: circleStartRef.current, cursor: point });
        return true;
      },
      onPointerUp: ({ point }) => {
        const center = circleStartRef.current;
        if (!center) return false;
        circleStartRef.current = null;
        setPreview({ type: 'none' });
        const radius = Math.hypot(point.x - center.x, point.y - center.y);
        if (radius > 0) selectAfterCreate(useAppStore.getState().addCircle(center, radius));
        return true;
      },
      cancel: () => {
        circleStartRef.current = null;
      },
    })
    .register('ellipse', {
      onPointerDown: ({ point, event }) => {
        ellipseStartRef.current = point;
        setPreview({ type: 'ellipse', center: point, cursor: point });
        capturePointer(event);
        return true;
      },
      onPointerMove: ({ point }) => {
        if (!ellipseStartRef.current || preview.type !== 'ellipse') return false;
        setPreview({ type: 'ellipse', center: ellipseStartRef.current, cursor: point });
        return true;
      },
      onPointerUp: ({ point }) => {
        const center = ellipseStartRef.current;
        if (!center) return false;
        ellipseStartRef.current = null;
        setPreview({ type: 'none' });
        const radiusX = Math.abs(point.x - center.x);
        const radiusY = Math.abs(point.y - center.y);
        if (radiusX > 0 && radiusY > 0) {
          selectAfterCreate(
            useAppStore.getState().addEllipse(center, radiusX, radiusY),
          );
        }
        return true;
      },
      cancel: () => {
        ellipseStartRef.current = null;
      },
    })
    .register('guide-line', {
      onPointerDown: ({ point, event }) => {
        guideStartRef.current = point;
        setPreview({ type: 'guide-line', start: point, cursor: point });
        capturePointer(event);
        return true;
      },
      onPointerMove: ({ point }) => {
        if (!guideStartRef.current || preview.type !== 'guide-line') return false;
        setPreview({ type: 'guide-line', start: guideStartRef.current, cursor: point });
        return true;
      },
      onPointerUp: ({ point }) => {
        const start = guideStartRef.current;
        if (!start) return false;
        guideStartRef.current = null;
        setPreview({ type: 'none' });
        selectAfterCreate(
          useAppStore.getState().addLinearEntity([start, point], 'guide'),
        );
        return true;
      },
      cancel: () => {
        guideStartRef.current = null;
      },
    })
    .register('knife', {
      onPointerDown: ({ point, event }) => {
        knifeStartRef.current = point;
        setPreview({ type: 'knife', start: point, cursor: point });
        capturePointer(event);
        return true;
      },
      onPointerMove: ({ point }) => {
        if (!knifeStartRef.current || preview.type !== 'knife') return false;
        setPreview({ type: 'knife', start: knifeStartRef.current, cursor: point });
        return true;
      },
      onPointerUp: ({ point }) => {
        const start = knifeStartRef.current;
        if (!start) return false;
        knifeStartRef.current = null;
        setPreview({ type: 'none' });
        const target = useAppStore.getState().selectedEntityIds[0];
        if (!target) {
          useAppStore.getState().setErrorMessage('errors.knifeNoTarget');
          return true;
        }
        if (useAppStore.getState().knifeSelected(target, start, point)) {
          useAppStore.getState().setActiveTool('select');
        }
        return true;
      },
      cancel: () => {
        knifeStartRef.current = null;
      },
    });

  function drawingAnchor(): Point | undefined {
    switch (preview.type) {
      case 'polygon':
      case 'hole':
      case 'polyline':
      case 'measure':
      case 'linear-dimension':
      case 'angular-dimension':
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

  function onPointerDown(
    point: Point,
    event: ReactPointerEvent<SVGSVGElement>,
  ): boolean {
    if (registry.dispatch(tool, 'onPointerDown', { point, event })) return true;
    const state = useAppStore.getState();
    if (tool === 'hole') {
      if (preview.type !== 'hole') {
        const target = project.entities.find(
          (entity) =>
            entity.id === selectedIds[0] && entity.type === 'polygon',
        );
        if (!target || selectedIds.length !== 1) {
          state.setErrorMessage('errors.holeNeedsTarget');
          return true;
        }
        setPreview({
          type: 'hole',
          entityId: target.id,
          points: [point],
          cursor: null,
        });
      } else {
        const points = [...preview.points];
        if (
          points.length >= 3 &&
          distanceInScreen(points[0], point, view.scale) < 8
        ) {
          const created = state.addHole(preview.entityId, points);
          setPreview({ type: 'none' });
          if (created) state.setActiveTool('select');
        } else {
          setPreview({ ...preview, points: [...points, point], cursor: null });
        }
      }
      return true;
    }
    if (tool === 'polygon' || tool === 'polyline') {
      if (preview.type !== tool) {
        setPreview(
          tool === 'polygon'
            ? { type: 'polygon', points: [point], cursor: null }
            : { type: 'polyline', points: [point], cursor: null },
        );
      } else {
        const points = [...preview.points];
        if (
          tool === 'polygon' &&
          points.length >= 3 &&
          distanceInScreen(points[0], point, view.scale) < 8
        ) {
          const created = state.addPolygonFromOuter(points, {
            sourceShape: 'polygon',
            createdByOperation: 'draw',
          });
          setPreview({ type: 'none' });
          if (created) state.setActiveTool('select');
        } else {
          setPreview({ ...preview, points: [...points, point], cursor: null });
        }
      }
      return true;
    }
    if (tool === 'arc') {
      if (preview.type !== 'arc') {
        setPreview({ type: 'arc', center: point, start: null, cursor: point });
      } else if (!preview.start) {
        setPreview({ ...preview, start: point, cursor: point });
      } else {
        const points = arcToPolyline(
          preview.center,
          preview.start,
          point,
          project.settings.circleSegments,
        );
        const created = state.addLinearEntity(points, 'arc');
        setPreview({ type: 'none' });
        if (created) state.setActiveTool('select');
      }
      return true;
    }
    if (tool === 'measure') {
      setPreview(
        preview.type === 'measure'
          ? { type: 'measure', points: [...preview.points, point], cursor: null }
          : { type: 'measure', points: [point], cursor: null },
      );
      return true;
    }
    if (tool === 'linear-dimension' || tool === 'angular-dimension') {
      if (preview.type !== tool) {
        setPreview({ type: tool, points: [point], cursor: null });
      } else if (preview.points.length < 2) {
        setPreview({
          ...preview,
          points: [...preview.points, point],
          cursor: null,
        });
      } else {
        const created = state.addLinearEntity(
          [...preview.points, point],
          tool,
          {
            precision: tool === 'linear-dimension' ? 2 : 1,
            textHeight: 2.5,
          },
        );
        setPreview({ type: 'none' });
        if (created) state.setActiveTool('select');
      }
      return true;
    }
    if (tool === 'annotation') {
      const label = window.prompt('Annotation text', '');
      if (label?.trim()) {
        const created = state.addLinearEntity([point], 'annotation', {
          label: label.trim(),
          textHeight: 2.5,
          rotationDeg: 0,
        });
        if (created) state.setActiveTool('select');
      }
      return true;
    }
    if (tool === 'select' && event.target === event.currentTarget) {
      clearSelection();
      return true;
    }
    return false;
  }

  function onPointerMove(
    point: Point,
    event: ReactPointerEvent<SVGSVGElement>,
  ): boolean {
    if (registry.dispatch(tool, 'onPointerMove', { point, event })) return true;
    if (
      (tool === 'polygon' && preview.type === 'polygon') ||
      (tool === 'polyline' && preview.type === 'polyline') ||
      (tool === 'hole' && preview.type === 'hole') ||
      (tool === 'measure' && preview.type === 'measure') ||
      (tool === 'linear-dimension' && preview.type === 'linear-dimension') ||
      (tool === 'angular-dimension' && preview.type === 'angular-dimension')
    ) {
      setPreview({ ...preview, cursor: point });
      return true;
    }
    if (tool === 'arc' && preview.type === 'arc') {
      setPreview({ ...preview, cursor: point });
      return true;
    }
    return false;
  }

  function onPointerUp(
    point: Point,
    event: ReactPointerEvent<SVGSVGElement>,
  ): boolean {
    return registry.dispatch(tool, 'onPointerUp', { point, event });
  }

  function clearTransientToolState(): void {
    registry.cancelAll();
  }

  function cancelDrawing(): void {
    clearTransientToolState();
    setPreview({ type: 'none' });
  }

  return {
    drawingAnchor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    clearTransientToolState,
    cancelDrawing,
  };
}
