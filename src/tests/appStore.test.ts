import { describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';
import { polygonArea } from '../geometry/area';
import type { PolygonEntity } from '../app/projectTypes';

function seedRectangles(): [PolygonEntity, PolygonEntity] {
  useAppStore.getState().resetProject();
  const first = createPolygonEntity({
    outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
    holes: [],
  });
  const second = createPolygonEntity({
    outer: rectangleToRing({ x: 5, y: 5 }, { x: 15, y: 15 }),
    holes: [],
  });
  useAppStore.setState((s) => ({
    project: { ...s.project, entities: [first, second] },
  }));
  return [first, second];
}

function polygons(): PolygonEntity[] {
  return useAppStore
    .getState()
    .project.entities.filter((e): e is PolygonEntity => e.type === 'polygon');
}

describe('appStore selection commands', () => {
  it('selects all polygon entities', () => {
    useAppStore.getState().resetProject();
    const first = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    const second = createPolygonEntity({
      outer: rectangleToRing({ x: 20, y: 20 }, { x: 30, y: 30 }),
      holes: [],
    });

    useAppStore.setState((s) => ({
      project: { ...s.project, entities: [first, second] },
    }));

    useAppStore.getState().selectAll();

    expect(useAppStore.getState().selectedEntityIds).toEqual([
      first.id,
      second.id,
    ]);
  });
});

describe('appStore boolean operations', () => {
  it('intersects the selected polygons', () => {
    seedRectangles();
    useAppStore.getState().selectAll();
    useAppStore.getState().intersectSelected();

    const polys = polygons();
    expect(polys).toHaveLength(1);
    expect(polygonArea(polys[0].geometry)).toBeCloseTo(25);
    expect(polys[0].metadata?.createdByOperation).toBe('intersection');
  });

  it('xors the selected polygons', () => {
    seedRectangles();
    useAppStore.getState().selectAll();
    useAppStore.getState().xorSelected();

    const total = polygons().reduce((a, p) => a + polygonArea(p.geometry), 0);
    expect(total).toBeCloseTo(100 + 100 - 2 * 25);
  });

  it('reports an error when fewer than two polygons are selected', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().intersectSelected();

    expect(useAppStore.getState().ui.errorMessage).toBe('errors.booleanNeedsTwo');
    expect(polygons()).toHaveLength(2);
  });
});

describe('appStore duplicateSelected', () => {
  it('duplicates the selection with an offset and selects the copies', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().duplicateSelected();

    const state = useAppStore.getState();
    const polys = polygons();
    expect(polys).toHaveLength(3);
    const copy = polys[2];
    expect(state.selectedEntityIds).toEqual([copy.id]);
    expect(copy.id).not.toBe(first.id);
    expect(polygonArea(copy.geometry)).toBeCloseTo(100);
    const offset = state.project.settings.gridSize * 0.5;
    expect(copy.geometry.outer[0].x).toBeCloseTo(first.geometry.outer[0].x + offset);
    expect(copy.geometry.outer[0].y).toBeCloseTo(first.geometry.outer[0].y - offset);
  });

  it('is undoable', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().duplicateSelected();
    useAppStore.getState().undo();

    expect(polygons()).toHaveLength(2);
  });
});

describe('appStore translateEntities', () => {
  it('translates the targeted polygons', () => {
    const [first, second] = seedRectangles();
    const before = second.geometry.outer[0];
    useAppStore.getState().translateEntities([first.id], 7, -3);

    const polys = polygons();
    expect(polys[0].geometry.outer[0]).toEqual({ x: 7, y: -3 });
    expect(polys[1].geometry.outer[0]).toEqual(before);
  });

  it('records history so the move can be undone', () => {
    const [first] = seedRectangles();
    useAppStore.getState().translateEntities([first.id], 7, -3);
    useAppStore.getState().undo();

    expect(polygons()[0].geometry.outer[0]).toEqual({ x: 0, y: 0 });
  });
});
