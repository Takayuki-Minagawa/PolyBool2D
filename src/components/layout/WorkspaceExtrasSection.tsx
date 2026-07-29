import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import {
  createEntityGroup,
  type EntityGroup,
} from '../../app/groups';
import { makeId } from '../../app/idUtils';
import {
  isEntityEffectivelyLocked,
  unlockedEntityIds,
} from '../../app/layers';
import {
  projectPointKey,
  solveProjectConstraints,
} from '../../app/projectConstraints';
import { screenToWorld } from '../../app/transform';
import type { PolygonEntity, Project } from '../../app/projectTypes';
import type { ParametricConstraint } from '../../geometry/constraints';
import {
  createEntityTemplate,
  instantiateEntityTemplate,
  readEntityTemplates,
  saveEntityTemplate,
} from '../../persistence/templateLibrary';

type ProjectWithExtras = Project & {
  groups?: EntityGroup[];
  constraints?: ParametricConstraint[];
};

function selectedPolygons(
  project: Project,
  selectedIds: readonly string[],
): PolygonEntity[] {
  const selected = new Set(selectedIds);
  return project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' &&
      selected.has(entity.id) &&
      !isEntityEffectivelyLocked(project, entity),
  );
}

export function WorkspaceExtrasSection() {
  const { t } = useTranslation();
  const project = useAppStore((state) => state.project) as ProjectWithExtras;
  const selectedIds = useAppStore((state) => state.selectedEntityIds);
  const activeLayerId = useAppStore((state) => state.ui.activeLayerId);
  const view = useAppStore((state) => state.view);
  const setErrorMessage = useAppStore((state) => state.setErrorMessage);
  const selectMany = useAppStore((state) => state.selectMany);
  const [templates, setTemplates] = useState(() => readEntityTemplates());
  const polygons = useMemo(
    () => selectedPolygons(project, selectedIds),
    [project, selectedIds],
  );
  const firstEdgeLength = polygons[0]?.geometry.outer.length >= 2
    ? Math.hypot(
        polygons[0].geometry.outer[1].x - polygons[0].geometry.outer[0].x,
        polygons[0].geometry.outer[1].y - polygons[0].geometry.outer[0].y,
      )
    : 0;
  const [lengthValue, setLengthValue] = useState('');
  const [angleValue, setAngleValue] = useState('90');

  function commitProject(nextProject: ProjectWithExtras, selection = selectedIds) {
    useAppStore.getState().pushHistory();
    useAppStore.setState({
      project: {
        ...nextProject,
        updatedAt: new Date().toISOString(),
      },
      selectedEntityIds: [...selection],
    });
  }

  function groupSelection() {
    const group = createEntityGroup(
      unlockedEntityIds(project, selectedIds),
      `Group ${(project.groups?.length ?? 0) + 1}`,
    );
    if (!group) return;
    commitProject({ ...project, groups: [...(project.groups ?? []), group] });
  }

  function ungroupSelection() {
    const selected = new Set(selectedIds);
    const groups = (project.groups ?? []).filter(
      (group) =>
        group.locked ||
        !group.entityIds.some((id) => selected.has(id)),
    );
    commitProject({ ...project, groups });
  }

  function toggleGroupLock(groupId: string) {
    const group = (project.groups ?? []).find((item) => item.id === groupId);
    if (!group) return;
    const locked = !group.locked;
    commitProject(
      {
        ...project,
        groups: (project.groups ?? []).map((item) =>
          item.id === groupId ? { ...item, locked } : item,
        ),
      },
      locked
        ? selectedIds.filter((id) => !group.entityIds.includes(id))
        : selectedIds,
    );
  }

  function toggleGroupVisibility(groupId: string) {
    const group = (project.groups ?? []).find((item) => item.id === groupId);
    if (!group) return;
    const visible = !group.visible;
    commitProject(
      {
        ...project,
        groups: (project.groups ?? []).map((item) =>
          item.id === groupId ? { ...item, visible } : item,
        ),
      },
      visible
        ? selectedIds
        : selectedIds.filter((id) => !group.entityIds.includes(id)),
    );
  }

  function saveSelectionAsTemplate() {
    const selected = new Set(selectedIds);
    const entities = project.entities.filter((entity) => selected.has(entity.id));
    const template = createEntityTemplate(
      `Part ${templates.length + 1}`,
      entities,
    );
    if (!template || !saveEntityTemplate(template)) {
      setErrorMessage('errors.templateSaveFailed');
      return;
    }
    setTemplates(readEntityTemplates());
    setErrorMessage(null);
  }

  function insertLatestTemplate() {
    const template = templates[0];
    if (!template) return;
    const target = screenToWorld(
      {
        x: Math.max(0, (window.innerWidth - 452) / 2),
        y: Math.max(0, (window.innerHeight - 100) / 2),
      },
      view,
    );
    const entities = instantiateEntityTemplate(template, target, activeLayerId);
    if (entities.length === 0) return;
    commitProject(
      { ...project, entities: [...project.entities, ...entities] },
      entities.map((entity) => entity.id),
    );
    selectMany(entities.map((entity) => entity.id));
  }

  function applyConstraint(
    constraint: ParametricConstraint,
    fixed: string[] = [],
  ) {
    const constraints = [...(project.constraints ?? []), constraint];
    const result = solveProjectConstraints(
      { ...project, constraints },
      constraints,
      { fixed },
    );
    if (!result.ok) {
      setErrorMessage('errors.constraintFailed');
      return;
    }
    commitProject({ ...result.project, constraints });
    setErrorMessage(null);
  }

  function applyFirstEdge(kind: 'length' | 'horizontal' | 'vertical') {
    const entity = polygons[0];
    if (!entity || entity.geometry.outer.length < 2) return;
    const a = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 0 });
    const b = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 1 });
    if (kind === 'length') {
      const value = Number(lengthValue || firstEdgeLength);
      if (!(value > 0) || !Number.isFinite(value)) return;
      applyConstraint({ id: makeId('constraint'), kind, a, b, value }, [a]);
    } else {
      applyConstraint({ id: makeId('constraint'), kind, a, b }, [a]);
    }
  }

  function applyAngle() {
    const entity = polygons[0];
    if (!entity || entity.geometry.outer.length < 3) return;
    const value = Number(angleValue);
    if (!Number.isFinite(value)) return;
    const a = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 0 });
    const vertex = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 1 });
    const b = projectPointKey({ entityId: entity.id, ring: 'outer', pointIndex: 2 });
    applyConstraint({
      id: makeId('constraint'),
      kind: 'angle',
      a,
      vertex,
      b,
      valueRad: (value * Math.PI) / 180,
    }, [a, vertex]);
  }

  function applyRelation(kind: 'parallel' | 'perpendicular') {
    if (polygons.length < 2) return;
    const first = polygons[0];
    const second = polygons[1];
    if (first.geometry.outer.length < 2 || second.geometry.outer.length < 2) return;
    const a1 = projectPointKey({ entityId: first.id, ring: 'outer', pointIndex: 0 });
    const a2 = projectPointKey({ entityId: first.id, ring: 'outer', pointIndex: 1 });
    const b1 = projectPointKey({ entityId: second.id, ring: 'outer', pointIndex: 0 });
    const b2 = projectPointKey({ entityId: second.id, ring: 'outer', pointIndex: 1 });
    applyConstraint(
      { id: makeId('constraint'), kind, a1, a2, b1, b2 },
      [a1, a2],
    );
  }

  function clearConstraints() {
    commitProject({ ...project, constraints: [] });
  }

  return (
    <section>
      <h2>{t('panel.workspaceExtras')}</h2>
      <div className="panel-action-stack">
        <button onClick={groupSelection} disabled={selectedIds.length < 2}>
          {t('panel.groupSelection')}
        </button>
        <button
          onClick={ungroupSelection}
          disabled={
            selectedIds.length === 0 ||
            !(project.groups ?? []).some((group) =>
              !group.locked &&
              group.entityIds.some((id) => selectedIds.includes(id)),
            )
          }
        >
          {t('panel.ungroupSelection')}
        </button>
        <button
          onClick={saveSelectionAsTemplate}
          disabled={selectedIds.length === 0}
        >
          {t('panel.saveTemplate')}
        </button>
        <button onClick={insertLatestTemplate} disabled={templates.length === 0}>
          {t('panel.insertTemplate')} ({templates.length})
        </button>
      </div>
      {(project.groups?.length ?? 0) > 0 && (
        <div className="panel-action-stack">
          {(project.groups ?? []).map((group) => (
            <div className="row" key={group.id} data-group-id={group.id}>
              <span>{group.name}</span>
              <button
                type="button"
                aria-label={t(
                  group.visible ? 'panel.hideGroup' : 'panel.showGroup',
                  { name: group.name },
                )}
                aria-pressed={group.visible}
                onClick={() => toggleGroupVisibility(group.id)}
              >
                {group.visible ? '👁' : '—'}
              </button>
              <button
                type="button"
                aria-label={t(
                  group.locked ? 'panel.unlockGroup' : 'panel.lockGroup',
                  { name: group.name },
                )}
                aria-pressed={group.locked}
                onClick={() => toggleGroupLock(group.id)}
              >
                {group.locked ? '🔒' : '🔓'}
              </button>
            </div>
          ))}
        </div>
      )}

      <h3>{t('panel.constraints')}</h3>
      <div className="geometry-value-form">
        <label htmlFor="constraint-length">{t('panel.edgeLength')}</label>
        <input
          id="constraint-length"
          type="number"
          min="0"
          step="any"
          placeholder={firstEdgeLength > 0 ? String(firstEdgeLength) : undefined}
          value={lengthValue}
          onChange={(event) => setLengthValue(event.target.value)}
        />
        <button onClick={() => applyFirstEdge('length')} disabled={polygons.length === 0}>
          {t('panel.applyLengthConstraint')}
        </button>
      </div>
      <div className="panel-action-stack">
        <button onClick={() => applyFirstEdge('horizontal')} disabled={polygons.length === 0}>
          {t('panel.horizontalConstraint')}
        </button>
        <button onClick={() => applyFirstEdge('vertical')} disabled={polygons.length === 0}>
          {t('panel.verticalConstraint')}
        </button>
        <label className="row" htmlFor="constraint-angle">
          <span>{t('panel.angleConstraint')}</span>
          <input
            id="constraint-angle"
            type="number"
            step="any"
            value={angleValue}
            onChange={(event) => setAngleValue(event.target.value)}
          />
        </label>
        <button onClick={applyAngle} disabled={polygons.length === 0}>
          {t('panel.applyAngleConstraint')}
        </button>
        <button onClick={() => applyRelation('parallel')} disabled={polygons.length < 2}>
          {t('panel.parallelConstraint')}
        </button>
        <button onClick={() => applyRelation('perpendicular')} disabled={polygons.length < 2}>
          {t('panel.perpendicularConstraint')}
        </button>
        <button onClick={clearConstraints} disabled={(project.constraints?.length ?? 0) === 0}>
          {t('panel.clearConstraints')} ({project.constraints?.length ?? 0})
        </button>
      </div>
    </section>
  );
}
