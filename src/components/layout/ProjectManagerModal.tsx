import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createEmptyProject } from '../../app/projectFactory';
import { projectDecodeFeedback } from '../../app/projectDecodeFeedback';
import { useAppStore } from '../../app/appStore';
import type { Project } from '../../app/projectTypes';
import {
  deleteLocalProject,
  deleteProjectRecoverySnapshot,
  duplicateLocalProject,
  getProjectRecoverySourceJson,
  getProjectRecoverySnapshot,
  listLocalProjects,
  listProjectBackups,
  loadProjectByIdResult,
  renameLocalProject,
  restoreProjectBackupResult,
  restoreProjectRecoverySnapshot,
  saveProjectToLocal,
  setActiveProjectId,
  type ProjectBackupSummary,
  type ProjectRecoverySnapshotSummary,
  type StoredProjectSummary,
} from '../../persistence/localProjectStore';
import type {
  ProjectDecodeFailureReason,
  ProjectDecodeResult,
  ProjectDecodeSuccess,
} from '../../persistence/projectCodec';
import { downloadText, timestamp } from '../../persistence/download';
import { useModalDismiss } from '../common/useModalDismiss';

type Props = {
  open: boolean;
  onClose: () => void;
  onLoadProject: (project: Project, options?: { saveCurrent?: boolean }) => boolean;
  onPersistenceError: () => void;
};

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ProjectManagerModal({
  open,
  onClose,
  onLoadProject,
  onPersistenceError,
}: Props) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<StoredProjectSummary[]>([]);
  const [backupProjectId, setBackupProjectId] = useState<string | null>(null);
  const [backups, setBackups] = useState<ProjectBackupSummary[]>([]);
  const [recoverySnapshot, setRecoverySnapshot] =
    useState<ProjectRecoverySnapshotSummary | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const refresh = () => setProjects(listLocalProjects());
  const reportDecodeResult = (
    result: ProjectDecodeResult,
  ): result is ProjectDecodeSuccess => {
    const feedback = projectDecodeFeedback(result, t);
    if (feedback) useAppStore.getState().setErrorMessage(feedback);
    return result.ok;
  };
  const decodeFailureLabel = (
    reason?: ProjectDecodeFailureReason,
  ): string | null => (
    reason
      ? t('projects.restoreUnavailable', {
          reason: t(`errors.projectDecodeReasons.${reason}`),
        })
      : null
  );

  useEffect(() => {
    if (!open) return;
    refresh();
    setBackupProjectId(null);
    setBackups([]);
    setRecoverySnapshot(null);
    setEditingId(null);
  }, [open]);

  useModalDismiss({
    open,
    onDismiss: onClose,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
  });

  if (!open) return null;

  function openProject(id: string) {
    const liveProject = useAppStore.getState().project;
    let project = liveProject;
    let decodeResult: ProjectDecodeSuccess | null = null;
    if (id !== liveProject.id) {
      const result = loadProjectByIdResult(id);
      if (!result) {
        onPersistenceError();
        return;
      }
      if (!reportDecodeResult(result)) return;
      project = result.project;
      decodeResult = result;
    }
    if (!onLoadProject(project, { saveCurrent: id !== liveProject.id })) return;
    if (decodeResult) reportDecodeResult(decodeResult);
    setActiveProjectId(id);
    onClose();
  }

  function commitRename(project: StoredProjectSummary) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    const liveProject = useAppStore.getState().project;
    let renamed: Project | null;
    if (project.id === liveProject.id) {
      renamed = { ...liveProject, name: trimmed, updatedAt: new Date().toISOString() };
      if (!saveProjectToLocal(renamed)) {
        onPersistenceError();
        return;
      }
      if (!onLoadProject(renamed, { saveCurrent: false })) return;
    } else {
      const source = loadProjectByIdResult(project.id);
      if (!source || !reportDecodeResult(source)) return;
      renamed = renameLocalProject(project.id, trimmed);
      if (!renamed) {
        onPersistenceError();
        return;
      }
    }
    setEditingId(null);
    refresh();
    if (backupProjectId === project.id) {
      setBackups(listProjectBackups(project.id));
      setRecoverySnapshot(getProjectRecoverySnapshot(project.id));
    }
  }

  function duplicateProject(id: string) {
    const liveProject = useAppStore.getState().project;
    if (id === liveProject.id && !saveProjectToLocal(liveProject)) {
      onPersistenceError();
      return;
    }
    if (id !== liveProject.id) {
      const source = loadProjectByIdResult(id);
      if (!source || !reportDecodeResult(source)) return;
    }
    if (!duplicateLocalProject(id)) {
      onPersistenceError();
      return;
    }
    refresh();
  }

  function deleteProject(id: string) {
    if (!window.confirm(t('projects.confirmDelete'))) return;
    const deletingCurrent = useAppStore.getState().project.id === id;
    if (!deleteLocalProject(id)) {
      onPersistenceError();
      return;
    }
    if (backupProjectId === id) {
      setBackupProjectId(null);
      setBackups([]);
      setRecoverySnapshot(null);
    }
    const remaining = listLocalProjects();
    setProjects(remaining);
    if (!deletingCurrent) return;

    let replacement = createEmptyProject();
    let replacementId: string | null = null;
    let pendingDecodeFeedback: ProjectDecodeResult | null = null;
    for (const summary of remaining) {
      const result = loadProjectByIdResult(summary.id);
      if (!result) continue;
      if (!result.ok) {
        pendingDecodeFeedback ??= result;
        continue;
      }
      replacement = result.project;
      replacementId = summary.id;
      if (
        !pendingDecodeFeedback &&
        (
          result.discardedItemCount > 0 ||
          result.sourceWasNormalized
        )
      ) {
        pendingDecodeFeedback = result;
      }
      break;
    }
    if (!onLoadProject(replacement, { saveCurrent: false })) return;
    setActiveProjectId(replacementId);
    if (pendingDecodeFeedback) {
      reportDecodeResult(pendingDecodeFeedback);
    }
  }

  function restoreBackup(projectId: string, backupId: string) {
    const liveProject = useAppStore.getState().project;
    if (liveProject.id === projectId && !saveProjectToLocal(liveProject)) {
      onPersistenceError();
      return;
    }
    const restored = restoreProjectBackupResult(projectId, backupId);
    if (!restored.ok) {
      if (restored.decodeResult) reportDecodeResult(restored.decodeResult);
      else onPersistenceError();
      return;
    }
    if (!onLoadProject(restored.project, { saveCurrent: false })) return;
    reportDecodeResult(restored.decodeResult);
    refresh();
    setBackups(listProjectBackups(projectId));
    setRecoverySnapshot(getProjectRecoverySnapshot(projectId));
  }

  function restoreRecoverySnapshot(projectId: string) {
    const liveProject = useAppStore.getState().project;
    if (liveProject.id === projectId && !saveProjectToLocal(liveProject)) {
      onPersistenceError();
      return;
    }
    const restored = restoreProjectRecoverySnapshot(projectId);
    if (!restored.ok) {
      if (restored.decodeResult) reportDecodeResult(restored.decodeResult);
      else onPersistenceError();
      return;
    }
    if (!onLoadProject(restored.project, { saveCurrent: false })) return;
    reportDecodeResult(restored.decodeResult);
    refresh();
    setBackups(listProjectBackups(projectId));
    setRecoverySnapshot(getProjectRecoverySnapshot(projectId));
  }

  function discardRecoverySnapshot(projectId: string) {
    if (!window.confirm(t('projects.confirmDiscardRecovery'))) return;
    if (!deleteProjectRecoverySnapshot(projectId)) {
      onPersistenceError();
      return;
    }
    setRecoverySnapshot(null);
  }

  function downloadRecoverySource(projectId: string) {
    const source = getProjectRecoverySourceJson(projectId);
    if (source === null) {
      onPersistenceError();
      return;
    }
    downloadText(
      source,
      `polybool2d-recovery-${timestamp()}.json`,
      'application/json',
    );
  }

  function showBackups(id: string) {
    if (backupProjectId === id) {
      setBackupProjectId(null);
      setBackups([]);
      setRecoverySnapshot(null);
      return;
    }
    setBackupProjectId(id);
    setBackups(listProjectBackups(id));
    setRecoverySnapshot(getProjectRecoverySnapshot(id));
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal project-manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-manager-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="project-manager-title">{t('projects.title')}</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            {t('manual.close')}
          </button>
        </header>
        <div className="body">
          {projects.length === 0 ? (
            <p className="muted-text">{t('projects.empty')}</p>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <div className="project-card" key={project.id}>
                  <div className="project-card-heading">
                    {editingId === project.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingId(null);
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.stopPropagation();
                            commitRename(project);
                          }
                        }}
                      />
                    ) : (
                      <strong>{project.name}</strong>
                    )}
                    <span className="muted-text">{displayDate(project.updatedAt)}</span>
                  </div>
                  <div className="project-actions">
                    <button type="button" onClick={() => openProject(project.id)}>
                      {t('projects.open')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(project.id);
                        setEditingName(project.name);
                      }}
                    >
                      {t('projects.rename')}
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateProject(project.id)}
                    >
                      {t('projects.duplicate')}
                    </button>
                    <button type="button" onClick={() => showBackups(project.id)}>
                      {t('projects.backups')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteProject(project.id)}
                    >
                      {t('projects.delete')}
                    </button>
                  </div>
                  {backupProjectId === project.id && (
                    <div className="backup-list">
                      {recoverySnapshot && (
                        <div className="backup-row recovery-snapshot-row">
                          <span>
                            {t('projects.recoverySnapshot')} ·{' '}
                            {displayDate(recoverySnapshot.savedAt)} ·{' '}
                            {recoverySnapshot.entityCount} {t('projects.entities')}
                            {recoverySnapshot.decodeFailureReason && (
                              <>
                                {' · '}
                                {decodeFailureLabel(
                                  recoverySnapshot.decodeFailureReason,
                                )}
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(
                              recoverySnapshot.decodeFailureReason,
                            )}
                            title={
                              decodeFailureLabel(
                                recoverySnapshot.decodeFailureReason,
                              ) ?? undefined
                            }
                            onClick={() => restoreRecoverySnapshot(project.id)}
                          >
                            {t('projects.restore')}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadRecoverySource(project.id)}
                          >
                            {t('projects.downloadRecovery')}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => discardRecoverySnapshot(project.id)}
                          >
                            {t('projects.discardRecovery')}
                          </button>
                        </div>
                      )}
                      {!recoverySnapshot && backups.length === 0 ? (
                        <span className="muted-text">{t('projects.noBackups')}</span>
                      ) : (
                        backups.map((backup) => (
                          <div className="backup-row" key={backup.id}>
                            <span>
                              {displayDate(backup.savedAt)} · {backup.entityCount}{' '}
                              {t('projects.entities')}
                              {backup.decodeFailureReason && (
                                <>
                                  {' · '}
                                  {decodeFailureLabel(backup.decodeFailureReason)}
                                </>
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={Boolean(backup.decodeFailureReason)}
                              title={
                                decodeFailureLabel(backup.decodeFailureReason) ??
                                undefined
                              }
                              onClick={() => restoreBackup(project.id, backup.id)}
                            >
                              {t('projects.restore')}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
