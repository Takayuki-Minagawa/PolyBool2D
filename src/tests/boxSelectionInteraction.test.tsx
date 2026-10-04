import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { useAppStore } from '../app/appStore';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { worldToScreen } from '../app/transform';
import { useViewportStatusStore } from '../app/viewportStatusStore';
import type { Point } from '../geometry/types';
import { CadViewport } from '../components/cad/CadViewport';

let host: HTMLDivElement;
let root: Root;
let svg: SVGSVGElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600,
    width: 800, height: 600, toJSON: () => ({}),
  });
  const project = createEmptyProject();
  project.entities = [1, 100, 200].map((x, index) => ({
    ...createPolygonEntity({
      outer: [{ x, y: 1 }, { x: x + 8, y: 1 }, { x: x + 8, y: 9 }, { x, y: 9 }],
      holes: [],
    }),
    id: `polygon-${index}`,
    locked: index === 2,
  }));
  project.groups = [{
    id: 'group', name: 'Group', entityIds: project.entities.map((entity) => entity.id),
    visible: true, locked: false,
  }];
  useAppStore.getState().loadProject(project);
  useViewportStatusStore.getState().setCursor(null);
  useAppStore.setState((state) => ({
    activeTool: 'select', ui: { ...state.ui, snapEnabled: true, showGrid: false },
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<CadViewport />));
  act(() => useAppStore.getState().setView({ scale: 2, offsetX: 120, offsetY: 340 }));
  svg = host.querySelector('.canvas-wrap > svg')!;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pointer(type: string, point: Point, pointerId = 1, button = 0, target: Element = svg) {
  const screen = worldToScreen(point, useAppStore.getState().view);
  const event = new MouseEvent(type, {
    button, bubbles: true, clientX: screen.x, clientY: screen.y,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  act(() => target.dispatchEvent(event));
}

function beginBox() {
  pointer('pointerdown', { x: 0, y: 10 });
  pointer('pointermove', { x: 10, y: 0 });
  expect(host.querySelector('[data-selection-mode="window"]')).not.toBeNull();
}

describe('box selection interactions', () => {
  it('uses unsnapped coordinates under zoom/pan and expands editable groups without history', () => {
    const project = useAppStore.getState().project;
    beginBox();
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    pointer('pointerup', { x: 10, y: 0 });
    expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
    expect(useAppStore.getState().project).toBe(project);
    expect(useAppStore.getState().history.past).toEqual([]);
  });

  it.each(['tool', 'view', 'project'] as const)('cancels when the %s changes mid-gesture', (change) => {
    beginBox();
    act(() => {
      if (change === 'tool') useAppStore.getState().setActiveTool('rectangle');
      if (change === 'view') useAppStore.getState().setView({ scale: 3, offsetX: 10, offsetY: 300 });
      if (change === 'project') useAppStore.getState().loadProject(createEmptyProject());
    });
    expect(host.querySelector('[data-selection-mode]')).toBeNull();
    pointer('pointerup', { x: 10, y: 0 });
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    expect(useAppStore.getState().history.past).toEqual([]);
  });

  it('ignores another pointer until the initiating pointer completes', () => {
    beginBox();
    pointer('pointerup', { x: 10, y: 0 }, 2);
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    expect(host.querySelector('[data-selection-mode]')).not.toBeNull();
    pointer('pointerup', { x: 10, y: 0 });
    expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
  });

  it.each(['shape', 'vertex', 'blank', 'ruler'] as const)(
    'keeps the box gesture exclusive when another pointer presses a %s',
    (targetKind) => {
      if (targetKind === 'vertex') {
        act(() => useAppStore.getState().selectMany(['polygon-0']));
      }
      const project = useAppStore.getState().project;
      const view = useAppStore.getState().view;
      beginBox();
      const selector = targetKind === 'shape' ? '.canvas-wrap > svg > path'
        : targetKind === 'ruler' ? '[data-ruler-orientation="vertical"]'
          : '.canvas-wrap > svg circle';
      const target = targetKind === 'blank' ? svg : host.querySelector(selector)!;
      expect(target).not.toBeNull();
      pointer('pointerdown', { x: 5, y: 5 }, 2, targetKind === 'blank' ? 1 : 0, target);
      pointer('pointermove', { x: 30, y: 30 }, 2);
      pointer('pointerup', { x: 30, y: 30 }, 2);
      expect(host.querySelector('[data-selection-mode]')).not.toBeNull();
      pointer('pointermove', { x: 10, y: 0 });
      pointer('pointerup', { x: 10, y: 0 });
      expect(useAppStore.getState().project).toBe(project);
      expect(useAppStore.getState().view).toEqual(view);
      expect(useAppStore.getState().history.past).toEqual([]);
      expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
      expect(host.querySelector('[data-selection-mode]')).toBeNull();
    },
  );

  it('does not begin a box while an entity drag owns the gesture', () => {
    const target = host.querySelector('.canvas-wrap > svg > path')!;
    pointer('pointerdown', { x: 5, y: 5 }, 1, 0, target);
    pointer('pointerdown', { x: 0, y: 10 }, 2);
    pointer('pointermove', { x: 10, y: 5 });
    pointer('pointerup', { x: 10, y: 5 });
    expect(host.querySelector('[data-selection-mode]')).toBeNull();
    expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
    expect(useAppStore.getState().history.past).toHaveLength(1);
    const project = useAppStore.getState().project;
    pointer('pointerup', { x: 30, y: 30 }, 2);
    pointer('pointermove', { x: 50, y: 50 });
    expect(useAppStore.getState().project).toBe(project);
    expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
  });

  it('does not begin a box from a non-primary pointer', () => {
    act(() => useAppStore.getState().selectMany(['polygon-0']));
    const project = useAppStore.getState().project;
    const screen = worldToScreen({ x: 300, y: 20 }, useAppStore.getState().view);
    const event = new MouseEvent('pointerdown', {
      button: 0, bubbles: true, clientX: screen.x, clientY: screen.y,
    });
    Object.defineProperties(event, {
      pointerId: { value: 2 },
      isPrimary: { value: false },
    });
    act(() => svg.dispatchEvent(event));
    pointer('pointermove', { x: 320, y: 0 }, 2);
    expect(host.querySelector('[data-selection-mode]')).toBeNull();
    pointer('pointerup', { x: 320, y: 0 }, 2);
    expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
    expect(useAppStore.getState().project).toBe(project);
    expect(useAppStore.getState().history.past).toEqual([]);
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    'ignores %s from another pointer and tracks only the initiating cursor',
    (event) => {
      beginBox();
      const cursor = useViewportStatusStore.getState().cursor;
      expect(cursor?.x).toBe(10);
      expect(cursor?.y).toBeCloseTo(0);
      pointer('pointermove', { x: 30, y: 30 }, 2);
      expect(useViewportStatusStore.getState().cursor).toBe(cursor);
      pointer(event, { x: 30, y: 30 }, 2);
      expect(useViewportStatusStore.getState().cursor).toBe(cursor);
      expect(host.querySelector('[data-selection-mode]')).not.toBeNull();
      pointer('pointerup', { x: 10, y: 0 });
      expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
      expect(useAppStore.getState().history.past).toEqual([]);
    },
  );

  it.each(['pointercancel', 'lostpointercapture'])(
    'discards the gesture when its initiating pointer emits %s',
    (event) => {
      beginBox();
      pointer(event, { x: 10, y: 0 });
      expect(host.querySelector('[data-selection-mode]')).toBeNull();
      expect(useViewportStatusStore.getState().cursor).toBeNull();
      pointer('pointerup', { x: 10, y: 0 });
      expect(useAppStore.getState().selectedEntityIds).toEqual([]);
      expect(useAppStore.getState().history.past).toEqual([]);
    },
  );

  it('discards the box on window blur and preserves the previous selection', () => {
    act(() => useAppStore.getState().selectMany(['polygon-0']));
    beginBox();
    act(() => window.dispatchEvent(new Event('blur')));
    pointer('pointerup', { x: 10, y: 0 });
    expect(host.querySelector('[data-selection-mode]')).toBeNull();
    expect(useAppStore.getState().selectedEntityIds).toEqual(['polygon-0', 'polygon-1']);
  });

  it('keeps middle-button panning independent of selection', () => {
    pointer('pointerdown', { x: 0, y: 10 }, 1, 1);
    pointer('pointermove', { x: 10, y: 0 }, 1, 1);
    pointer('pointerup', { x: 10, y: 0 }, 1, 1);
    expect(host.querySelector('[data-selection-mode]')).toBeNull();
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    expect(useAppStore.getState().view.offsetX).toBe(140);
  });
});
