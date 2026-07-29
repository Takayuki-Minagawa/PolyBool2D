import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { AREA_UNITS, AREA_UNIT_LABEL } from '../../app/units';
import type { AreaUnit, PolygonEntity, Unit } from '../../app/projectTypes';
import { getEngine } from '../../geometry/geometryEngine';
import { lerpPoint } from '../../geometry/numeric';
import type { Ring } from '../../geometry/types';
import { CommitInput } from '../common/CommitInput';

type VertexInputProps = {
  value: number;
  decimals: number;
  label: string;
  onCommit: (v: number) => void;
};

function VertexInput({ value, decimals, label, onCommit }: VertexInputProps) {
  const formatted = value.toFixed(decimals);
  return (
    <CommitInput
      aria-label={label}
      type="number"
      step="any"
      value={formatted}
      onCommit={(text) => {
        const v = Number(text);
        if (!Number.isFinite(v)) return false;
        if (v !== value) onCommit(v);
        return true;
      }}
    />
  );
}

type SettingsNumberInputProps = {
  value: number;
  min: number;
  max: number;
  integer?: boolean;
  label: string;
  onCommit: (value: number) => void;
};

function SettingsNumberInput({
  value,
  min,
  max,
  integer = false,
  label,
  onCommit,
}: SettingsNumberInputProps) {
  return (
    <CommitInput
      aria-label={label}
      type="number"
      value={String(value)}
      min={min}
      max={max}
      step={integer ? 1 : 'any'}
      onCommit={(text) => {
        const parsed = Number(text);
        const next = integer ? Math.round(parsed) : parsed;
        if (!Number.isFinite(next) || next < min || next > max) return false;
        if (next !== value) onCommit(next);
        return true;
      }}
    />
  );
}

export function TransformSection() {
  const { t } = useTranslation();
  const rotateSelected = useAppStore((s) => s.rotateSelected);
  const mirrorSelected = useAppStore((s) => s.mirrorSelected);
  const scaleSelected = useAppStore((s) => s.scaleSelected);
  const [angleText, setAngleText] = useState('45');
  const [scaleXText, setScaleXText] = useState('1');
  const [scaleYText, setScaleYText] = useState('1');
  const angleDeg = Number(angleText);
  const scaleX = Number(scaleXText);
  const scaleY = Number(scaleYText);
  const canRotate = Number.isFinite(angleDeg) && angleDeg !== 0;
  const canScale =
    Number.isFinite(scaleX) &&
    Number.isFinite(scaleY) &&
    scaleX !== 0 &&
    scaleY !== 0;

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
      <form
        className="transform-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canRotate) rotateSelected((angleDeg * Math.PI) / 180);
        }}
      >
        <label htmlFor="transform-angle">{t('panel.rotateAngle')}</label>
        <input
          id="transform-angle"
          type="number"
          step="any"
          value={angleText}
          onChange={(event) => setAngleText(event.target.value)}
        />
        <button type="submit" disabled={!canRotate}>{t('panel.apply')}</button>
      </form>
      <form
        className="transform-form transform-scale-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canScale) scaleSelected(scaleX, scaleY);
        }}
      >
        <label htmlFor="transform-scale-x">{t('panel.scaleX')}</label>
        <input
          id="transform-scale-x"
          type="number"
          step="any"
          value={scaleXText}
          onChange={(event) => setScaleXText(event.target.value)}
        />
        <label htmlFor="transform-scale-y">{t('panel.scaleY')}</label>
        <input
          id="transform-scale-y"
          type="number"
          step="any"
          value={scaleYText}
          onChange={(event) => setScaleYText(event.target.value)}
        />
        <button type="submit" disabled={!canScale}>{t('panel.apply')}</button>
      </form>
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
  const removeHole = useAppStore((s) => s.removeHole);

  const commitVertex = (
    ringType: 'outer' | 'hole',
    holeIndex: number | undefined,
    index: number,
    axis: 'x' | 'y',
    value: number,
  ) => {
    const nextGeometry = ringType === 'outer'
      ? {
          outer: ent.geometry.outer.map((point, pointIndex) =>
            pointIndex === index ? { ...point, [axis]: value } : point,
          ),
          holes: ent.geometry.holes,
        }
      : {
          outer: ent.geometry.outer,
          holes: ent.geometry.holes.map((hole, currentHoleIndex) =>
            currentHoleIndex === holeIndex
              ? hole.map((point, pointIndex) =>
                  pointIndex === index ? { ...point, [axis]: value } : point,
                )
              : hole,
          ),
        };
    const next = getEngine().normalize([nextGeometry])[0];
    if (next) updateEntityGeometry(ent.id, next);
  };

  const renderRing = (
    ring: Ring,
    ringType: 'outer' | 'hole',
    ringLabel: string,
    holeIndex?: number,
  ) => (
    <div className="vertex-ring-block" key={`${ringType}-${holeIndex ?? 'outer'}`}>
      <div className="vertex-ring-heading">
        <h3>{ringLabel}</h3>
        {ringType === 'hole' && holeIndex !== undefined && (
          <button
            type="button"
            className="compact-button danger"
            onClick={() => removeHole(ent.id, holeIndex)}
          >
            {t('panel.deleteHole')}
          </button>
        )}
      </div>
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
          {ring.map((point, index) => {
            const nextPoint = ring[(index + 1) % ring.length];
            const ref = {
              entityId: ent.id,
              ringType,
              holeIndex,
              vertexIndex: index,
            } as const;
            return (
              <tr key={`${ent.id}-${ringType}-${holeIndex ?? 'outer'}-${index}`}>
                <td>{index + 1}</td>
                <td>
                  <VertexInput
                    value={point.x}
                    decimals={coordDecimals}
                    label={t('panel.vertexCoordinate', {
                      ring: ringLabel,
                      index: index + 1,
                      axis: 'X',
                    })}
                    onCommit={(value) =>
                      commitVertex(ringType, holeIndex, index, 'x', value)
                    }
                  />
                </td>
                <td>
                  <VertexInput
                    value={point.y}
                    decimals={coordDecimals}
                    label={t('panel.vertexCoordinate', {
                      ring: ringLabel,
                      index: index + 1,
                      axis: 'Y',
                    })}
                    onCommit={(value) =>
                      commitVertex(ringType, holeIndex, index, 'y', value)
                    }
                  />
                </td>
                <td className="vertex-actions">
                  <button
                    title={t('panel.insertVertexAfter')}
                    aria-label={t('panel.insertVertexAt', {
                      ring: ringLabel,
                      index: index + 1,
                    })}
                    onClick={() => insertVertex(ref, lerpPoint(point, nextPoint, 0.5))}
                  >
                    +
                  </button>
                  <button
                    title={t('panel.deleteVertexRow')}
                    aria-label={t('panel.deleteVertexAt', {
                      ring: ringLabel,
                      index: index + 1,
                    })}
                    onClick={() => deleteVertex(ref)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section>
      <h2>{t('panel.vertexEditHeading')}</h2>
      {renderRing(ent.geometry.outer, 'outer', t('panel.outerRing'))}
      {ent.geometry.holes.map((hole, holeIndex) =>
        renderRing(
          hole,
          'hole',
          t('panel.holeRing', { index: holeIndex + 1 }),
          holeIndex,
        ),
      )}
    </section>
  );
}

export function SettingsSection() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const updateProjectUnit = useAppStore((s) => s.updateProjectUnit);
  const units: Unit[] = ['mm', 'cm', 'm'];
  return (
    <section>
      <h2>{t('panel.settings')}</h2>
      <div className="row">
        <label className="label" htmlFor="project-unit">{t('panel.unit')}</label>
        <select
          id="project-unit"
          value={project.unit}
          onChange={(event) => updateProjectUnit(event.target.value as Unit)}
        >
          {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
      </div>
      <div className="row">
        <label className="label" htmlFor="area-display-unit">{t('panel.areaUnit')}</label>
        <select
          id="area-display-unit"
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
        <SettingsNumberInput
          label={t('panel.gridSize')}
          value={project.settings.gridSize}
          min={1}
          max={1_000_000}
          onCommit={(gridSize) => updateSettings({ gridSize })}
        />
      </div>
      <div className="row">
        <span className="label">{t('panel.circleSegments')}</span>
        <SettingsNumberInput
          label={t('panel.circleSegments')}
          value={project.settings.circleSegments}
          min={8}
          max={4096}
          integer
          onCommit={(circleSegments) => updateSettings({ circleSegments })}
        />
      </div>
      <label className="row checkbox-row">
        <span className="label">{t('panel.snapToGrid')}</span>
        <input
          type="checkbox"
          checked={project.settings.snapToGrid}
          onChange={(event) => updateSettings({ snapToGrid: event.target.checked })}
        />
      </label>
      <label className="row checkbox-row">
        <span className="label">{t('panel.snapToVertex')}</span>
        <input
          type="checkbox"
          checked={project.settings.snapToVertex}
          onChange={(event) => updateSettings({ snapToVertex: event.target.checked })}
        />
      </label>
      <label className="row checkbox-row">
        <span className="label">{t('panel.snapToEdge')}</span>
        <input
          type="checkbox"
          checked={project.settings.snapToEdge}
          onChange={(event) => updateSettings({ snapToEdge: event.target.checked })}
        />
      </label>
      <label className="row checkbox-row">
        <span className="label">{t('panel.angleSnap')}</span>
        <input
          type="checkbox"
          checked={project.settings.angleSnapEnabled}
          onChange={(event) => updateSettings({ angleSnapEnabled: event.target.checked })}
        />
      </label>
      <div className="row">
        <span className="label">{t('panel.angleIncrement')}</span>
        <SettingsNumberInput
          label={t('panel.angleIncrement')}
          value={project.settings.angleSnapIncrementDeg}
          min={1}
          max={180}
          onCommit={(angleSnapIncrementDeg) => updateSettings({ angleSnapIncrementDeg })}
        />
      </div>
      <div className="row">
        <span className="label">{t('panel.snapTolerance')}</span>
        <SettingsNumberInput
          label={t('panel.snapTolerance')}
          value={project.settings.snapTolerancePx}
          min={1}
          max={200}
          onCommit={(snapTolerancePx) => updateSettings({ snapTolerancePx })}
        />
      </div>
      <div className="row">
        <span className="label">{t('panel.areaPrecision')}</span>
        <SettingsNumberInput
          label={t('panel.areaPrecision')}
          value={project.settings.areaPrecision}
          min={0}
          max={12}
          integer
          onCommit={(areaPrecision) => updateSettings({ areaPrecision })}
        />
      </div>
      <div className="row">
        <span className="label">{t('panel.coordPrecision')}</span>
        <SettingsNumberInput
          label={t('panel.coordPrecision')}
          value={project.settings.coordinatePrecision}
          min={0}
          max={12}
          integer
          onCommit={(coordinatePrecision) => updateSettings({ coordinatePrecision })}
        />
      </div>
    </section>
  );
}
