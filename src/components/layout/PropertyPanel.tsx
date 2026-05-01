import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { polygonArea, signedRingArea } from '../../geometry/area';
import { defaultEngine } from '../../geometry/geometryEngine';
import type { PolygonEntity } from '../../app/projectTypes';

const UNIT_FACTOR: Record<'mm' | 'cm' | 'm', number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

function formatAreaToM2(areaMm2: number, decimals: number, unit: 'mm' | 'cm' | 'm'): string {
  const factor = UNIT_FACTOR[unit];
  const sourceMm2 = areaMm2 * factor * factor;
  const m2 = sourceMm2 / 1_000_000;
  return `${m2.toFixed(decimals)} m²`;
}

export function PropertyPanel() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const updateEntityGeometry = useAppStore((s) => s.updateEntityGeometry);
  const removeEntities = useAppStore((s) => s.removeEntities);
  const unionSelected = useAppStore((s) => s.unionSelected);
  const differenceSelected = useAppStore((s) => s.differenceSelected);

  const decimals = project.settings.areaPrecision;
  const coordDecimals = project.settings.coordinatePrecision;
  const polys = project.entities.filter(
    (e): e is PolygonEntity => e.type === 'polygon',
  );
  const totalArea = polys.reduce((acc, p) => acc + polygonArea(p.geometry), 0);

  if (selectedIds.length === 0) {
    return (
      <aside className="panel">
        <section>
          <h2>{t('panel.noSelection')}</h2>
          <div className="row">
            <span className="label">{t('panel.entityCount')}</span>
            <span>{polys.length}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.totalArea')}</span>
            <span>{formatAreaToM2(totalArea, decimals, project.unit)}</span>
          </div>
        </section>

        <SettingsSection />
      </aside>
    );
  }

  if (selectedIds.length === 1) {
    const ent = polys.find((p) => p.id === selectedIds[0]);
    if (!ent) return null;
    const outerArea = Math.abs(signedRingArea(ent.geometry.outer));
    const holeArea = ent.geometry.holes.reduce(
      (a, h) => a + Math.abs(signedRingArea(h)),
      0,
    );
    const net = polygonArea(ent.geometry);

    return (
      <aside className="panel">
        <section>
          <h2>{t('panel.polygonName')}</h2>
          <div className="row">
            <span>{ent.name}</span>
            <span style={{ color: 'var(--fg-muted)' }}>{ent.layerId}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.outerArea')}</span>
            <span>{formatAreaToM2(outerArea, decimals, project.unit)}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.holeArea')}</span>
            <span>{formatAreaToM2(holeArea, decimals, project.unit)}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.area')}</span>
            <strong>{formatAreaToM2(net, decimals, project.unit)}</strong>
          </div>
          <div className="row">
            <span className="label">{t('panel.vertexCount')}</span>
            <span>{ent.geometry.outer.length}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.holeCount')}</span>
            <span>{ent.geometry.holes.length}</span>
          </div>
          <button
            onClick={() => removeEntities([ent.id])}
            style={{ marginTop: 8 }}
          >
            {t('panel.delete')}
          </button>
        </section>

        <section>
          <h2>{t('panel.vertices')}</h2>
          <table className="vertex-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('panel.x')}</th>
                <th>{t('panel.y')}</th>
              </tr>
            </thead>
            <tbody>
              {ent.geometry.outer.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      defaultValue={p.x.toFixed(coordDecimals)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        const outer = ent.geometry.outer.map((pp, idx) =>
                          idx === i ? { x: v, y: pp.y } : pp,
                        );
                        const next = defaultEngine.normalize([
                          { outer, holes: ent.geometry.holes },
                        ])[0];
                        if (next) updateEntityGeometry(ent.id, next);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      defaultValue={p.y.toFixed(coordDecimals)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        const outer = ent.geometry.outer.map((pp, idx) =>
                          idx === i ? { x: pp.x, y: v } : pp,
                        );
                        const next = defaultEngine.normalize([
                          { outer, holes: ent.geometry.holes },
                        ])[0];
                        if (next) updateEntityGeometry(ent.id, next);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <SettingsSection />
      </aside>
    );
  }

  // Multi
  const selectedEnts = polys.filter((p) => selectedIds.includes(p.id));
  const selArea = selectedEnts.reduce((a, p) => a + polygonArea(p.geometry), 0);
  return (
    <aside className="panel">
      <section>
        <h2>{t('panel.selectedCount')}</h2>
        <div className="row">
          <span>{selectedEnts.length}</span>
        </div>
        <div className="row">
          <span className="label">{t('panel.totalArea')}</span>
          <span>{formatAreaToM2(selArea, decimals, project.unit)}</span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => unionSelected()}>{t('panel.unionAction')}</button>
          <button
            onClick={() => {
              const [subject, ...cutters] = selectedIds;
              differenceSelected(subject, cutters);
            }}
          >
            {t('panel.differenceAction')}
          </button>
          <small style={{ color: 'var(--fg-muted)' }}>
            {t('panel.differenceHint')}
          </small>
          <button onClick={() => removeEntities(selectedIds)}>
            {t('panel.delete')}
          </button>
        </div>
      </section>

      <SettingsSection />
    </aside>
  );
}

function SettingsSection() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  return (
    <section>
      <h2>{t('panel.settings')}</h2>
      <div className="row">
        <span className="label">{t('panel.unit')}</span>
        <span>{project.unit}</span>
      </div>
      <div className="row">
        <span className="label">{t('panel.gridSize')}</span>
        <span>{project.settings.gridSize}</span>
      </div>
      <div className="row">
        <span className="label">{t('panel.circleSegments')}</span>
        <span>{project.settings.circleSegments}</span>
      </div>
      <div className="row">
        <span className="label">{t('panel.areaPrecision')}</span>
        <span>{project.settings.areaPrecision}</span>
      </div>
      <div className="row">
        <span className="label">{t('panel.coordPrecision')}</span>
        <span>{project.settings.coordinatePrecision}</span>
      </div>
    </section>
  );
}
