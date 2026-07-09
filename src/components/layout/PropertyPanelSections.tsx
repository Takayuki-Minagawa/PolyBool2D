import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { AREA_UNITS, AREA_UNIT_LABEL } from '../../app/units';
import type { AreaUnit, PolygonEntity } from '../../app/projectTypes';
import { defaultEngine } from '../../geometry/geometryEngine';
import { lerpPoint } from '../../geometry/numeric';

type VertexInputProps = {
  value: number;
  decimals: number;
  onCommit: (v: number) => void;
};

function VertexInput({ value, decimals, onCommit }: VertexInputProps) {
  const [text, setText] = useState(value.toFixed(decimals));
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
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setText(value.toFixed(decimals));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function TransformSection() {
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

export function GeometryOpsSection() {
  const { t } = useTranslation();
  const convexHullSelected = useAppStore((s) => s.convexHullSelected);
  const simplifySelected = useAppStore((s) => s.simplifySelected);
  const gridSize = useAppStore((s) => s.project.settings.gridSize);
  return (
    <div className="button-grid panel-subgrid">
      <button onClick={() => convexHullSelected()}>{t('panel.convexHull')}</button>
      <button onClick={() => simplifySelected(Math.max(0.5, gridSize * 0.01))}>
        {t('panel.simplify')}
      </button>
    </div>
  );
}

export function ArrangeSection() {
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

export function VertexTable({ ent, coordDecimals }: { ent: PolygonEntity; coordDecimals: number }) {
  const { t } = useTranslation();
  const updateEntityGeometry = useAppStore((s) => s.updateEntityGeometry);
  const insertVertex = useAppStore((s) => s.insertVertex);
  const deleteVertex = useAppStore((s) => s.deleteVertex);

  const commitOuterVertex = (index: number, axis: 'x' | 'y', v: number) => {
    const outer = ent.geometry.outer.map((pp, idx) =>
      idx === index ? { ...pp, [axis]: v } : pp,
    );
    const next = defaultEngine.normalize([{ outer, holes: ent.geometry.holes }])[0];
    if (next) updateEntityGeometry(ent.id, next);
  };

  return (
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
                <td className="vertex-actions">
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
                    x
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function SettingsSection() {
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
