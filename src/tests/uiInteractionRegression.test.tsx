import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { useAppStore } from '../app/appStore';
import { boundsForEntities, fitBoundsToView } from '../app/transform';
import { BooleanActions } from '../components/layout/BooleanActions';
import { CadViewport } from '../components/cad/CadViewport';
import { ContextMenu } from '../components/cad/ContextMenu';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function viewportRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: 800,
    bottom: 600,
    left: 0,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  };
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = TestResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(viewportRect());
  useAppStore.getState().resetProject();
  useAppStore.setState((state) => ({
    activeTool: 'select',
    preview: { type: 'none' },
    ui: {
      ...state.ui,
      language: 'ja',
      manualOpen: false,
      shortcutsOpen: false,
      snapEnabled: true,
    },
  }));
  await i18n.changeLanguage('ja');
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function render(node: React.ReactNode) {
  act(() => {
    root = createRoot(host!);
    root.render(node);
  });
}

describe('viewport interaction regressions', () => {
  it('ignores non-left pointer buttons for drawing input', () => {
    act(() => useAppStore.getState().setActiveTool('polygon'));
    render(<CadViewport />);
    const svg = host!.querySelector('svg')!;

    act(() => {
      svg.dispatchEvent(
        new MouseEvent('pointerdown', {
          button: 2,
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
    });
    expect(useAppStore.getState().preview.type).toBe('none');

    act(() => {
      svg.dispatchEvent(
        new MouseEvent('pointerdown', {
          button: 0,
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
    });
    expect(useAppStore.getState().preview.type).toBe('polygon');
  });

  it('fits only effectively visible entities', () => {
    let visibleId = '';
    let hiddenId = '';
    act(() => {
      visibleId = useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 })!.id;
      hiddenId = useAppStore
        .getState()
        .addRectangle({ x: 1000, y: 1000 }, { x: 1010, y: 1010 })!.id;
      useAppStore.getState().updateEntityProperties(hiddenId, { visible: false });
      useAppStore.getState().clearSelection();
    });
    render(<CadViewport />);

    const fitButton = host!.querySelector('button[title="全体表示 (F)"]') as HTMLButtonElement;
    act(() => fitButton.click());

    const visibleEntity = useAppStore
      .getState()
      .project.entities.find((entity) => entity.id === visibleId)!;
    const expectedBounds = boundsForEntities([visibleEntity])!;
    expect(useAppStore.getState().view).toEqual(fitBoundsToView(expectedBounds, 800, 600));
  });

  it('drags linear entities and records one undo snapshot', () => {
    let lineId = '';
    act(() => {
      lineId = useAppStore.getState().addLinearEntity(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        'polyline',
      )!.id;
      useAppStore.setState((state) => ({
        project: { ...state.project, updatedAt: '2000-01-01T00:00:00.000Z' },
        history: { past: [], future: [] },
      }));
    });
    const before = useAppStore.getState().project.entities.find(
      (entity) => entity.id === lineId && entity.type === 'guide-line',
    );
    expect(before?.type).toBe('guide-line');
    render(<CadViewport />);
    const svg = host!.querySelector('svg')!;
    const line = host!.querySelector('polyline')!;

    act(() => {
      line.dispatchEvent(new MouseEvent('pointerdown', {
        button: 0,
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }));
      svg.dispatchEvent(new MouseEvent('pointermove', {
        button: 0,
        bubbles: true,
        clientX: 120,
        clientY: 110,
      }));
      svg.dispatchEvent(new MouseEvent('pointerup', {
        button: 0,
        bubbles: true,
        clientX: 120,
        clientY: 110,
      }));
    });

    const after = useAppStore.getState().project.entities.find(
      (entity) => entity.id === lineId && entity.type === 'guide-line',
    );
    expect(after?.type).toBe('guide-line');
    if (before?.type === 'guide-line' && after?.type === 'guide-line') {
      expect(after.points).not.toEqual(before.points);
    }
    expect(useAppStore.getState().history.past).toHaveLength(1);
    expect(useAppStore.getState().project.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('uses Shift for a square rectangle without collapsing either dimension', () => {
    act(() => {
      useAppStore.getState().setActiveTool('rectangle');
      useAppStore.setState((state) => ({
        project: {
          ...state.project,
          settings: { ...state.project.settings, angleSnapEnabled: true },
        },
        ui: { ...state.ui, snapEnabled: false },
      }));
    });
    render(<CadViewport />);
    const svg = host!.querySelector('svg')!;

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    act(() => {
      svg.dispatchEvent(new MouseEvent('pointerdown', {
        button: 0,
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }));
      svg.dispatchEvent(new MouseEvent('pointermove', {
        button: 0,
        bubbles: true,
        clientX: 150,
        clientY: 130,
      }));
      svg.dispatchEvent(new MouseEvent('pointerup', {
        button: 0,
        bubbles: true,
        clientX: 150,
        clientY: 130,
      }));
    });
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })));

    const polygon = useAppStore.getState().project.entities.find(
      (entity) => entity.type === 'polygon',
    );
    expect(polygon?.type).toBe('polygon');
    if (polygon?.type === 'polygon') {
      const xs = polygon.geometry.outer.map((point) => point.x);
      const ys = polygon.geometry.outer.map((point) => point.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeCloseTo(width);
    }
  });

  it('accepts an exact circle radius before the pointer has moved', () => {
    act(() => {
      useAppStore.getState().setActiveTool('circle');
      useAppStore.setState((state) => ({ ui: { ...state.ui, snapEnabled: false } }));
    });
    render(<CadViewport />);
    const svg = host!.querySelector('svg')!;
    act(() => {
      svg.dispatchEvent(new MouseEvent('pointerdown', {
        button: 0,
        bubbles: true,
        clientX: 200,
        clientY: 200,
      }));
    });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));

    const polygon = useAppStore.getState().project.entities.find(
      (entity) => entity.type === 'polygon',
    );
    expect(polygon?.type).toBe('polygon');
    if (polygon?.type === 'polygon') {
      const xs = polygon.geometry.outer.map((point) => point.x);
      expect((Math.max(...xs) - Math.min(...xs)) / 2).toBeCloseTo(25, 6);
    }
  });

  it('uses selection order for context-menu difference subject', () => {
    let firstId = '';
    let secondId = '';
    act(() => {
      firstId = useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 })!.id;
      secondId = useAppStore.getState().addRectangle({ x: 5, y: 0 }, { x: 15, y: 10 })!.id;
      useAppStore.getState().selectMany([secondId, firstId]);
    });
    render(<CadViewport />);
    const firstPath = host!.querySelector('svg path')!;
    act(() => {
      firstPath.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    });
    const difference = [...host!.querySelectorAll<HTMLButtonElement>('[role="menu"] button')]
      .find((button) => button.textContent === '差分')!;
    act(() => difference.click());

    const result = useAppStore.getState().project.entities.find(
      (entity) => entity.type === 'polygon',
    );
    expect(result?.type).toBe('polygon');
    if (result?.type === 'polygon') {
      expect(Math.min(...result.geometry.outer.map((point) => point.x))).toBeCloseTo(10);
    }
  });
});

describe('BooleanActions selection eligibility', () => {
  it('requires two selected polygons, not merely two selected entities', () => {
    let firstPolygonId = '';
    let lineId = '';
    act(() => {
      firstPolygonId = useAppStore
        .getState()
        .addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 })!.id;
      lineId = useAppStore
        .getState()
        .addLinearEntity(
          [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
          ],
          'polyline',
        )!.id;
      useAppStore.getState().selectMany([firstPolygonId, lineId]);
    });
    render(<BooleanActions variant="toolbar" />);
    const buttons = [...host!.querySelectorAll('button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => button.disabled)).toBe(true);

    let secondPolygonId = '';
    act(() => {
      secondPolygonId = useAppStore
        .getState()
        .addRectangle({ x: 20, y: 0 }, { x: 30, y: 10 })!.id;
      useAppStore.getState().selectMany([lineId, firstPolygonId, secondPolygonId]);
    });

    expect(buttons.every((button) => !button.disabled)).toBe(true);
  });
});

describe('context menu keyboard access', () => {
  it('focuses enabled actions and supports arrow navigation and Escape', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={20}
        y={20}
        onClose={onClose}
        items={[
          { id: 'disabled', label: 'Disabled', disabled: true, onSelect: vi.fn() },
          { id: 'first', label: 'First', onSelect: vi.fn() },
          { id: 'second', label: 'Second', onSelect: vi.fn() },
        ]}
      />,
    );
    expect(document.activeElement?.textContent).toBe('First');

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })));
    expect(document.activeElement?.textContent).toBe('Second');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
