import type { Project } from '../app/projectTypes';
import { APP_VERSION } from '../app/projectTypes';

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function deserializeProject(json: string): Project | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.version !== 'string' ||
      !Array.isArray(parsed.entities) ||
      !Array.isArray(parsed.layers)
    ) {
      return null;
    }
    return parsed as Project;
  } catch {
    return null;
  }
}

export function exportProjectFile(p: Project): void {
  const blob = new Blob([serializeProject(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 13);
  a.href = url;
  a.download = `cad-project-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importProjectFile(file: File): Promise<Project | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      resolve(deserializeProject(text));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

export const SUPPORTED_VERSIONS = new Set([APP_VERSION]);
