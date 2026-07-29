import { describe, expect, it } from 'vitest';
import {
  ToolBehaviorRegistry,
  toolDefinition,
  toolForShortcut,
} from '../app/toolRegistry';

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

  it('dispatches pointer phases through a tool behavior strategy', () => {
    const calls: string[] = [];
    const registry = new ToolBehaviorRegistry<{ value: string }>().register(
      'rectangle',
      {
        onPointerDown: ({ value }) => {
          calls.push(`down:${value}`);
          return true;
        },
        onPointerMove: ({ value }) => {
          calls.push(`move:${value}`);
          return true;
        },
      },
    );

    expect(
      registry.dispatch('rectangle', 'onPointerDown', { value: 'a' }),
    ).toBe(true);
    expect(
      registry.dispatch('rectangle', 'onPointerMove', { value: 'b' }),
    ).toBe(true);
    expect(calls).toEqual(['down:a', 'move:b']);
  });
});
