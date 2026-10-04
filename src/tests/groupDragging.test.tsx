import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { useAppStore } from '../app/appStore';
import { createEntityGroup } from '../app/groups';
import { createEmptyProject, createLinearEntity } from '../app/projectFactory';
import type { Entity, Project } from '../app/projectTypes';
import { CadViewport } from '../components/cad/CadViewport';

let root: Root;
let host: HTMLDivElement;

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
  useAppStore.getState().resetProject();
  useAppStore.setState((state) => ({
    activeTool: 'select',
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    preview: { type: 'none' },
    ui: { ...state.ui, showGrid: false, snapEnabled: false },
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function groupedProject(): Project {
  const project = createEmptyProject();
  project.entities = [0, 20, 40, 60].map((y, index) => ({
    ...createLinearEntity([{ x: 0, y }, { x: 10, y }], 'polyline'),
    id: `line-${index}`,
  }));
  project.groups = [
    createEntityGroup(['line-0', 'line-1'])!,
    createEntityGroup(['line-1', 'line-2'])!,
  ];
  return project;
}

function dragFirstLine(): void {
  // Mounting the viewport fits content; keep the pointer/world delta explicit.
  act(() => useAppStore.getState().setView({ scale: 1, offsetX: 0, offsetY: 0 }));
  const svg = host.querySelector('svg')!;
  const line = host.querySelector('polyline')!;
  act(() => {
    line.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0, bubbles: true, clientX: 100, clientY: 100,
    }));
  });
  act(() => {
    svg.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true, clientX: 115, clientY: 110,
    }));
    svg.dispatchEvent(new MouseEvent('pointerup', {
      button: 0, bubbles: true, clientX: 115, clientY: 110,
    }));
  });
}

function translated(entity: Entity): Entity {
  if (entity.type !== 'guide-line') throw new Error('Expected a linear fixture');
  return {
    ...entity,
    points: entity.points.map((point) => ({ x: point.x + 15, y: point.y - 10 })),
  };
}

describe('group dragging', () => {
  it('moves an unselected transitive group together on the first drag and undoes once', () => {
    const project = groupedProject();
    useAppStore.getState().loadProject(project);
    act(() => root.render(<CadViewport />));

    dragFirstLine();

    expect(useAppStore.getState().selectedEntityIds).toEqual(['line-0', 'line-1', 'line-2']);
    expect(useAppStore.getState().project.entities).toEqual(
      project.entities.map((entity, index) => index < 3 ? translated(entity) : entity),
    );
    expect(useAppStore.getState().history.past).toHaveLength(1);
    act(() => useAppStore.getState().undo());
    expect(useAppStore.getState().project.entities).toEqual(project.entities);
  });

  it('keeps an existing multiselection together when dragging a selected member', () => {
    const project = groupedProject();
    useAppStore.getState().loadProject(project);
    useAppStore.getState().selectMany(['line-0', 'line-3']);
    act(() => root.render(<CadViewport />));

    dragFirstLine();

    expect(useAppStore.getState().project.entities).toEqual(project.entities.map(translated));
    expect(useAppStore.getState().selectedEntityIds).toHaveLength(4);
    expect(useAppStore.getState().history.past).toHaveLength(1);
  });

  it('leaves hidden and locked group members unchanged', () => {
    const project = groupedProject();
    project.entities[1].locked = true;
    project.entities[2].visible = false;
    useAppStore.getState().loadProject(project);
    act(() => root.render(<CadViewport />));

    dragFirstLine();

    expect(useAppStore.getState().selectedEntityIds).toEqual(['line-0']);
    expect(useAppStore.getState().project.entities).toEqual(
      project.entities.map((entity, index) => index === 0 ? translated(entity) : entity),
    );
  });
});
