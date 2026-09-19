import { displayColor, useDisplayPreferences } from '../../app/displayPreferences';
import { boundsForEntities, fitBoundsToView } from '../../app/transform';
import { DEFAULT_PRINT_LAYOUT, printBounds } from '../../persistence/printLayout';
import { useText } from '../common/TaskDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import {
  isEntityEffectivelyLocked,
  isEntityEffectivelyVisible,
  layerForEntity,
} from '../../app/layers';
import { Grid } from './Grid';
import { PolygonShape } from './PolygonShape';
import { VertexHandles } from './VertexHandles';
import { ToolPreview } from './ToolPreview';
import { useCadViewportInteractions } from './useCadViewportInteractions';
import { useElementSize } from './useElementSize';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { NumericDrawingHud } from './NumericDrawingHud';
import { DimensionEntityShape } from './DimensionEntityShape';
import { UnderlayLayer } from './UnderlayLayer';
import { Rulers } from './Rulers';

const ZOOM_BUTTON_FACTOR = 1.25;

export function CadViewport() {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(wrapRef);

  const text = useText();
  const { printWidths, correctColors } = useDisplayPreferences();
  const dark = useAppStore((s) => s.ui.theme === 'dark');
  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const entitiesById = useMemo(() => new Map(project.entities.map((e) => [e.id, e])), [project.entities]);
  const view = useAppStore((s) => s.view);
  const preview = useAppStore((s) => s.preview);
  const showGrid = useAppStore((s) => s.ui.showGrid);
  const invalidEntityIds = useAppStore((s) => s.ui.invalidEntityIds);
  const clipboardCount = useAppStore((s) => s.clipboard.entities.length);
  const selectEntity = useAppStore((s) => s.selectEntity);
  const copySelected = useAppStore((s) => s.copySelected);
  const cutSelected = useAppStore((s) => s.cutSelected);
  const pasteClipboard = useAppStore((s) => s.pasteClipboard);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const removeEntities = useAppStore((s) => s.removeEntities);
  const unionSelected = useAppStore((s) => s.unionSelected);
  const differenceSelected = useAppStore((s) => s.differenceSelected);
  const assignSelectedToLayer = useAppStore((s) => s.assignSelectedToLayer);
  const addLinearEntity = useAppStore((s) => s.addLinearEntity);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const viewport = useCadViewportInteractions(size);
  const visibleEntities = useMemo(() => project.entities.filter((entity) =>
    isEntityEffectivelyVisible(project, entity),
  ), [project]);
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0 || fitted.current === project.id) return;
    fitted.current = project.id;
    const bounds = boundsForEntities(visibleEntities);
    if (bounds) useAppStore.getState().setView(fitBoundsToView(bounds, size.width, size.height));
  }, [project.id, visibleEntities, size]);
  useEffect(() => {
    const fit = () => {
      const current = useAppStore.getState().project;
      const bounds = boundsForEntities(current.entities.filter((entity) => isEntityEffectivelyVisible(current, entity)));
      if (bounds) useAppStore.getState().setView(fitBoundsToView(bounds, size.width, size.height));
    };
    window.addEventListener('polybool-fit-content', fit);
    return () => window.removeEventListener('polybool-fit-content', fit);
  }, [size]);
  const contextItems = useMemo<ContextMenuItem[]>(() => {
    const selected = selectedIds;
    const entitiesById = new Map(project.entities.map((entity) => [entity.id, entity]));
    const selectedPolygons = selected.filter(
      (id) => entitiesById.get(id)?.type === 'polygon',
    );
    const items: ContextMenuItem[] = [
      { id: 'copy', label: t('context.copy'), disabled: selected.length === 0, onSelect: copySelected },
      { id: 'cut', label: t('context.cut'), disabled: selected.length === 0, onSelect: cutSelected },
      { id: 'paste', label: t('context.paste'), disabled: clipboardCount === 0, onSelect: pasteClipboard },
      {
        id: 'duplicate',
        label: t('context.duplicate'),
        disabled: selected.length === 0,
        separatorBefore: true,
        onSelect: duplicateSelected,
      },
      {
        id: 'union',
        label: t('context.union'),
        disabled: selectedPolygons.length < 2,
        onSelect: unionSelected,
      },
      {
        id: 'difference',
        label: t('context.difference'),
        disabled: selectedPolygons.length < 2,
        onSelect: () => differenceSelected(selectedPolygons[0], selectedPolygons.slice(1)),
      },
      {
        id: 'delete',
        label: t('context.delete'),
        disabled: selected.length === 0,
        danger: true,
        separatorBefore: true,
        onSelect: () => removeEntities(selected),
      },
    ];
    for (const layer of project.layers) {
      items.push({
        id: `layer-${layer.id}`,
        label: t('context.moveToLayer', { name: layer.name }),
        disabled: selected.length === 0 || layer.locked,
        separatorBefore: layer === project.layers[0],
        onSelect: () => assignSelectedToLayer(layer.id),
      });
    }
    return items;
  }, [
    assignSelectedToLayer,
    clipboardCount,
    copySelected,
    cutSelected,
    differenceSelected,
    duplicateSelected,
    pasteClipboard,
    project.layers,
    project.entities,
    removeEntities,
    selectedIds,
    t,
    unionSelected,
  ]);

  function openContextMenu(entityId: string | null, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (entityId) {
      const entity = project.entities.find((item) => item.id === entityId);
      if (!entity || isEntityEffectivelyLocked(project, entity)) return;
      if (!selectedIds.includes(entityId)) selectEntity(entityId, false);
    }
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

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
        onPointerLeave={viewport.onPointerLeave}
        onWheel={viewport.onWheel}
        onContextMenu={(event) => openContextMenu(null, event)}
        style={{ touchAction: 'none', cursor: viewport.cursor }}
      >
        <defs>
          <marker
            id="dimension-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="3.5"
            refY="3.5"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 7 0 L 0 3.5 L 7 7 Z" fill="context-stroke" />
          </marker>
        </defs>
        <UnderlayLayer projectId={project.id} view={view} />
        {showGrid && (
          <Grid
            width={size.width}
            height={size.height}
            view={view}
            gridSize={project.settings.gridSize}
          />
        )}
        {visibleEntities.map((ent) =>
          ent.type === 'polygon' ? (
            <PolygonShape
              key={ent.id}
              entity={ent}
              view={view}
              selected={selectedSet.has(ent.id)}
              printWidths={printWidths}
              color={displayColor(layerForEntity(project, ent)?.color ?? ent.style.stroke, dark, correctColors)}
              invalid={invalidEntityIds.includes(ent.id)}
              locked={isEntityEffectivelyLocked(project, ent)}
              onPointerDown={(e) => viewport.onShapePointerDown(ent.id, e)}
              onContextMenu={(e) => openContextMenu(ent.id, e)}
            />
          ) : (
            <DimensionEntityShape
              key={ent.id}
              entity={ent}
              view={view}
              unit={project.unit}
              color={displayColor(layerForEntity(project, ent)?.color ?? ent.style.stroke, dark, correctColors)}
              precision={project.settings.coordinatePrecision}
              selected={selectedSet.has(ent.id)}
              printWidths={printWidths}
              locked={isEntityEffectivelyLocked(project, ent)}
              onPointerDown={(e) => viewport.onShapePointerDown(ent.id, e)}
              onContextMenu={(e) => openContextMenu(ent.id, e)}
            />
          ),
        )}
        {selectedIds.map((id) => {
          const candidate = entitiesById.get(id);
          const ent = candidate?.type === 'polygon' ? candidate : undefined;
          if (
            !ent ||
            !isEntityEffectivelyVisible(project, ent) ||
            isEntityEffectivelyLocked(project, ent)
          ) return null;
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
          unit={project.unit}
          coordinatePrecision={project.settings.coordinatePrecision}
        />
        <Rulers
          width={size.width}
          height={size.height}
          view={view}
          onCreateGuide={(orientation, coordinate) => {
            if (orientation === 'horizontal') {
              addLinearEntity(
                [
                  { x: 0, y: coordinate },
                  { x: 1, y: coordinate },
                ],
                'guide',
              );
            } else {
              addLinearEntity(
                [
                  { x: coordinate, y: 0 },
                  { x: coordinate, y: 1 },
                ],
                'guide',
              );
            }
          }}
        />
      </svg>
      <NumericDrawingHud value={viewport.numericInput} unit={project.unit} />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}
      <div className="viewport-controls">
        <label><input type="checkbox" checked={printWidths} onChange={(e) => useDisplayPreferences.setState({ printWidths: e.target.checked })} />{text('実線幅', 'True widths')}</label>
        <label><input type="checkbox" checked={correctColors} onChange={(e) => useDisplayPreferences.setState({ correctColors: e.target.checked })} />{text('黒線補正', 'Dark-line contrast')}</label>
        <button onClick={() => useAppStore.getState().setView(fitBoundsToView(printBounds(project, project.printLayout ?? DEFAULT_PRINT_LAYOUT), size.width, size.height))}>{text('用紙に合わせる', 'Fit paper')}</button>
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
