import type { Project } from '../app/projectTypes';
import {
  decodeProject,
  serializeProject,
  type ProjectDecodeResult,
} from './projectCodec';
import { downloadText, timestamp } from './download';

export function exportProjectFile(p: Project): void {
  downloadText(
    serializeProject(p),
    `cad-project-${timestamp()}.json`,
    'application/json',
  );
}

export function importProjectFileResult(file: File): Promise<ProjectDecodeResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      resolve(decodeProject(text));
    };
    reader.onerror = () => resolve(decodeProject(''));
    reader.readAsText(file);
  });
}

/** Backwards-compatible nullable import helper. */
export async function importProjectFile(file: File): Promise<Project | null> {
  const result = await importProjectFileResult(file);
  return result.ok ? result.project : null;
}
