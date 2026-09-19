import { boundsForEntities, fitBoundsToView } from '../../app/transform';
import { useText } from '../common/TaskDialog';
import type { Entity } from '../../app/projectTypes';
import { useEffect, useMemo, useRef, useState } from 'react';
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
                disabled={layers.length <= 1 || layer.locked}
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

  const text = useText();
  const activeLayerId = useAppStore((state) => state.ui.activeLayerId);
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [currentLayerOnly, setCurrentLayerOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<'layer' | 'group'>('layer');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(project.entities.length < 100 ? project.layers.map((layer) => layer.id) : []));
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => project.entities.filter((entity) =>
    (!selectedOnly || selectedSet.has(entity.id)) &&
    (!currentLayerOnly || entity.layerId === activeLayerId) &&
    `${entity.name} ${entity.type} ${entity.type === 'guide-line' ? entity.kind : ''} ${entityTypeLabel(t, entity)}`.toLowerCase().includes(query.toLowerCase()),
  ), [project.entities, selectedOnly, selectedSet, currentLayerOnly, activeLayerId, query, t]);
  const groups = useMemo(() => {
    const member = new Map<string, string>();
    if (groupBy === 'group') for (const g of project.groups ?? []) for (const id of g.entityIds) if (!member.has(id)) member.set(id, g.id);
    const grouped = new Map<string, { name: string; entities: Entity[] }>();
    const names = new Map((groupBy === 'layer' ? project.layers : project.groups ?? []).map((g) => [g.id, g.name]));
    for (const entity of filtered) {
      const key = groupBy === 'layer' ? entity.layerId : member.get(entity.id) ?? 'ungrouped';
      if (!grouped.has(key)) grouped.set(key, { name: names.get(key) ?? text('グループなし', 'Ungrouped'), entities: [] });
      grouped.get(key)!.entities.push(entity);
    }
    return grouped;
  }, [filtered, groupBy, project.layers, project.groups, text('ja', 'en')]);
  const rows = useMemo(() => {
    const result: Array<{ key: string; name: string; count: number; entity?: Entity }> = [];
    // Small projects keep their familiar immediately editable list.
    for (const [key, group] of groups) {
      result.push({ key, name: group.name, count: group.entities.length });
      if (expanded.has(key) || query || selectedOnly)
        for (const entity of group.entities) result.push({ key: entity.id, name: entity.name, count: 0, entity });
    }
    return result;
  }, [groups, expanded, project.entities.length, query, selectedOnly]);
  const rowHeight = 88;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  useEffect(() => { setExpanded(new Set(project.entities.length < 100 ? (groupBy === 'layer' ? project.layers.map((layer) => layer.id) : [...(project.groups ?? []).map((group) => group.id), 'ungrouped']) : [])); setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [project.id, groupBy]);
  useEffect(() => { setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [query, selectedOnly, currentLayerOnly, rows.length]);
  function revealSelection() {
    const entity = project.entities.find((item) => selectedSet.has(item.id));
    if (!entity) return;
    setQuery(''); setSelectedOnly(true); setCurrentLayerOnly(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  function zoomEntity(entity: Entity) {
    const bounds = boundsForEntities([entity]);
    const canvas = document.querySelector('.canvas-wrap');
    if (bounds && canvas) useAppStore.getState().setView(fitBoundsToView(bounds, canvas.clientWidth, canvas.clientHeight));
  }

  return (
    <section className="entity-outliner-section">
      <h2>{t('outliner.title')}</h2>
      <div className="outliner-filters">
        <input type="search" aria-label={text('名前・種類を検索', 'Search name or type')} placeholder={text('名前・種類を検索', 'Search name or type')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <label><input type="checkbox" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />{text('選択中のみ', 'Selected only')}</label>
        <label><input type="checkbox" checked={currentLayerOnly} onChange={(e) => setCurrentLayerOnly(e.target.checked)} />{text('現在のレイヤーのみ', 'Current layer')}</label>
        <select aria-label={text('一覧の分類', 'Group list by')} value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'layer' | 'group')}><option value="layer">{text('レイヤー', 'Layer')}</option><option value="group">{text('グループ', 'Group')}</option></select>
        <button disabled={!selectedIds.length} onClick={revealSelection}>{text('選択図形を一覧に表示', 'Reveal selection')}</button>
        <small>{filtered.length.toLocaleString()} / {project.entities.length.toLocaleString()}</small>
      </div>
      {project.entities.length === 0 ? (
        <p className="muted-text outliner-empty">{t('outliner.empty')}</p>
      ) : (
        <div className="entity-outliner-list virtual-outliner" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
          {rows.slice(first, first + 8).map((row, index) => {
            const entity = row.entity;
            const position = { position: 'absolute' as const, top: (first + index) * rowHeight, height: rowHeight - 4, width: '100%' };
            if (!entity) return <button key={row.key} className="outliner-heading" style={position} aria-expanded={expanded.has(row.key) || Boolean(query) || selectedOnly} onClick={() => setExpanded((current) => {
              const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next;
            })}>{expanded.has(row.key) || query || selectedOnly ? '▾' : '▸'} {row.name} ({row.count.toLocaleString()})</button>;
            const selected = selectedSet.has(entity.id);
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
                style={position}
                onDoubleClick={() => zoomEntity(entity)}
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
<button className="entity-type-badge" title={text('図形にズーム', 'Zoom to entity')} onClick={(e) => { e.stopPropagation(); zoomEntity(entity); }}>{entityTypeLabel(t, entity)}</button>
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
                  disabled={effectivelyLocked}
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
        </div>
      )}
    </section>
  );
}
