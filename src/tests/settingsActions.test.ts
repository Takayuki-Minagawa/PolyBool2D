import { describe, expect, it } from 'vitest';
import { useAppStore } from '../app/appStore';

describe('project settings actions', () => {
  it('updates the coordinate unit and invalidates redo history', () => {
    useAppStore.getState().resetProject();
    useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    useAppStore.getState().undo();
    expect(useAppStore.getState().history.future).toHaveLength(1);

    useAppStore.getState().updateProjectUnit('cm');

    expect(useAppStore.getState().project.unit).toBe('cm');
    expect(useAppStore.getState().history.future).toHaveLength(0);
  });

  it('updates all newly editable snap settings together', () => {
    useAppStore.getState().resetProject();
    useAppStore.getState().updateSettings({
      gridSize: 25,
      circleSegments: 32,
      snapToGrid: false,
      snapToVertex: false,
      snapToEdge: false,
      snapTolerancePx: 6,
      areaPrecision: 2,
      coordinatePrecision: 1,
      areaDisplayUnit: 'cm2',
    });

    expect(useAppStore.getState().project.settings).toMatchObject({
      gridSize: 25,
      circleSegments: 32,
      snapToGrid: false,
      snapToVertex: false,
      snapToEdge: false,
      snapTolerancePx: 6,
      areaPrecision: 2,
      coordinatePrecision: 1,
      areaDisplayUnit: 'cm2',
    });
  });

  it('records settings as their own undo step after geometry creation', () => {
    useAppStore.getState().resetProject();
    const rectangle = useAppStore
      .getState()
      .addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    if (!rectangle) throw new Error('fixture setup failed');

    useAppStore.getState().updateSettings({ gridSize: 25 });
    expect(useAppStore.getState().history.past).toHaveLength(2);

    useAppStore.getState().undo();
    expect(useAppStore.getState().project.settings.gridSize).toBe(100);
    expect(
      useAppStore.getState().project.entities.some((entity) => entity.id === rectangle.id),
    ).toBe(true);

    useAppStore.getState().undo();
    expect(useAppStore.getState().project.entities).toHaveLength(0);
  });

  it('records the project unit as its own undo step', () => {
    useAppStore.getState().resetProject();
    const rectangle = useAppStore
      .getState()
      .addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    if (!rectangle) throw new Error('fixture setup failed');

    useAppStore.getState().updateProjectUnit('cm');
    useAppStore.getState().undo();

    expect(useAppStore.getState().project.unit).toBe('mm');
    expect(
      useAppStore.getState().project.entities.some((entity) => entity.id === rectangle.id),
    ).toBe(true);
  });

  it('does not record no-op setting or unit changes', () => {
    useAppStore.getState().resetProject();
    useAppStore.getState().updateSettings({ gridSize: 100 });
    useAppStore.getState().updateProjectUnit('mm');

    expect(useAppStore.getState().history.past).toHaveLength(0);
  });
});
