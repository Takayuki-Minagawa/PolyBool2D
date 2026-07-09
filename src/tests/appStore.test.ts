import { describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import { createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';
import { polygonArea, signedRingArea } from '../geometry/area';
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

describe('appStore transform actions', () => {
  it('rotates the selection preserving area, undoable', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().rotateSelected(Math.PI / 2);

    const rotated = polygons().find((p) => p.id === first.id)!;
    expect(polygonArea(rotated.geometry)).toBeCloseTo(100);
    // 10x10 square stays axis-aligned after a 90° rotation but shifts position.
    useAppStore.getState().undo();
    expect(polygons().find((p) => p.id === first.id)!.geometry.outer).toEqual(
      first.geometry.outer,
    );
  });

  it('scales the selection about its centre', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().scaleSelected(2, 2);

    const scaled = polygons().find((p) => p.id === first.id)!;
    expect(polygonArea(scaled.geometry)).toBeCloseTo(400);
  });

  it('rejects a zero scale factor', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().scaleSelected(0, 1);
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.invalidScale');
  });

  it('mirrors the selection keeping a valid CCW outer ring', () => {
    const [first] = seedRectangles();
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().mirrorSelected('vertical');

    const mirrored = polygons().find((p) => p.id === first.id)!;
    // Area magnitude is preserved and signed area stays positive (CCW) thanks
    // to normalisation.
    expect(polygonArea(mirrored.geometry)).toBeCloseTo(100);
    expect(signedRingArea(mirrored.geometry.outer)).toBeGreaterThan(0);
  });
});

describe('appStore convex hull & simplify', () => {
  it('replaces the selection with its convex hull', () => {
    const [first, second] = seedRectangles();
    useAppStore.getState().selectMany([first.id, second.id]);
    useAppStore.getState().convexHullSelected();

    const polys = polygons();
    expect(polys).toHaveLength(1);
    // Hull of two overlapping 10x10 squares offset by 5 spans (0,0)-(15,15)
    // minus two clipped corners.
    expect(polys[0].metadata?.createdByOperation).toBe('draw');
    expect(polygonArea(polys[0].geometry)).toBeGreaterThan(100);
  });

  it('removes redundant collinear vertices via simplify', () => {
    useAppStore.getState().resetProject();
    const ent = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [],
    });
    useAppStore.setState((s) => ({ project: { ...s.project, entities: [ent] } }));
    useAppStore.getState().selectMany([ent.id]);
    useAppStore.getState().simplifySelected(0.001);

    const simplified = polygons()[0];
    expect(simplified.geometry.outer.length).toBe(4);
    expect(polygonArea(simplified.geometry)).toBeCloseTo(100);
  });
});

describe('appStore align & distribute', () => {
  it('aligns selected polygons to the group left edge', () => {
    const [first, second] = seedRectangles();
    useAppStore.getState().selectMany([first.id, second.id]);
    useAppStore.getState().alignSelected('left');

    const polys = polygons();
    const minXs = polys.map((p) =>
      Math.min(...p.geometry.outer.map((pt) => pt.x)),
    );
    expect(minXs[0]).toBeCloseTo(minXs[1]);
    expect(Math.min(...minXs)).toBeCloseTo(0);
  });

  it('distributes three polygons evenly along x', () => {
    useAppStore.getState().resetProject();
    const mk = (x: number) =>
      createPolygonEntity({
        outer: rectangleToRing({ x, y: 0 }, { x: x + 2, y: 2 }),
        holes: [],
      });
    const a = mk(0);
    const b = mk(3); // center 4
    const c = mk(20); // center 21
    useAppStore.setState((s) => ({ project: { ...s.project, entities: [a, b, c] } }));
    useAppStore.getState().selectMany([a.id, b.id, c.id]);
    useAppStore.getState().distributeSelected('x');

    const centerOf = (id: string) => {
      const p = polygons().find((e) => e.id === id)!;
      const xs = p.geometry.outer.map((pt) => pt.x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    // First (1) and last (21) fixed; middle should land at 11.
    expect(centerOf(a.id)).toBeCloseTo(1);
    expect(centerOf(c.id)).toBeCloseTo(21);
    expect(centerOf(b.id)).toBeCloseTo(11);
  });
});

describe('appStore updateSettings', () => {
  it('clears the redo future so redo cannot revert the settings change', () => {
    const [first] = seedRectangles();
    // Create an undoable action, then undo to populate history.future.
    useAppStore.getState().selectMany([first.id]);
    useAppStore.getState().translateEntities([first.id], 5, 0);
    useAppStore.getState().undo();
    expect(useAppStore.getState().history.future.length).toBe(1);

    useAppStore.getState().updateSettings({ areaDisplayUnit: 'cm2' });
    expect(useAppStore.getState().history.future).toHaveLength(0);

    // Redo is now a no-op and must not clobber the new setting.
    useAppStore.getState().redo();
    expect(useAppStore.getState().project.settings.areaDisplayUnit).toBe('cm2');
  });

  it('toggles snap through project settings', () => {
    useAppStore.getState().resetProject();
    const before = useAppStore.getState().project.settings.snapEnabled;
    useAppStore.getState().toggleSnap();
    expect(useAppStore.getState().project.settings.snapEnabled).toBe(!before);
  });
});

describe('appStore vertex editing', () => {
  it('inserts a vertex into the outer ring', () => {
    const [first] = seedRectangles();
    useAppStore
      .getState()
      .insertVertex(
        { entityId: first.id, ringType: 'outer', vertexIndex: 0 },
        { x: 5, y: 0 },
      );
    const ent = polygons().find((p) => p.id === first.id)!;
    expect(ent.geometry.outer.length).toBe(5);
  });

  it('deletes a vertex but refuses to drop below 3', () => {
    useAppStore.getState().resetProject();
    const tri = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
      holes: [],
    });
    useAppStore.setState((s) => ({ project: { ...s.project, entities: [tri] } }));
    useAppStore.getState().deleteVertex({
      entityId: tri.id,
      ringType: 'outer',
      vertexIndex: 0,
    });
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.vertexMinimum');
    expect(polygons()[0].geometry.outer.length).toBe(3);
  });
});
