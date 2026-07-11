import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../i18n';
import { App } from '../app/App';
import { useAppStore } from '../app/appStore';
import { createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function polygonCount(): number {
  return useAppStore
    .getState()
    .project.entities.filter((entity) => entity.type === 'polygon').length;
}

function press(
  key: string,
  modifier: 'ctrlKey' | 'metaKey',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    [modifier]: true,
  });
  act(() => window.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = TestResizeObserver;
  localStorage.clear();
  window.location.hash = '';
  host = document.createElement('div');
  document.body.appendChild(host);

  useAppStore.getState().resetProject();
  const entity = createPolygonEntity({
    outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
    holes: [],
  });
  useAppStore.setState((state) => ({
    project: { ...state.project, entities: [entity] },
    selectedEntityIds: [entity.id],
    activeTool: 'measure',
    clipboard: { entities: [], pasteCount: 0 },
    history: { past: [], future: [] },
  }));

  act(() => {
    root = createRoot(host!);
    root.render(<App />);
  });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  window.location.hash = '';
});

describe.each([
  ['Ctrl', 'ctrlKey'],
  ['Meta', 'metaKey'],
] as const)('App %s clipboard shortcuts', (_label, modifier) => {
  it('runs copy/cut/paste without activating C or V tool shortcuts', () => {
    const sourceId = useAppStore.getState().selectedEntityIds[0];

    expect(press('c', modifier).defaultPrevented).toBe(true);
    expect(useAppStore.getState().clipboard.entities).toHaveLength(1);
    expect(polygonCount()).toBe(1);
    expect(useAppStore.getState().activeTool).toBe('measure');

    expect(press('x', modifier).defaultPrevented).toBe(true);
    expect(polygonCount()).toBe(0);
    expect(useAppStore.getState().clipboard.entities).toHaveLength(1);
    expect(useAppStore.getState().activeTool).toBe('measure');

    expect(press('v', modifier).defaultPrevented).toBe(true);
    expect(polygonCount()).toBe(1);
    const state = useAppStore.getState();
    expect(state.selectedEntityIds).toHaveLength(1);
    expect(state.selectedEntityIds[0]).not.toBe(sourceId);
    expect(state.clipboard.pasteCount).toBe(1);
    expect(state.activeTool).toBe('measure');
  });
});
