import { useTranslation } from 'react-i18next';
import type { Unit } from '../../app/projectTypes';

type Props = {
  value: string;
  unit: Unit;
};

export function NumericDrawingHud({ value, unit }: Props) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <div className="numeric-drawing-hud" role="status">
      <span>{t('drawing.length')}</span>
      <strong>{value}</strong>
      <span>{unit}</span>
      <small>{t('drawing.enterToApply')}</small>
    </div>
  );
}
