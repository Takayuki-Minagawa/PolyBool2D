import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import {
  isEntityEffectivelyLocked,
  isEntityEffectivelyVisible,
} from '../../app/layers';
import { CommitInput } from '../common/CommitInput';

type InlineNameInputProps = {
  value: string;
  label: string;
  onCommit: (value: string) => void;
};

function InlineNameInput({ value, label, onCommit }: InlineNameInputProps) {
  return (
    <CommitInput
      type="text"
      aria-label={label}
      value={value}
      onClick={(event) => event.stopPropagation()}
      normalize={(next) => next.trim()}
      onCommit={(next) => {
        if (!next) return false;
        if (next !== value) onCommit(next);
        return true;
      }}
    />
  );
}

export function LayerManagerSection() {
  const { t } = useTranslation();
  const layers = useAppStore((state) => state.project.layers);
  const activeLayerId = useAppStore((state) => state.ui.activeLayerId);
  const selectedCount = useAppStore((state) => state.selectedEntityIds.length);
  const addLayer = useAppStore((state) => state.addLayer);
  const updateLayer = useAppStore((state) => state.updateLayer);
  const removeLayer = useAppStore((state) => state.removeLayer);
  const setActiveLayer = useAppStore((state) => state.setActiveLayer);
  const assignSelectedToLayer = useAppStore((state) => state.assignSelectedToLayer);
  const [assignmentLayerId, setAssignmentLayerId] = useState(activeLayerId);

  useEffect(() => {
    const fallback = layers.some((layer) => layer.id === activeLayerId)
      ? activeLayerId
      : layers[0]?.id;
    if (fallback) setAssignmentLayerId(fallback);
  }, [activeLayerId, layers]);

  return (
    <section className="layer-manager-section">
      <div className="panel-section-heading">
        <h2>{t('layers.title')}</h2>
        <button
          type="button"
          className="compact-button"
          aria-label={t('layers.add')}
          title={t('layers.add')}
          onClick={() => addLayer()}
        >
          +
        </button>
      </div>
      <div className="layer-list">
        {layers.map((layer) => {
          const active = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={`layer-row${active ? ' active' : ''}`}
              data-layer-id={layer.id}
            >
              <button
                type="button"
                className="icon-button layer-active-button"
                aria-label={t('layers.setActive', { name: layer.name })}
                aria-pressed={active}
                disabled={!layer.visible || layer.locked}
                title={t('layers.setActive', { name: layer.name })}
                onClick={() => setActiveLayer(layer.id)}
              >
                {active ? '●' : '○'}
              </button>
              <input
                className="layer-color-input"
                type="color"
                value={layer.color}
                aria-label={t('layers.color', { name: layer.name })}
                title={t('layers.color', { name: layer.name })}
                onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
              />
              <InlineNameInput
                value={layer.name}
                label={t('layers.name', { name: layer.name })}
                onCommit={(name) => updateLayer(layer.id, { name })}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={t(layer.visible ? 'layers.hide' : 'layers.show', { name: layer.name })}
                aria-pressed={layer.visible}
                title={t(layer.visible ? 'layers.hide' : 'layers.show', { name: layer.name })}
                onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
              >
                {layer.visible ? '◉' : '○'}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t(layer.locked ? 'layers.unlock' : 'layers.lock', { name: layer.name })}
                aria-pressed={layer.locked}
                title={t(layer.locked ? 'layers.unlock' : 'layers.lock', { name: layer.name })}
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
              >
                {layer.locked ? '🔒' : '🔓'}
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label={t('layers.delete', { name: layer.name })}
                title={t('layers.delete', { name: layer.name })}
                disabled={layers.length <= 1}
                onClick={() => {
                  if (!window.confirm(t('layers.confirmDelete', { name: layer.name }))) return;
                  removeLayer(layer.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="layer-assignment">
        <select
          aria-label={t('layers.assignmentTarget')}
          value={assignmentLayerId}
          onChange={(event) => setAssignmentLayerId(event.target.value)}
        >
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>{layer.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => assignSelectedToLayer(assignmentLayerId)}
        >
          {t('layers.assignSelection')}
        </button>
      </div>
    </section>
  );
}

function entityTypeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  entity: ReturnType<typeof useAppStore.getState>['project']['entities'][number],
): string {
  if (entity.type === 'polygon') return t('outliner.types.polygon');
  return t(`outliner.types.${entity.kind}`);
}

export function EntityOutlinerSection() {
  const { t } = useTranslation();
  const project = useAppStore((state) => state.project);
  const selectedIds = useAppStore((state) => state.selectedEntityIds);
  const selectEntity = useAppStore((state) => state.selectEntity);
  const updateEntityProperties = useAppStore((state) => state.updateEntityProperties);

  return (
    <section className="entity-outliner-section">
      <h2>{t('outliner.title')}</h2>
      {project.entities.length === 0 ? (
        <p className="muted-text outliner-empty">{t('outliner.empty')}</p>
      ) : (
        <div className="entity-outliner-list">
          {project.entities.map((entity) => {
            const selected = selectedIds.includes(entity.id);
            const effectivelyVisible = isEntityEffectivelyVisible(project, entity);
            const effectivelyLocked = isEntityEffectivelyLocked(project, entity);
            const className = [
              'entity-outliner-row',
              selected ? 'selected' : '',
              effectivelyVisible ? '' : 'is-hidden',
              effectivelyLocked ? 'is-locked' : '',
            ].filter(Boolean).join(' ');
            return (
              <div
                key={entity.id}
                className={className}
                data-entity-id={entity.id}
                role="button"
                tabIndex={effectivelyVisible && !effectivelyLocked ? 0 : -1}
                aria-pressed={selected}
                onClick={(event) => selectEntity(entity.id, event.shiftKey)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectEntity(entity.id, event.shiftKey);
                  }
                }}
              >
                <span className="entity-type-badge">{entityTypeLabel(t, entity)}</span>
                <InlineNameInput
                  value={entity.name}
                  label={t('outliner.name', { name: entity.name })}
                  onCommit={(name) => updateEntityProperties(entity.id, { name })}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(entity.visible ? 'outliner.hide' : 'outliner.show', { name: entity.name })}
                  title={t(entity.visible ? 'outliner.hide' : 'outliner.show', { name: entity.name })}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateEntityProperties(entity.id, { visible: !entity.visible });
                  }}
                >
                  {entity.visible ? '◉' : '○'}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(entity.locked ? 'outliner.unlock' : 'outliner.lock', { name: entity.name })}
                  title={t(entity.locked ? 'outliner.unlock' : 'outliner.lock', { name: entity.name })}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateEntityProperties(entity.id, { locked: !entity.locked });
                  }}
                >
                  {entity.locked ? '🔒' : '🔓'}
                </button>
                <select
                  aria-label={t('outliner.layer', { name: entity.name })}
                  value={entity.layerId}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    updateEntityProperties(entity.id, { layerId: event.target.value });
                  }}
                >
                  {project.layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>{layer.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
