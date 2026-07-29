import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createEmptyProject } from '../../app/projectFactory';
import { useAppStore } from '../../app/appStore';
import type { Project } from '../../app/projectTypes';
import {
  deleteLocalProject,
  duplicateLocalProject,
  listLocalProjects,
  listProjectBackups,
  loadProjectById,
  renameLocalProject,
  restoreProjectBackup,
  saveProjectToLocal,
  setActiveProjectId,
  type ProjectBackupSummary,
  type StoredProjectSummary,
} from '../../persistence/localProjectStore';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const refresh = () => setProjects(listLocalProjects());

  useEffect(() => {
    if (!open) return;
    refresh();
    setBackupProjectId(null);
    setBackups([]);
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
    const project = id === liveProject.id ? liveProject : loadProjectById(id);
    if (!project) return;
    if (!onLoadProject(project, { saveCurrent: id !== liveProject.id })) return;
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
      renamed = renameLocalProject(project.id, trimmed);
      if (!renamed) {
        onPersistenceError();
        return;
      }
    }
    setEditingId(null);
    refresh();
  }

  function duplicateProject(id: string) {
    const liveProject = useAppStore.getState().project;
    if (id === liveProject.id && !saveProjectToLocal(liveProject)) {
      onPersistenceError();
      return;
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
    }
    const remaining = listLocalProjects();
    setProjects(remaining);
    if (!deletingCurrent) return;

    const replacement = remaining[0] ? loadProjectById(remaining[0].id) : createEmptyProject();
    if (!replacement) {
      onPersistenceError();
      return;
    }
    if (remaining[0]) setActiveProjectId(remaining[0].id);
    onLoadProject(replacement, { saveCurrent: false });
  }

  function restoreBackup(projectId: string, backupId: string) {
    const liveProject = useAppStore.getState().project;
    if (liveProject.id === projectId && !saveProjectToLocal(liveProject)) {
      onPersistenceError();
      return;
    }
    const restored = restoreProjectBackup(projectId, backupId);
    if (!restored) {
      onPersistenceError();
      return;
    }
    onLoadProject(restored, { saveCurrent: false });
    refresh();
    setBackups(listProjectBackups(projectId));
  }

  function showBackups(id: string) {
    if (backupProjectId === id) {
      setBackupProjectId(null);
      setBackups([]);
      return;
    }
    setBackupProjectId(id);
    setBackups(listProjectBackups(id));
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
                      {backups.length === 0 ? (
                        <span className="muted-text">{t('projects.noBackups')}</span>
                      ) : (
                        backups.map((backup) => (
                          <div className="backup-row" key={backup.id}>
                            <span>
                              {displayDate(backup.savedAt)} · {backup.entityCount}{' '}
                              {t('projects.entities')}
                            </span>
                            <button
                              type="button"
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
