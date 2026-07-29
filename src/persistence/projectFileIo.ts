import type { Project } from '../app/projectTypes';
import {
  decodeProject,
  serializeProject,
  type ProjectDecodeResult,
} from './projectCodec';
import { downloadText, timestamp } from './download';

export type ProjectFileSourceResult = {
  sourceJson: string;
  decodeResult: ProjectDecodeResult;
};

export function exportProjectFile(p: Project): void {
  downloadText(
    serializeProject(p),
    `cad-project-${timestamp()}.json`,
    'application/json',
  );
}

async function readProjectFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    try {
      return await file.text();
    } catch {
      return '';
    }
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

export async function importProjectFileSourceResult(
  file: File,
): Promise<ProjectFileSourceResult> {
  const sourceJson = await readProjectFile(file);
  return {
    sourceJson,
    decodeResult: decodeProject(sourceJson),
  };
}

export async function importProjectFileResult(
  file: File,
): Promise<ProjectDecodeResult> {
  return (await importProjectFileSourceResult(file)).decodeResult;
}

/** Backwards-compatible nullable import helper. */
export async function importProjectFile(file: File): Promise<Project | null> {
  const result = await importProjectFileResult(file);
  return result.ok ? result.project : null;
}
