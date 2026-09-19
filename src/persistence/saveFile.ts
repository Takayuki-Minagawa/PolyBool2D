import { downloadBlob } from './download';

export function projectFilename(name: string, extension: string): string {
  return `${name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'PolyBool2D'}.${extension}`;
}
type FileHandle = {
  createWritable: () => Promise<{
    write: (blob: Blob) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
};

/** Call during the click, before rendering/conversion consumes the user gesture. */
export async function chooseFile(name: string): Promise<FileHandle | null> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
      }) => Promise<FileHandle>;
    }
  ).showSaveFilePicker;
  return picker ? picker({ suggestedName: name }) : null;
}
export async function saveBlob(
  blob: Blob,
  name: string,
  handle: FileHandle | null,
): Promise<'saved' | 'download-started'> {
  if (!handle) {
    downloadBlob(blob, name);
    return 'download-started';
  }
  const stream = await handle.createWritable();
  try {
    await stream.write(blob);
    await stream.close();
  } catch (error) {
    await stream.abort().catch(() => undefined);
    throw error;
  }
  return 'saved';
}
