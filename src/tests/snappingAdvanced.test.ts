import { describe, expect, it } from 'vitest';
import { createEmptyProject, createLinearEntity, createPolygonEntity } from '../app/projectFactory';
import type { ViewTransform } from '../app/projectTypes';
import { snapWorldPoint } from '../app/snapping';
import { rectangleToRing } from '../geometry/circle';

const view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

function disableGrid(project: ReturnType<typeof createEmptyProject>): void {
  project.settings.snapToGrid = false;
  project.settings.snapTolerancePx = 4;
}

describe('advanced project snapping', () => {
  it('excludes entities whose layer is hidden', () => {
    const project = createEmptyProject();
    disableGrid(project);
    project.settings.snapToVertex = true;
    project.settings.snapToEdge = false;
    project.layers.push({
      id: 'hidden-layer',
      name: 'Hidden',
      visible: false,
      locked: false,
      color: '#000000',
    });
    project.entities.push(
      createPolygonEntity(
        {
          outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
          holes: [],
        },
        { layerId: 'hidden-layer' },
      ),
    );
    const input = { x: 0.2, y: 0.1 };

    expect(snapWorldPoint(input, project, view)).toEqual(input);
  });

  it('snaps to a guide as an infinite line beyond its endpoints', () => {
    const project = createEmptyProject();
    disableGrid(project);
    project.settings.snapToVertex = false;
    project.settings.snapToEdge = true;
    project.entities.push(
      createLinearEntity(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        'guide',
      ),
    );

    expect(snapWorldPoint({ x: 50, y: 0.25 }, project, view)).toEqual({
      x: 50,
      y: 0,
    });
  });

  it('composes guide snapping with an angular constraint from its anchor', () => {
    const project = createEmptyProject();
    disableGrid(project);
    project.settings.snapToVertex = false;
    project.settings.snapToEdge = true;
    project.entities.push(
      createLinearEntity(
        [
          { x: 10, y: 0 },
          { x: 10, y: 1 },
        ],
        'guide',
      ),
    );

    const result = snapWorldPoint(
      { x: 10.2, y: 4 },
      project,
      view,
      { anchor: { x: 0, y: 0 }, angleIncrementDeg: 45 },
    );

    // The guide first projects to (10, 4), then the 21.8-degree direction is
    // quantised to 0 degrees while preserving the anchor-to-point distance.
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.x).toBeCloseTo(Math.hypot(10, 4), 10);
  });
});
