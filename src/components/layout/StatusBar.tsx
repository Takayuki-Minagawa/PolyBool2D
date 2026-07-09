import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { polygonArea } from '../../geometry/area';
import { formatArea } from '../../app/units';
import type { PolygonEntity } from '../../app/projectTypes';
import { toolDefinition } from '../../app/toolRegistry';

export function StatusBar() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const tool = useAppStore((s) => s.activeTool);
  const status = useAppStore((s) => s.ui.statusMessage);
  const errorRaw = useAppStore((s) => s.ui.errorMessage);
  const snap = useAppStore((s) => s.ui.snapEnabled);
  const grid = useAppStore((s) => s.ui.showGrid);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);

  const selPolys = project.entities.filter(
    (e): e is PolygonEntity =>
      e.type === 'polygon' && selectedIds.includes(e.id),
  );
  const selArea = selPolys.reduce((a, p) => a + polygonArea(p.geometry), 0);
  const error = errorRaw ? t(errorRaw) : null;
  const toolMeta = toolDefinition(tool);
  const guide = t(toolMeta.guideKey, { defaultValue: '' });

  return (
    <footer className="status-bar">
      <span>
        {t('status.tool')}: <strong>{t(toolMeta.labelKey)}</strong>
      </span>
      <span>{status ?? ''}</span>
      <span>
        {t('status.snap')}: {snap ? 'ON' : 'OFF'}
      </span>
      <span>
        {t('status.grid')}: {grid ? 'ON' : 'OFF'}
      </span>
      {selPolys.length > 0 && (
        <span>
          {t('status.selected')}:{' '}
          {formatArea(
            selArea,
            project.unit,
            project.settings.areaDisplayUnit,
            project.settings.areaPrecision,
          )}
        </span>
      )}
      <span style={{ flex: 1 }}>{guide}</span>
      {error && <span className="status-error">{error}</span>}
    </footer>
  );
}
