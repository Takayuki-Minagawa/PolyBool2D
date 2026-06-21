import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { polygonArea, signedRingArea } from '../../geometry/area';
import {
  polygonPerimeter,
  polygonBBox,
  bboxSize,
  polygonCentroid,
} from '../../geometry/measure';
import { defaultEngine } from '../../geometry/geometryEngine';
import { lerpPoint } from '../../geometry/numeric';
import {
  AREA_UNITS,
  AREA_UNIT_LABEL,
  formatArea,
  formatLength,
} from '../../app/units';
import type { AreaUnit, PolygonEntity } from '../../app/projectTypes';

type VertexInputProps = {
  value: number;
  decimals: number;
  onCommit: (v: number) => void;
};

function VertexInput({ value, decimals, onCommit }: VertexInputProps) {
  const formatted = value.toFixed(decimals);
  const [text, setText] = useState(formatted);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setText(value.toFixed(decimals));
    }
  }, [value, decimals]);

  function commit() {
    const v = Number(text);
    if (Number.isFinite(v) && v !== value) {
      onCommit(v);
    } else {
      setText(value.toFixed(decimals));
    }
  }

  return (
    <input
      type="number"
      step="any"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setText(value.toFixed(decimals));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Rotate / flip / scale buttons that act on the current selection. */
function TransformSection() {
  const { t } = useTranslation();
  const rotateSelected = useAppStore((s) => s.rotateSelected);
  const mirrorSelected = useAppStore((s) => s.mirrorSelected);
  const scaleSelected = useAppStore((s) => s.scaleSelected);
  return (
    <section>
      <h2>{t('panel.transformHeading')}</h2>
      <div className="button-grid">
        <button onClick={() => rotateSelected(Math.PI / 2)}>{t('panel.rotateLeft')}</button>
        <button onClick={() => rotateSelected(-Math.PI / 2)}>{t('panel.rotateRight')}</button>
        <button onClick={() => mirrorSelected('vertical')}>{t('panel.flipH')}</button>
        <button onClick={() => mirrorSelected('horizontal')}>{t('panel.flipV')}</button>
        <button onClick={() => scaleSelected(0.5, 0.5)}>{t('panel.scaleHalf')}</button>
        <button onClick={() => scaleSelected(2, 2)}>{t('panel.scaleDouble')}</button>
      </div>
    </section>
  );
}

/** Convex hull / simplify operations. */
function GeometryOpsSection() {
  const { t } = useTranslation();
  const convexHullSelected = useAppStore((s) => s.convexHullSelected);
  const simplifySelected = useAppStore((s) => s.simplifySelected);
  const gridSize = useAppStore((s) => s.project.settings.gridSize);
  return (
    <div className="button-grid" style={{ marginTop: 6 }}>
      <button onClick={() => convexHullSelected()}>{t('panel.convexHull')}</button>
      <button onClick={() => simplifySelected(Math.max(0.5, gridSize * 0.01))}>
        {t('panel.simplify')}
      </button>
    </div>
  );
}

/** Align / distribute buttons (multi-selection only). */
function ArrangeSection() {
  const { t } = useTranslation();
  const alignSelected = useAppStore((s) => s.alignSelected);
  const distributeSelected = useAppStore((s) => s.distributeSelected);
  const count = useAppStore((s) => s.selectedEntityIds.length);
  return (
    <section>
      <h2>{t('panel.arrangeHeading')}</h2>
      <div className="button-grid">
        <button onClick={() => alignSelected('left')}>{t('panel.alignLeft')}</button>
        <button onClick={() => alignSelected('right')}>{t('panel.alignRight')}</button>
        <button onClick={() => alignSelected('top')}>{t('panel.alignTop')}</button>
        <button onClick={() => alignSelected('bottom')}>{t('panel.alignBottom')}</button>
        <button onClick={() => alignSelected('centerX')}>{t('panel.alignCenterX')}</button>
        <button onClick={() => alignSelected('centerY')}>{t('panel.alignCenterY')}</button>
        <button disabled={count < 3} onClick={() => distributeSelected('x')}>
          {t('panel.distributeX')}
        </button>
        <button disabled={count < 3} onClick={() => distributeSelected('y')}>
          {t('panel.distributeY')}
        </button>
      </div>
    </section>
  );
}

export function PropertyPanel() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const updateEntityGeometry = useAppStore((s) => s.updateEntityGeometry);
  const removeEntities = useAppStore((s) => s.removeEntities);
  const unionSelected = useAppStore((s) => s.unionSelected);
  const intersectSelected = useAppStore((s) => s.intersectSelected);
  const xorSelected = useAppStore((s) => s.xorSelected);
  const differenceSelected = useAppStore((s) => s.differenceSelected);
  const insertVertex = useAppStore((s) => s.insertVertex);
  const deleteVertex = useAppStore((s) => s.deleteVertex);

  const decimals = project.settings.areaPrecision;
  const coordDecimals = project.settings.coordinatePrecision;
  const areaUnit = project.settings.areaDisplayUnit;
  const fmtArea = (a: number) => formatArea(a, project.unit, areaUnit, decimals);
  const fmtLen = (l: number) => formatLength(l, project.unit, coordDecimals);

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

    const commitOuterVertex = (index: number, axis: 'x' | 'y', v: number) => {
      const outer = ent.geometry.outer.map((pp, idx) =>
        idx === index ? { ...pp, [axis]: v } : pp,
      );
      const next = defaultEngine.normalize([
        { outer, holes: ent.geometry.holes },
      ])[0];
      if (next) updateEntityGeometry(ent.id, next);
    };

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
              {size.width.toFixed(coordDecimals)} × {size.height.toFixed(coordDecimals)}
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
          <button
            onClick={() => removeEntities([ent.id])}
            style={{ marginTop: 8 }}
          >
            {t('panel.delete')}
          </button>
        </section>

        <TransformSection />
        <GeometryOpsSection />

        <section>
          <h2>{t('panel.vertexEditHeading')}</h2>
          <table className="vertex-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('panel.x')}</th>
                <th>{t('panel.y')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ent.geometry.outer.map((p, i) => {
                const next = ent.geometry.outer[(i + 1) % ent.geometry.outer.length];
                return (
                  <tr key={`${ent.id}-${i}`}>
                    <td>{i + 1}</td>
                    <td>
                      <VertexInput
                        value={p.x}
                        decimals={coordDecimals}
                        onCommit={(v) => commitOuterVertex(i, 'x', v)}
                      />
                    </td>
                    <td>
                      <VertexInput
                        value={p.y}
                        decimals={coordDecimals}
                        onCommit={(v) => commitOuterVertex(i, 'y', v)}
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        title={t('panel.insertVertexAfter')}
                        onClick={() =>
                          insertVertex(
                            { entityId: ent.id, ringType: 'outer', vertexIndex: i },
                            lerpPoint(p, next, 0.5),
                          )
                        }
                      >
                        +
                      </button>
                      <button
                        title={t('panel.deleteVertexRow')}
                        onClick={() =>
                          deleteVertex({
                            entityId: ent.id,
                            ringType: 'outer',
                            vertexIndex: i,
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
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
          <span>{fmtArea(selArea)}</span>
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
          <button onClick={() => intersectSelected()}>{t('panel.intersectAction')}</button>
          <button onClick={() => xorSelected()}>{t('panel.xorAction')}</button>
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

function SettingsSection() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return (
    <section>
      <h2>{t('panel.settings')}</h2>
      <div className="row">
        <span className="label">{t('panel.unit')}</span>
        <span>{project.unit}</span>
      </div>
      <div className="row">
        <span className="label">{t('panel.areaUnit')}</span>
        <select
          value={project.settings.areaDisplayUnit}
          onChange={(e) => updateSettings({ areaDisplayUnit: e.target.value as AreaUnit })}
        >
          {AREA_UNITS.map((u) => (
            <option key={u} value={u}>
              {AREA_UNIT_LABEL[u]}
            </option>
          ))}
        </select>
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
