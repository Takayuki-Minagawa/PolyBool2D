import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../../app/appStore';
import type { Point } from '../../geometry/types';
import type { PolygonEntity, ViewTransform } from '../../app/projectTypes';
import { screenToWorld } from '../../app/transform';
import { snapToGrid, nearestVertex, nearestEdgePoint } from '../../geometry/snap';
import { Grid } from './Grid';
import { PolygonShape } from './PolygonShape';
import { VertexHandles } from './VertexHandles';
import { ToolPreview } from './ToolPreview';

export function CadViewport() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const tool = useAppStore((s) => s.activeTool);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const preview = useAppStore((s) => s.preview);
  const setPreview = useAppStore((s) => s.setPreview);
  const showGrid = useAppStore((s) => s.ui.showGrid);
  const snapEnabled = useAppStore((s) => s.ui.snapEnabled);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const addRectangle = useAppStore((s) => s.addRectangle);
  const addCircle = useAppStore((s) => s.addCircle);
  const addPolygonFromOuter = useAppStore((s) => s.addPolygonFromOuter);
  const selectEntity = useAppStore((s) => s.selectEntity);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const knifeSelected = useAppStore((s) => s.knifeSelected);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  const isPanningRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(
    null,
  );
  const draggingVertexRef = useRef<{
    entityId: string;
    ringType: 'outer' | 'hole';
    holeIndex?: number;
    vertexIndex: number;
  } | null>(null);
  const rectStartRef = useRef<Point | null>(null);
  const circleStartRef = useRef<Point | null>(null);
  const knifeStartRef = useRef<Point | null>(null);
  const shiftKeyRef = useRef(false);
  const spaceKeyRef = useRef(false);

  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, []);

  function getMousePoint(e: React.PointerEvent | React.WheelEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function getWorldPoint(screen: Point): Point {
    const w = screenToWorld(screen, view);
    if (!snapEnabled) return w;
    const gridSize = project.settings.gridSize;
    const tolWorld = project.settings.snapTolerancePx / view.scale;

    const allVertices: Point[] = [];
    const allSegments: { a: Point; b: Point }[] = [];
    for (const e of project.entities) {
      if (e.type !== 'polygon') continue;
      const rings = [e.geometry.outer, ...e.geometry.holes];
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          allVertices.push(ring[i]);
          allSegments.push({ a: ring[i], b: ring[(i + 1) % ring.length] });
        }
      }
    }

    if (project.settings.snapToVertex) {
      const v = nearestVertex(w, allVertices);
      if (v && v.distance < tolWorld) return v.point;
    }
    if (project.settings.snapToEdge) {
      const e = nearestEdgePoint(w, allSegments);
      if (e) {
        if (e.midpointDistance < tolWorld) return e.midpoint;
        if (e.distance < tolWorld / 2) return e.point;
      }
    }
    if (project.settings.snapToGrid) {
      const g = snapToGrid(w, gridSize);
      const dx = g.x - w.x;
      const dy = g.y - w.y;
      if (Math.sqrt(dx * dx + dy * dy) * view.scale < project.settings.snapTolerancePx) {
        return g;
      }
    }
    return w;
  }

  // Wheel zoom (mouse-centered)
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const screen = getMousePoint(e);
    const world = screenToWorld(screen, view);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.max(0.0001, Math.min(1000, view.scale * factor));
    const newOffsetX = screen.x - world.x * newScale;
    const newOffsetY = screen.y + world.y * newScale;
    setView({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || (tool === 'pan') || spaceKeyRef.current) {
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
    if (tool === 'knife') {
      knifeStartRef.current = w;
      setPreview({ type: 'knife', start: w, cursor: w });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'polygon') {
      if (preview.type !== 'polygon') {
        setPreview({ type: 'polygon', points: [w], cursor: null });
      } else {
        const pts = [...preview.points];
        if (pts.length >= 3) {
          const first = pts[0];
          const dx = first.x - w.x;
          const dy = first.y - w.y;
          if (Math.sqrt(dx * dx + dy * dy) * view.scale < 8) {
            const created = addPolygonFromOuter(pts, {
              sourceShape: 'polygon',
              createdByOperation: 'draw',
            });
            setPreview({ type: 'none' });
            if (created) setActiveTool('select');
            return;
          }
        }
        pts.push(w);
        setPreview({ type: 'polygon', points: pts, cursor: null });
      }
      return;
    }
    if (tool === 'select') {
      if (e.target === svgRef.current) {
        clearSelection();
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const screen = getMousePoint(e);
    const w = getWorldPoint(screen);
    setStatusMessage(`X: ${w.x.toFixed(project.settings.coordinatePrecision)}, Y: ${w.y.toFixed(project.settings.coordinatePrecision)}`);

    if (isPanningRef.current) {
      setView({
        scale: view.scale,
        offsetX: isPanningRef.current.offX + (e.clientX - isPanningRef.current.startX),
        offsetY: isPanningRef.current.offY + (e.clientY - isPanningRef.current.startY),
      });
      return;
    }
    if (draggingVertexRef.current) {
      const drag = draggingVertexRef.current;
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
      // Direct set without history push during drag
      useAppStore.setState((s) => ({
        project: {
          ...s.project,
          entities: s.project.entities.map((x) =>
            x.id === drag.entityId && x.type === 'polygon'
              ? { ...x, geometry: newGeom }
              : x,
          ),
        },
      }));
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
    if (knifeStartRef.current && tool === 'knife' && preview.type === 'knife') {
      setPreview({ type: 'knife', start: knifeStartRef.current, cursor: w });
      return;
    }
    if (tool === 'polygon' && preview.type === 'polygon') {
      setPreview({ type: 'polygon', points: preview.points, cursor: w });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (isPanningRef.current) {
      isPanningRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }
    if (draggingVertexRef.current) {
      draggingVertexRef.current = null;
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

  function onShapePointerDown(entityId: string, e: React.PointerEvent) {
    if (tool === 'select' || tool === 'vertex-edit') {
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
    e: React.PointerEvent<SVGCircleElement>,
  ) {
    if (tool !== 'select' && tool !== 'vertex-edit') return;
    e.stopPropagation();
    useAppStore.getState().pushHistory();
    draggingVertexRef.current = { entityId, ringType, holeIndex, vertexIndex };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  // keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') shiftKeyRef.current = true;
      if (e.key === ' ') spaceKeyRef.current = true;
      if (e.key === 'Escape') {
        setPreview({ type: 'none' });
        rectStartRef.current = null;
        circleStartRef.current = null;
        knifeStartRef.current = null;
      }
      if (e.key === 'Enter') {
        const p = useAppStore.getState().preview;
        if (p.type === 'polygon' && p.points.length >= 3) {
          addPolygonFromOuter(p.points, {
            sourceShape: 'polygon',
            createdByOperation: 'draw',
          });
          setPreview({ type: 'none' });
          setActiveTool('select');
        }
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
  }, [addPolygonFromOuter, setActiveTool, setPreview]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          touchAction: 'none',
          cursor:
            isPanningRef.current || tool === 'pan' || spaceKeyRef.current
              ? 'grabbing'
              : 'crosshair',
        }}
      >
        {showGrid && <Grid width={size.width} height={size.height} view={view} gridSize={project.settings.gridSize} />}
        {project.entities.map((ent) =>
          ent.type === 'polygon' ? (
            <PolygonShape
              key={ent.id}
              entity={ent}
              view={view}
              selected={selectedIds.includes(ent.id)}
              onPointerDown={(e) => onShapePointerDown(ent.id, e)}
            />
          ) : null,
        )}
        {selectedIds.map((id) => {
          const ent = project.entities.find(
            (e) => e.id === id && e.type === 'polygon',
          ) as PolygonEntity | undefined;
          if (!ent) return null;
          return (
            <VertexHandles
              key={`vh-${id}`}
              entity={ent}
              view={view}
              onVertexPointerDown={(rt, hi, vi, e) =>
                onVertexPointerDown(ent.id, rt, hi, vi, e)
              }
            />
          );
        })}
        <ToolPreview
          preview={preview}
          view={view}
          circleSegments={project.settings.circleSegments}
        />
      </svg>
      <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: 'var(--fg-muted)' }}>
        {(view.scale * 100).toFixed(1)}%
      </div>
    </div>
  );
}

export function fitView(view: ViewTransform): ViewTransform {
  return view;
}
