import type { Project } from '../app/projectTypes';
import { deserializeProject, serializeProject } from './projectCodec';
import { downloadText, timestamp } from './download';

export function exportProjectFile(p: Project): void {
  downloadText(
    serializeProject(p),
    `cad-project-${timestamp()}.json`,
    'application/json',
  );
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
