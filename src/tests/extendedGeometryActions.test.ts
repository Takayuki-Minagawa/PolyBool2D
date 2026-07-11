import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { createPolygonEntity } from '../app/projectFactory';
import type { PolygonEntity } from '../app/projectTypes';
import { multiPolygonArea, polygonArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import type { PolygonGeometry } from '../geometry/types';

function polygons(): PolygonEntity[] {
  return useAppStore
    .getState()
    .project.entities.filter((entity): entity is PolygonEntity => entity.type === 'polygon');
}

function seedPolygon(
  geometry: PolygonGeometry,
  options: { name?: string; markInvalid?: boolean } = {},
): PolygonEntity {
  const entity = createPolygonEntity(geometry, { name: options.name ?? 'Subject' });
  useAppStore.setState((state) => ({
    project: { ...state.project, entities: [entity] },
    selectedEntityIds: [entity.id],
    history: { past: [], future: [] },
    ui: {
      ...state.ui,
      errorMessage: null,
      invalidEntityIds: options.markInvalid ? [entity.id] : [],
    },
  }));
  return entity;
}

beforeEach(() => {
  useAppStore.getState().resetProject();
  useAppStore.getState().setErrorMessage(null);
});
describe('extended geometry store actions: offset', () => {
  it('adds an outward offset, selects it, and restores the source on undo', () => {
    const source = seedPolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });

    useAppStore.getState().offsetSelected(1);

    const after = useAppStore.getState();
    const result = polygons().find((polygon) => polygon.id !== source.id);
    expect(result).toBeDefined();
    expect(polygons()).toHaveLength(2);
    expect(polygonArea(result!.geometry)).toBeCloseTo(100 + 40 + Math.PI, 1);
    expect(result!.metadata).toEqual({
      sourceShape: 'offset-result',
      createdByOperation: 'offset',
    });
    expect(after.selectedEntityIds).toEqual([result!.id]);
    expect(after.history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(polygons()).toHaveLength(1);
    expect(polygons()[0].id).toBe(source.id);
    expect(polygonArea(polygons()[0].geometry)).toBeCloseTo(100);
  });

  it('rejects zero/non-finite offsets without project history', () => {
    const source = seedPolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    const before = structuredClone(source.geometry);

    useAppStore.getState().offsetSelected(0);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidOffset');
    expect(useAppStore.getState().history.past).toHaveLength(0);
    expect(polygons()).toHaveLength(1);
    expect(polygons()[0].geometry).toEqual(before);

    useAppStore.getState().setErrorMessage(null);
    useAppStore.getState().offsetSelected(Number.NaN);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidOffset');
    expect(useAppStore.getState().history.past).toHaveLength(0);
  });
});

describe('extended geometry store actions: repair', () => {
  it('replaces a bow-tie with valid pieces, clears its invalid flag, and is undoable', () => {
    const source = seedPolygon(
      {
        outer: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
        holes: [],
      },
      { markInvalid: true },
    );

    useAppStore.getState().repairSelected();

    const repaired = polygons();
    expect(repaired).toHaveLength(2);
    expect(repaired.some((polygon) => polygon.id === source.id)).toBe(false);
    expect(multiPolygonArea(repaired.map((polygon) => polygon.geometry))).toBeCloseTo(50, 8);
    expect(
      repaired.every(
        (polygon) => polygon.metadata?.createdByOperation === 'repair',
      ),
    ).toBe(true);
    expect(useAppStore.getState().ui.invalidEntityIds).toEqual([]);
    expect(useAppStore.getState().history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(polygons()).toHaveLength(1);
    expect(polygons()[0].id).toBe(source.id);
    expect(polygons()[0].geometry.outer).toHaveLength(4);
  });

  it('reports failed repair without replacing or recording history', () => {
    const source = seedPolygon({
      outer: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      holes: [],
    });
    const before = structuredClone(source.geometry);

    useAppStore.getState().repairSelected();

    expect(useAppStore.getState().ui.errorMessage).toBe('errors.repairFailed');
    expect(useAppStore.getState().history.past).toHaveLength(0);
    expect(polygons()).toHaveLength(1);
    expect(polygons()[0].geometry).toEqual(before);
  });
});

describe('extended geometry store actions: chamfer and fillet', () => {
  it('chamfers every corner in place with area reduction and undo', () => {
    const source = seedPolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });

    useAppStore.getState().chamferSelected(2);

    const changed = polygons()[0];
    expect(changed.id).toBe(source.id);
    expect(changed.geometry.outer).toHaveLength(8);
    expect(polygonArea(changed.geometry)).toBeCloseTo(92, 8);
    expect(changed.metadata?.createdByOperation).toBe('chamfer');
    expect(useAppStore.getState().history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(polygons()[0].geometry.outer).toHaveLength(4);
    expect(polygonArea(polygons()[0].geometry)).toBeCloseTo(100);
  });

  it('fillets every corner in place with arc vertices and undo', () => {
    const source = seedPolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });

    useAppStore.getState().filletSelected(2, 32);

    const changed = polygons()[0];
    expect(changed.id).toBe(source.id);
    expect(changed.geometry.outer.length).toBeGreaterThan(8);
    expect(polygonArea(changed.geometry)).toBeCloseTo(
      100 - 4 * (4 - Math.PI),
      1,
    );
    expect(changed.metadata?.createdByOperation).toBe('fillet');
    expect(useAppStore.getState().history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(polygons()[0].geometry.outer).toHaveLength(4);
    expect(polygonArea(polygons()[0].geometry)).toBeCloseTo(100);
  });

  it('rejects invalid corner parameters without changing geometry', () => {
    const source = seedPolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    const before = structuredClone(source.geometry);

    useAppStore.getState().chamferSelected(0);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidCorner');
    expect(polygons()[0].geometry).toEqual(before);
    expect(useAppStore.getState().history.past).toHaveLength(0);

    useAppStore.getState().setErrorMessage(null);
    useAppStore.getState().filletSelected(Number.NaN);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidCorner');
    expect(polygons()[0].geometry).toEqual(before);
    expect(useAppStore.getState().history.past).toHaveLength(0);
  });
});

describe('extended geometry store actions: minimum bounding rectangle', () => {
  it('adds the minimum rectangle, selects it, and removes it on undo', () => {
    const source = seedPolygon({
      outer: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 0, y: 4 },
      ],
      holes: [],
    });

    useAppStore.getState().minimumBoundingRectangleSelected();

    const after = useAppStore.getState();
    const rectangle = polygons().find((polygon) => polygon.id !== source.id);
    expect(rectangle).toBeDefined();
    expect(polygons()).toHaveLength(2);
    expect(rectangle!.geometry.outer).toHaveLength(4);
    expect(polygonArea(rectangle!.geometry)).toBeCloseTo(24, 8);
    expect(rectangle!.metadata).toEqual({
      sourceShape: 'bounding-rectangle',
      createdByOperation: 'minimum-bounds',
    });
    expect(after.selectedEntityIds).toEqual([rectangle!.id]);
    expect(after.history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(polygons()).toHaveLength(1);
    expect(polygons()[0].id).toBe(source.id);
  });

  it('reports an invalid empty selection without history', () => {
    useAppStore.getState().minimumBoundingRectangleSelected();

    expect(useAppStore.getState().ui.errorMessage).toBe(
      'errors.boundingRectangleFailed',
    );
    expect(useAppStore.getState().history.past).toHaveLength(0);
    expect(polygons()).toHaveLength(0);
  });
});
