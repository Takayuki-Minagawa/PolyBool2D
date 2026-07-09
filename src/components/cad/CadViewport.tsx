import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import type { PolygonEntity } from '../../app/projectTypes';
import { Grid } from './Grid';
import { PolygonShape } from './PolygonShape';
import { VertexHandles } from './VertexHandles';
import { ToolPreview } from './ToolPreview';
import { useCadViewportInteractions } from './useCadViewportInteractions';
import { useElementSize } from './useElementSize';

const ZOOM_BUTTON_FACTOR = 1.25;

export function CadViewport() {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(wrapRef);

  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const view = useAppStore((s) => s.view);
  const preview = useAppStore((s) => s.preview);
  const showGrid = useAppStore((s) => s.ui.showGrid);

  const viewport = useCadViewportInteractions(size);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={viewport.svgRef}
        width={size.width}
        height={size.height}
        onPointerDown={viewport.onPointerDown}
        onPointerMove={viewport.onPointerMove}
        onPointerUp={viewport.onPointerUp}
        onPointerCancel={viewport.onPointerCancel}
        onWheel={viewport.onWheel}
        style={{ touchAction: 'none', cursor: viewport.cursor }}
      >
        {showGrid && (
          <Grid
            width={size.width}
            height={size.height}
            view={view}
            gridSize={project.settings.gridSize}
          />
        )}
        {project.entities.map((ent) =>
          ent.type === 'polygon' ? (
            <PolygonShape
              key={ent.id}
              entity={ent}
              view={view}
              selected={selectedIds.includes(ent.id)}
              onPointerDown={(e) => viewport.onShapePointerDown(ent.id, e)}
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
                viewport.onVertexPointerDown(ent.id, rt, hi, vi, e)
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
      <div className="viewport-controls">
        <button onClick={() => viewport.zoomBy(1 / ZOOM_BUTTON_FACTOR)} title={t('toolbar.zoomOut')}>
          -
        </button>
        <button onClick={() => viewport.zoomBy(ZOOM_BUTTON_FACTOR)} title={t('toolbar.zoomIn')}>
          +
        </button>
        <button onClick={viewport.fitViewToContent} title={`${t('toolbar.fit')} (F)`}>
          {t('toolbar.fit')}
        </button>
        <span>{(view.scale * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
