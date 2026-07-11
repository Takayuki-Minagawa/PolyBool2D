import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';
import {
  createLinearEntity,
  createPolygonEntity,
} from '../app/projectFactory';
import type { Entity } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';

function seed(entities: Entity[], selectedEntityIds: string[]): void {
  useAppStore.setState((state) => ({
    project: { ...state.project, entities },
    selectedEntityIds,
    history: { past: [], future: [] },
    ui: { ...state.ui, errorMessage: null, invalidEntityIds: [] },
  }));
}

function rectangle(minX: number, maxX: number) {
  return createPolygonEntity({
    outer: rectangleToRing({ x: minX, y: 0 }, { x: maxX, y: 10 }),
    holes: [],
  });
}

beforeEach(() => {
  useAppStore.getState().resetProject();
});

describe('mixed polygon and linear selections', () => {
  it('preserves a selected linear entity during a boolean operation', () => {
    const first = rectangle(0, 10);
    const second = rectangle(5, 15);
    const line = createLinearEntity(
      [
        { x: 0, y: 20 },
        { x: 10, y: 20 },
      ],
      'polyline',
    );
    seed([first, second, line], [first.id, second.id, line.id]);

    useAppStore.getState().unionSelected();

    expect(
      useAppStore.getState().project.entities.some((entity) => entity.id === line.id),
    ).toBe(true);
    expect(useAppStore.getState().project.entities).toHaveLength(2);
  });

  it('preserves a non-polygon cutter id during difference', () => {
    const subject = rectangle(0, 10);
    const cutter = rectangle(5, 15);
    const line = createLinearEntity(
      [
        { x: 0, y: 20 },
        { x: 10, y: 20 },
      ],
      'guide',
    );
    seed([subject, cutter, line], [subject.id, cutter.id, line.id]);

    useAppStore
      .getState()
      .differenceSelected(subject.id, [cutter.id, line.id]);

    expect(
      useAppStore.getState().project.entities.some((entity) => entity.id === line.id),
    ).toBe(true);
    expect(useAppStore.getState().project.entities).toHaveLength(2);
  });

  it('preserves a selected linear entity while replacing polygons with a hull', () => {
    const first = rectangle(0, 10);
    const second = rectangle(20, 30);
    const line = createLinearEntity(
      [
        { x: 0, y: 20 },
        { x: 10, y: 20 },
      ],
      'arc',
    );
    seed([first, second, line], [first.id, second.id, line.id]);

    useAppStore.getState().convexHullSelected();

    expect(
      useAppStore.getState().project.entities.some((entity) => entity.id === line.id),
    ).toBe(true);
    expect(useAppStore.getState().project.entities).toHaveLength(2);
  });
});

describe('partial repair safety', () => {
  it('keeps a source whose repair failed while replacing successful sources', () => {
    const repairable = createPolygonEntity({
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      holes: [],
    });
    const unrepairable = createPolygonEntity({
      outer: [
        { x: 20, y: 0 },
        { x: 21, y: 0 },
      ],
      holes: [],
    });
    seed(
      [repairable, unrepairable],
      [repairable.id, unrepairable.id],
    );
    useAppStore.setState((state) => ({
      ui: {
        ...state.ui,
        invalidEntityIds: [repairable.id, unrepairable.id],
      },
    }));

    useAppStore.getState().repairSelected();

    const after = useAppStore.getState();
    expect(after.project.entities.some((entity) => entity.id === repairable.id)).toBe(
      false,
    );
    expect(after.project.entities.some((entity) => entity.id === unrepairable.id)).toBe(
      true,
    );
    expect(
      after.project.entities.filter(
        (entity) =>
          entity.type === 'polygon' &&
          entity.metadata?.createdByOperation === 'repair',
      ),
    ).toHaveLength(2);
    expect(after.ui.invalidEntityIds).toEqual([unrepairable.id]);
    expect(after.ui.errorMessage).toBe('errors.repairFailed');
    expect(after.history.past).toHaveLength(1);

    useAppStore.getState().undo();
    expect(
      useAppStore
        .getState()
        .project.entities.map((entity) => entity.id)
        .sort(),
    ).toEqual([repairable.id, unrepairable.id].sort());
  });
});

describe('invalid primitive input and drawing history', () => {
  it('rejects non-finite circles and polygons without entities or history', () => {
    expect(
      useAppStore.getState().addCircle({ x: 0, y: 0 }, Number.NaN),
    ).toBeNull();
    expect(
      useAppStore.getState().addCircle({ x: Infinity, y: 0 }, 10),
    ).toBeNull();
    expect(
      useAppStore.getState().addPolygonFromOuter([
        { x: 0, y: 0 },
        { x: Infinity, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBeNull();

    expect(useAppStore.getState().project.entities).toHaveLength(0);
    expect(useAppStore.getState().history.past).toHaveLength(0);
  });

  it('does not push history before confirming a drawable layer', () => {
    useAppStore.setState((state) => ({
      project: {
        ...state.project,
        layers: state.project.layers.map((layer) => ({
          ...layer,
          locked: true,
        })),
      },
      history: { past: [], future: [] },
    }));

    const result = useAppStore
      .getState()
      .addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });

    expect(result).toBeNull();
    expect(useAppStore.getState().ui.errorMessage).toBe('errors.noDrawableLayer');
    expect(useAppStore.getState().project.entities).toHaveLength(0);
    expect(useAppStore.getState().history.past).toHaveLength(0);
  });
});
