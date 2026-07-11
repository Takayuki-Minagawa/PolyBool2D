import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import type { PolygonEntity } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';
import { polygonArea } from '../geometry/area';

function resetStore(): void {
  const project = createEmptyProject();
  useAppStore.setState((state) => ({
    project,
    selectedEntityIds: [],
    activeTool: 'select',
    preview: { type: 'none' },
    clipboard: { entities: [], pasteCount: 0 },
    history: { past: [], future: [] },
    ui: {
      ...state.ui,
      activeLayerId: project.layers[0].id,
      invalidEntityIds: [],
      statusMessage: null,
      errorMessage: null,
    },
  }));
}

function seedSquare(): PolygonEntity {
  const entity = createPolygonEntity({
    outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 }),
    holes: [],
  });
  useAppStore.setState((state) => ({
    project: { ...state.project, entities: [entity] },
  }));
  return entity;
}

function polygon(id: string): PolygonEntity {
  const entity = useAppStore.getState().project.entities.find((item) => item.id === id);
  if (!entity || entity.type !== 'polygon') throw new Error(`Missing polygon ${id}`);
  return entity;
}

describe('layer store actions', () => {
  beforeEach(resetStore);

  it('adds, updates, assigns and removes layers with undo/redo support', () => {
    const entity = seedSquare();
    const store = useAppStore.getState();
    const defaultLayerId = store.project.layers[0].id;

    const added = store.addLayer();
    expect(useAppStore.getState().project.layers).toHaveLength(2);
    expect(useAppStore.getState().ui.activeLayerId).toBe(added.id);
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.layers).toHaveLength(1);
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.layers.map((layer) => layer.id)).toContain(added.id);

    useAppStore.getState().updateLayer(added.id, { name: '  Structure  ', color: '#112233' });
    expect(useAppStore.getState().project.layers.find((layer) => layer.id === added.id)).toMatchObject({
      name: 'Structure',
      color: '#112233',
    });
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.layers.find((layer) => layer.id === added.id)?.name).toBe('Layer');
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.layers.find((layer) => layer.id === added.id)?.name).toBe('Structure');

    useAppStore.getState().selectMany([entity.id]);
    useAppStore.getState().assignSelectedToLayer(added.id);
    expect(polygon(entity.id).layerId).toBe(added.id);
    useAppStore.getState().undo();
    expect(polygon(entity.id).layerId).toBe(defaultLayerId);
    useAppStore.getState().redo();
    expect(polygon(entity.id).layerId).toBe(added.id);

    useAppStore.getState().removeLayer(added.id);
    expect(useAppStore.getState().project.layers.map((layer) => layer.id)).not.toContain(added.id);
    expect(polygon(entity.id).layerId).toBe(defaultLayerId);
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.layers.map((layer) => layer.id)).toContain(added.id);
    expect(polygon(entity.id).layerId).toBe(added.id);
    useAppStore.getState().redo();
    expect(polygon(entity.id).layerId).toBe(defaultLayerId);
  });

  it('deselects entities hidden or locked at entity/layer level and restores properties through history', () => {
    const entity = seedSquare();
    useAppStore.getState().selectMany([entity.id]);
    useAppStore.getState().updateEntityProperties(entity.id, { visible: false });
    expect(polygon(entity.id).visible).toBe(false);
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    useAppStore.getState().undo();
    expect(polygon(entity.id).visible).toBe(true);
    useAppStore.getState().redo();
    expect(polygon(entity.id).visible).toBe(false);

    useAppStore.getState().undo();
    useAppStore.getState().selectMany([entity.id]);
    useAppStore.getState().updateEntityProperties(entity.id, { locked: true });
    expect(polygon(entity.id).locked).toBe(true);
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    useAppStore.getState().undo();
    expect(polygon(entity.id).locked).toBe(false);

    const layerId = useAppStore.getState().project.layers[0].id;
    useAppStore.getState().selectMany([entity.id]);
    useAppStore.getState().updateLayer(layerId, { visible: false, locked: true });
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    expect(useAppStore.getState().project.layers[0]).toMatchObject({ visible: false, locked: true });
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.layers[0]).toMatchObject({ visible: true, locked: false });
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.layers[0]).toMatchObject({ visible: false, locked: true });
  });

  it('rejects deletion of the final layer without creating history', () => {
    const state = useAppStore.getState();
    state.removeLayer(state.project.layers[0].id);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.layerMinimum');
    expect(useAppStore.getState().project.layers).toHaveLength(1);
    expect(useAppStore.getState().history.past).toEqual([]);
  });
});

describe('clipboard store actions', () => {
  beforeEach(resetStore);

  it('copies without history, pastes with fresh IDs, and undoes/redoes the paste', () => {
    const source = seedSquare();
    useAppStore.getState().selectMany([source.id]);
    useAppStore.getState().copySelected();
    expect(useAppStore.getState().clipboard.entities.map((entity) => entity.id)).toEqual([source.id]);
    expect(useAppStore.getState().history.past).toEqual([]);

    useAppStore.getState().pasteClipboard();
    const pastedId = useAppStore.getState().selectedEntityIds[0];
    expect(pastedId).not.toBe(source.id);
    expect(useAppStore.getState().project.entities).toHaveLength(2);
    expect(polygon(pastedId).geometry.outer[0]).toEqual({ x: 50, y: -50 });
    expect(useAppStore.getState().clipboard.pasteCount).toBe(1);

    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities.map((entity) => entity.id)).toEqual([source.id]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.entities.map((entity) => entity.id)).toContain(pastedId);
  });

  it('cuts unlocked selections as one undoable operation and ignores locked selections', () => {
    const source = seedSquare();
    useAppStore.getState().selectMany([source.id]);
    useAppStore.getState().cutSelected();
    expect(useAppStore.getState().project.entities).toEqual([]);
    expect(useAppStore.getState().clipboard.entities).toHaveLength(1);
    expect(useAppStore.getState().history.past).toHaveLength(1);
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities.map((entity) => entity.id)).toEqual([source.id]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.entities).toEqual([]);

    resetStore();
    const locked = seedSquare();
    useAppStore.setState((state) => ({
      project: {
        ...state.project,
        entities: state.project.entities.map((entity) => ({ ...entity, locked: true })),
      },
      selectedEntityIds: [locked.id],
    }));
    useAppStore.getState().copySelected();
    useAppStore.getState().cutSelected();
    expect(useAppStore.getState().clipboard.entities).toEqual([]);
    expect(useAppStore.getState().project.entities).toHaveLength(1);
    expect(useAppStore.getState().history.past).toEqual([]);
  });
});

describe('hole, primitive and validation store actions', () => {
  beforeEach(resetStore);

  it('adds and removes a valid hole with full undo/redo history', () => {
    const entity = seedSquare();
    const hole = rectangleToRing({ x: 20, y: 20 }, { x: 40, y: 40 });

    expect(useAppStore.getState().addHole(entity.id, hole)).toBe(true);
    expect(polygon(entity.id).geometry.holes).toHaveLength(1);
    expect(polygonArea(polygon(entity.id).geometry)).toBeCloseTo(9600);
    useAppStore.getState().undo();
    expect(polygon(entity.id).geometry.holes).toEqual([]);
    useAppStore.getState().redo();
    expect(polygon(entity.id).geometry.holes).toHaveLength(1);

    useAppStore.getState().removeHole(entity.id, 0);
    expect(polygon(entity.id).geometry.holes).toEqual([]);
    useAppStore.getState().undo();
    expect(polygon(entity.id).geometry.holes).toHaveLength(1);
    useAppStore.getState().redo();
    expect(polygon(entity.id).geometry.holes).toEqual([]);
  });

  it('rejects invalid holes without changing geometry or history and reports validation error', () => {
    const entity = seedSquare();
    const outside = rectangleToRing({ x: 120, y: 120 }, { x: 140, y: 140 });
    expect(useAppStore.getState().addHole(entity.id, outside)).toBe(false);
    expect(polygon(entity.id).geometry.holes).toEqual([]);
    expect(useAppStore.getState().history.past).toEqual([]);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.validation.hole-outside-outer');
  });

  it('adds ellipses and linear entities as undoable active-layer entities', () => {
    const ellipse = useAppStore.getState().addEllipse({ x: 10, y: 20 }, 8, 4);
    expect(ellipse?.metadata?.sourceShape).toBe('ellipse');
    expect(ellipse?.geometry.outer).toHaveLength(64);
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities).toEqual([]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.entities.map((entity) => entity.id)).toContain(ellipse!.id);

    resetStore();
    const layer = useAppStore.getState().addLayer();
    useAppStore.setState({ history: { past: [], future: [] } });
    const line = useAppStore.getState().addLinearEntity(
      [{ x: 0, y: 0 }, { x: 10, y: 5 }],
      'polyline',
    );
    expect(line).toMatchObject({ type: 'guide-line', kind: 'polyline', layerId: layer.id });
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities).toEqual([]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.entities.map((entity) => entity.id)).toContain(line!.id);
  });

  it('rejects degenerate linear entities with an error and no history', () => {
    expect(useAppStore.getState().addLinearEntity([{ x: 1, y: 1 }, { x: 1, y: 1 }], 'guide')).toBeNull();
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidLine');
    expect(useAppStore.getState().project.entities).toEqual([]);
    expect(useAppStore.getState().history.past).toEqual([]);
  });

  it('marks invalid geometry, supports undo/redo of the model, and can revalidate after redo', () => {
    const entity = seedSquare();
    const bowTie = {
      outer: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 100, y: 0 },
      ],
      holes: [],
    };

    useAppStore.getState().updateEntityGeometry(entity.id, bowTie);
    expect(useAppStore.getState().validateEntity(entity.id)).toBe(false);
    expect(useAppStore.getState().ui.invalidEntityIds).toContain(entity.id);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.validation.self-intersection');

    useAppStore.getState().undo();
    expect(useAppStore.getState().ui.invalidEntityIds).toEqual([]);
    expect(useAppStore.getState().validateEntity(entity.id)).toBe(true);
    useAppStore.getState().redo();
    expect(polygon(entity.id).geometry.outer).toEqual(bowTie.outer);
    expect(useAppStore.getState().validateEntity(entity.id)).toBe(false);
    expect(useAppStore.getState().ui.invalidEntityIds).toContain(entity.id);
  });
});
