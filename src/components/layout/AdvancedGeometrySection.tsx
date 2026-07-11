import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';

export function AdvancedGeometrySection() {
  const { t } = useTranslation();
  const gridSize = useAppStore((state) => state.project.settings.gridSize);
  const offsetSelected = useAppStore((state) => state.offsetSelected);
  const repairSelected = useAppStore((state) => state.repairSelected);
  const chamferSelected = useAppStore((state) => state.chamferSelected);
  const filletSelected = useAppStore((state) => state.filletSelected);
  const minimumBounds = useAppStore(
    (state) => state.minimumBoundingRectangleSelected,
  );
  const [offsetText, setOffsetText] = useState(String(gridSize * 0.1));
  const [cornerText, setCornerText] = useState(String(gridSize * 0.05));
  const offset = Number(offsetText);
  const corner = Number(cornerText);

  return (
    <section>
      <h2>{t('panel.advancedGeometry')}</h2>
      <form
        className="geometry-value-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (Number.isFinite(offset) && offset !== 0) offsetSelected(offset);
        }}
      >
        <label htmlFor="geometry-offset">{t('panel.offsetDistance')}</label>
        <input
          id="geometry-offset"
          type="number"
          step="any"
          value={offsetText}
          onChange={(event) => setOffsetText(event.target.value)}
        />
        <button type="submit" disabled={!Number.isFinite(offset) || offset === 0}>
          {t('panel.offset')}
        </button>
      </form>
      <form
        className="geometry-value-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="geometry-corner">{t('panel.cornerSize')}</label>
        <input
          id="geometry-corner"
          type="number"
          min="0"
          step="any"
          value={cornerText}
          onChange={(event) => setCornerText(event.target.value)}
        />
        <div className="button-grid geometry-corner-buttons">
          <button
            type="button"
            disabled={!Number.isFinite(corner) || corner <= 0}
            onClick={() => chamferSelected(corner)}
          >
            {t('panel.chamfer')}
          </button>
          <button
            type="button"
            disabled={!Number.isFinite(corner) || corner <= 0}
            onClick={() => filletSelected(corner)}
          >
            {t('panel.fillet')}
          </button>
        </div>
      </form>
      <div className="button-grid panel-subgrid">
        <button type="button" onClick={repairSelected}>
          {t('panel.repair')}
        </button>
        <button type="button" onClick={minimumBounds}>
          {t('panel.minimumBounds')}
        </button>
      </div>
    </section>
  );
}
