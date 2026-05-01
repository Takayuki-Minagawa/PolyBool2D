import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { polygonArea } from '../../geometry/area';
import type { PolygonEntity } from '../../app/projectTypes';

const UNIT_FACTOR: Record<'mm' | 'cm' | 'm', number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

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
  const f = UNIT_FACTOR[project.unit];
  const m2 = (selArea * f * f) / 1_000_000;
  const error = errorRaw ? t(errorRaw) : null;
  const guideKey = `status.guide${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
  const guide = t(guideKey, { defaultValue: '' });

  return (
    <footer className="status-bar">
      <span>
        {t('status.tool')}: <strong>{t(`toolbar.${tool === 'vertex-edit' ? 'vertexEdit' : tool}`)}</strong>
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
          {m2.toFixed(project.settings.areaPrecision)} m²
        </span>
      )}
      <span style={{ flex: 1 }}>{guide}</span>
      {error && <span className="status-error">{error}</span>}
    </footer>
  );
}
