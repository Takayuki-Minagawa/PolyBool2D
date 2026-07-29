import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../app/projectFactory';
import {
  exportProjectFile,
  importProjectFile,
} from '../persistence/projectFileIo';

afterEach(() => vi.restoreAllMocks());

describe('project file I/O', () => {
  it('imports a valid UTF-8 project File and rejects malformed JSON', async () => {
    const project = createEmptyProject();
    project.name = '構造計画';
    const valid = new File([JSON.stringify(project)], 'valid.json', {
      type: 'application/json',
    });
    const invalid = new File(['{broken'], 'invalid.json', {
      type: 'application/json',
    });

    await expect(importProjectFile(valid)).resolves.toMatchObject({
      id: project.id,
      name: '構造計画',
    });
    await expect(importProjectFile(invalid)).resolves.toBeNull();
  });

  it('downloads serialized JSON with a timestamped filename', () => {
    const createObjectUrl = vi.fn(() => 'blob:project');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    exportProjectFile(createEmptyProject());

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:project');
  });
});
