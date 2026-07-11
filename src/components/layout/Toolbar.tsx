import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { TOOL_DEFINITIONS } from '../../app/toolRegistry';
import { BooleanActions } from './BooleanActions';
import { isEntityEffectivelyLocked, isEntityEffectivelyVisible } from '../../app/layers';

export function Toolbar() {
  const { t } = useTranslation();
  const tool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const showGrid = useAppStore((s) => s.ui.showGrid);
  const snapEnabled = useAppStore((s) => s.ui.snapEnabled);
  const toggleGrid = useAppStore((s) => s.toggleGrid);
  const toggleSnap = useAppStore((s) => s.toggleSnap);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const copySelected = useAppStore((s) => s.copySelected);
  const cutSelected = useAppStore((s) => s.cutSelected);
  const pasteClipboard = useAppStore((s) => s.pasteClipboard);
  const clipboardCount = useAppStore((s) => s.clipboard.entities.length);
  const removeEntities = useAppStore((s) => s.removeEntities);
  const selectAll = useAppStore((s) => s.selectAll);
  const selectableCount = useAppStore(
    (s) =>
      s.project.entities.filter(
        (entity) =>
          isEntityEffectivelyVisible(s.project, entity) &&
          !isEntityEffectivelyLocked(s.project, entity),
      ).length,
  );

  return (
    <aside className="toolbar">
      <div className="toolbar-section">
        {TOOL_DEFINITIONS.map((tt) => (
          <button
            key={tt.name}
            className={tool === tt.name ? 'active' : ''}
            aria-pressed={tool === tt.name}
            onClick={() => setActiveTool(tt.name)}
            title={`${t(tt.labelKey)} (${tt.key})`}
          >
            {t(tt.labelKey)} <span style={{ opacity: 0.5, float: 'right' }}>{tt.key}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <BooleanActions variant="toolbar" />
      </div>

      <div className="toolbar-section">
        <button
          className={showGrid ? 'active' : ''}
          aria-pressed={showGrid}
          onClick={() => toggleGrid()}
        >
          {showGrid ? t('toolbar.gridOn') : t('toolbar.gridOff')}
        </button>
        <button
          className={snapEnabled ? 'active' : ''}
          aria-pressed={snapEnabled}
          onClick={() => toggleSnap()}
        >
          {snapEnabled ? t('toolbar.snapOn') : t('toolbar.snapOff')}
        </button>
      </div>

      <div className="toolbar-section">
        <button
          onClick={() => selectAll()}
          disabled={selectableCount === 0 || selectedIds.length === selectableCount}
          title="Ctrl/⌘+A"
        >
          {t('toolbar.selectAll')}
        </button>
        <button
          onClick={() => duplicateSelected()}
          disabled={selectedIds.length === 0}
          title="Ctrl/⌘+D"
        >
          {t('toolbar.duplicate')}
        </button>
        <button onClick={() => copySelected()} disabled={selectedIds.length === 0} title="Ctrl/⌘+C">
          {t('toolbar.copy')}
        </button>
        <button onClick={() => cutSelected()} disabled={selectedIds.length === 0} title="Ctrl/⌘+X">
          {t('toolbar.cut')}
        </button>
        <button onClick={() => pasteClipboard()} disabled={clipboardCount === 0} title="Ctrl/⌘+V">
          {t('toolbar.paste')}
        </button>
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
