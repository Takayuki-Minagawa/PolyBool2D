import type { Project } from '../app/projectTypes';
import { deserializeProject, serializeProject } from './projectSerializer';

const KEY = 'pb2d.project';

export function loadProjectFromLocal(): Project | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  return deserializeProject(raw);
}

export function saveProjectToLocal(p: Project): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, serializeProject(p));
  } catch {
    // ignore
  }
}

export function clearLocalProject(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
