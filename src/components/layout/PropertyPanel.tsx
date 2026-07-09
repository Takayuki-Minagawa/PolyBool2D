import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { polygonArea, signedRingArea } from '../../geometry/area';
import {
  bboxSize,
  polygonBBox,
  polygonCentroid,
  polygonPerimeter,
} from '../../geometry/measure';
import { formatArea, formatLength } from '../../app/units';
import type { PolygonEntity, Project } from '../../app/projectTypes';
import { BooleanActions } from './BooleanActions';
import {
  ArrangeSection,
  GeometryOpsSection,
  SettingsSection,
  TransformSection,
  VertexTable,
} from './PropertyPanelSections';

function polygonEntities(project: Project): PolygonEntity[] {
  return project.entities.filter((e): e is PolygonEntity => e.type === 'polygon');
}

export function PropertyPanel() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const removeEntities = useAppStore((s) => s.removeEntities);

  const decimals = project.settings.areaPrecision;
  const coordDecimals = project.settings.coordinatePrecision;
  const areaUnit = project.settings.areaDisplayUnit;
  const fmtArea = (a: number) => formatArea(a, project.unit, areaUnit, decimals);
  const fmtLen = (l: number) => formatLength(l, project.unit, coordDecimals);

  const polys = polygonEntities(project);
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
            <span>{fmtArea(totalArea)}</span>
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
    const perimeter = polygonPerimeter(ent.geometry);
    const box = polygonBBox(ent.geometry);
    const size = box ? bboxSize(box) : { width: 0, height: 0 };
    const centroid = polygonCentroid(ent.geometry);

    return (
      <aside className="panel">
        <section>
          <h2>{t('panel.polygonName')}</h2>
          <div className="row">
            <span>{ent.name}</span>
            <span className="muted-text">{ent.layerId}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.outerArea')}</span>
            <span>{fmtArea(outerArea)}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.holeArea')}</span>
            <span>{fmtArea(holeArea)}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.area')}</span>
            <strong>{fmtArea(net)}</strong>
          </div>
          <div className="row">
            <span className="label">{t('panel.perimeter')}</span>
            <span>{fmtLen(perimeter)}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.size')}</span>
            <span>
              {size.width.toFixed(coordDecimals)} x {size.height.toFixed(coordDecimals)}
            </span>
          </div>
          <div className="row">
            <span className="label">{t('panel.centroid')}</span>
            <span>
              {centroid.x.toFixed(coordDecimals)}, {centroid.y.toFixed(coordDecimals)}
            </span>
          </div>
          <div className="row">
            <span className="label">{t('panel.vertexCount')}</span>
            <span>{ent.geometry.outer.length}</span>
          </div>
          <div className="row">
            <span className="label">{t('panel.holeCount')}</span>
            <span>{ent.geometry.holes.length}</span>
          </div>
          <button onClick={() => removeEntities([ent.id])} className="panel-action">
            {t('panel.delete')}
          </button>
        </section>

        <TransformSection />
        <GeometryOpsSection />
        <VertexTable ent={ent} coordDecimals={coordDecimals} />
        <SettingsSection />
      </aside>
    );
  }

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
          <span>{fmtArea(selArea)}</span>
        </div>
        <div className="panel-action-stack">
          <BooleanActions variant="panel" showDifferenceHint />
          <button onClick={() => removeEntities(selectedIds)}>
            {t('panel.delete')}
          </button>
        </div>
      </section>

      <TransformSection />
      <GeometryOpsSection />
      <ArrangeSection />
      <SettingsSection />
    </aside>
  );
}
