import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { formatArea } from '../../app/units';
import { toolDefinition } from '../../app/toolRegistry';
import { selectSelectedAreaSummary } from '../../app/store/selectors';
import { useViewportStatusStore } from '../../app/viewportStatusStore';
import { useShallow } from 'zustand/react/shallow';

export function StatusBar() {
  const { t } = useTranslation();
  const tool = useAppStore((s) => s.activeTool);
  const status = useAppStore((s) => s.ui.statusMessage);
  const errorRaw = useAppStore((s) => s.ui.errorMessage);
  const snap = useAppStore((s) => s.ui.snapEnabled);
  const grid = useAppStore((s) => s.ui.showGrid);
  const coordinatePrecision = useAppStore(
    (state) => state.project.settings.coordinatePrecision,
  );
  const areaSummary = useAppStore(useShallow(selectSelectedAreaSummary));
  const cursor = useViewportStatusStore((state) => state.cursor);
  const error = errorRaw ? t(errorRaw) : null;
  const toolMeta = toolDefinition(tool);
  const guide = t(toolMeta.guideKey, { defaultValue: '' });

  return (
    <footer className="status-bar">
      <span>
        {t('status.tool')}: <strong>{t(toolMeta.labelKey)}</strong>
      </span>
      <span>
        {cursor
          ? `X: ${cursor.x.toFixed(coordinatePrecision)}, Y: ${cursor.y.toFixed(coordinatePrecision)}`
          : ''}
      </span>
      {status && <span>{status}</span>}
      <span>
        {t('status.snap')}: {snap ? 'ON' : 'OFF'}
      </span>
      <span>
        {t('status.grid')}: {grid ? 'ON' : 'OFF'}
      </span>
      {areaSummary.count > 0 && (
        <span>
          {t('status.selected')}:{' '}
          {formatArea(
            areaSummary.area,
            areaSummary.unit,
            areaSummary.areaDisplayUnit,
            areaSummary.areaPrecision,
          )}
        </span>
      )}
      <span style={{ flex: 1 }}>{guide}</span>
      {error && <span className="status-error">{error}</span>}
    </footer>
  );
}
