import { describe, expect, it } from 'vitest';
import { toolDefinition, toolForShortcut } from '../app/toolRegistry';

describe('toolRegistry', () => {
  it('maps shortcuts to tools', () => {
    expect(toolForShortcut('v')).toBe('select');
    expect(toolForShortcut('E')).toBe('vertex-edit');
    expect(toolForShortcut('?')).toBeNull();
  });

  it('provides label and guide keys from one definition', () => {
    const tool = toolDefinition('vertex-edit');
    expect(tool.labelKey).toBe('toolbar.vertexEdit');
    expect(tool.guideKey).toBe('status.guideVertex-edit');
  });
});
