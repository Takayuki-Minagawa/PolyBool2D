import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import type { ToolName } from '../../app/projectTypes';

const TOOLS: { name: ToolName; key: string; labelKey: string }[] = [
  { name: 'select', key: 'V', labelKey: 'toolbar.select' },
  { name: 'pan', key: 'H', labelKey: 'toolbar.pan' },
  { name: 'polygon', key: 'P', labelKey: 'toolbar.polygon' },
  { name: 'rectangle', key: 'R', labelKey: 'toolbar.rectangle' },
  { name: 'circle', key: 'C', labelKey: 'toolbar.circle' },
  { name: 'knife', key: 'K', labelKey: 'toolbar.knife' },
];

export function Toolbar() {
  const { t } = useTranslation();
  const tool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const showGrid = useAppStore((s) => s.ui.showGrid);
  const snapEnabled = useAppStore((s) => s.ui.snapEnabled);
  const toggleGrid = useAppStore((s) => s.toggleGrid);
  const toggleSnap = useAppStore((s) => s.toggleSnap);
  const unionSelected = useAppStore((s) => s.unionSelected);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const differenceSelected = useAppStore((s) => s.differenceSelected);
  const removeEntities = useAppStore((s) => s.removeEntities);

  return (
    <aside className="toolbar">
      <div className="toolbar-section">
        {TOOLS.map((tt) => (
          <button
            key={tt.name}
            className={tool === tt.name ? 'active' : ''}
            onClick={() => setActiveTool(tt.name)}
            title={`${t(tt.labelKey)} (${tt.key})`}
          >
            {t(tt.labelKey)} <span style={{ opacity: 0.5, float: 'right' }}>{tt.key}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <button
          onClick={() => unionSelected()}
          disabled={selectedIds.length < 2}
          title={t('toolbar.union')}
        >
          {t('toolbar.union')}
        </button>
        <button
          onClick={() => {
            if (selectedIds.length < 2) return;
            const [subject, ...cutters] = selectedIds;
            differenceSelected(subject, cutters);
          }}
          disabled={selectedIds.length < 2}
          title={t('toolbar.difference')}
        >
          {t('toolbar.difference')}
        </button>
      </div>

      <div className="toolbar-section">
        <button
          className={showGrid ? 'active' : ''}
          onClick={() => toggleGrid()}
        >
          {showGrid ? t('toolbar.gridOn') : t('toolbar.gridOff')}
        </button>
        <button
          className={snapEnabled ? 'active' : ''}
          onClick={() => toggleSnap()}
        >
          {snapEnabled ? t('toolbar.snapOn') : t('toolbar.snapOff')}
        </button>
      </div>

      <div className="toolbar-section">
        <button
          onClick={() => removeEntities(selectedIds)}
          disabled={selectedIds.length === 0}
        >
          {t('toolbar.delete')}
        </button>
      </div>
    </aside>
  );
}
