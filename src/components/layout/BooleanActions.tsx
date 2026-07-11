import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';

type BooleanActionsProps = {
  variant: 'toolbar' | 'panel';
  showDifferenceHint?: boolean;
};

const LABELS = {
  toolbar: {
    union: 'toolbar.union',
    difference: 'toolbar.difference',
    intersect: 'toolbar.intersect',
    xor: 'toolbar.xor',
  },
  panel: {
    union: 'panel.unionAction',
    difference: 'panel.differenceAction',
    intersect: 'panel.intersectAction',
    xor: 'panel.xorAction',
  },
} as const;

export function BooleanActions({ variant, showDifferenceHint = false }: BooleanActionsProps) {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const unionSelected = useAppStore((s) => s.unionSelected);
  const intersectSelected = useAppStore((s) => s.intersectSelected);
  const xorSelected = useAppStore((s) => s.xorSelected);
  const differenceSelected = useAppStore((s) => s.differenceSelected);
  const labels = LABELS[variant];
  const polygonIds = new Set(
    project.entities.filter((entity) => entity.type === 'polygon').map((entity) => entity.id),
  );
  const selectedPolygonIds = selectedIds.filter((id) => polygonIds.has(id));
  const disabled = selectedPolygonIds.length < 2;

  return (
    <>
      <button onClick={() => unionSelected()} disabled={disabled} title={t(labels.union)}>
        {t(labels.union)}
      </button>
      <button
        onClick={() => {
          if (disabled) return;
          const [subject, ...cutters] = selectedPolygonIds;
          differenceSelected(subject, cutters);
        }}
        disabled={disabled}
        title={t(labels.difference)}
      >
        {t(labels.difference)}
      </button>
      {showDifferenceHint && (
        <small className="muted-text">
          {t('panel.differenceHint')}
        </small>
      )}
      <button onClick={() => intersectSelected()} disabled={disabled} title={t(labels.intersect)}>
        {t(labels.intersect)}
      </button>
      <button onClick={() => xorSelected()} disabled={disabled} title={t(labels.xor)}>
        {t(labels.xor)}
      </button>
    </>
  );
}
