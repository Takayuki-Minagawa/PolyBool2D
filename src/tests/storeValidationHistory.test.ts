import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { rectangleToRing } from '../geometry/circle';

beforeEach(() => {
  useAppStore.getState().resetProject();
  useAppStore.setState((state) => ({
    ui: { ...state.ui, errorMessage: null, invalidEntityIds: [] },
  }));
});

describe('validation state across editing history', () => {
  it('recomputes invalid highlights after undo and redo', () => {
    const entity = useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    if (!entity) throw new Error('fixture setup failed');
    useAppStore.getState().updateEntityGeometry(entity.id, {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
      holes: [],
    });
    expect(useAppStore.getState().ui.invalidEntityIds).toContain(entity.id);

    useAppStore.getState().undo();
    expect(useAppStore.getState().ui.invalidEntityIds).not.toContain(entity.id);
    useAppStore.getState().redo();
    expect(useAppStore.getState().ui.invalidEntityIds).toContain(entity.id);
  });

  it('clears a validation error once the geometry is corrected', () => {
    const entity = useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    if (!entity) throw new Error('fixture setup failed');
    useAppStore.getState().updateEntityGeometry(entity.id, {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
      holes: [],
    });
    expect(useAppStore.getState().ui.errorMessage).toMatch(/^errors\.validation\./);
    useAppStore.getState().updateEntityGeometry(entity.id, {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    expect(useAppStore.getState().ui.errorMessage).toBeNull();
  });
});

describe('action feedback and no-op history', () => {
  it('reports invalid ellipse dimensions', () => {
    expect(useAppStore.getState().addEllipse({ x: 0, y: 0 }, 0, 10)).toBeNull();
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidEllipse');
  });

  it('does not create history entries for unchanged properties', () => {
    const state = useAppStore.getState();
    const layer = state.project.layers[0];
    state.updateLayer(layer.id, { name: layer.name });
    expect(useAppStore.getState().history.past).toHaveLength(0);

    const entity = state.addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    if (!entity) throw new Error('fixture setup failed');
    const historyLength = useAppStore.getState().history.past.length;
    useAppStore.getState().updateEntityProperties(entity.id, { name: entity.name });
    expect(useAppStore.getState().history.past).toHaveLength(historyLength);
  });
});
