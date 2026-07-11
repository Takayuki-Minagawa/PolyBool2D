import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../app/projectFactory';
import { constrainPointToAngle, snapWorldPoint } from '../app/snapping';
import { DEFAULT_SETTINGS, type ViewTransform } from '../app/projectTypes';

const view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

describe('snapWorldPoint', () => {
  it('applies enabled project snap modes', () => {
    const project = createEmptyProject();
    project.settings.gridSize = 10;
    project.settings.snapTolerancePx = 100;
    project.settings.snapToGrid = true;
    project.settings.snapToVertex = false;
    project.settings.snapToEdge = false;

    expect(snapWorldPoint({ x: 9, y: 11 }, project, view)).toEqual({ x: 10, y: 10 });
  });
});

describe('angular drawing constraints', () => {
  it('is disabled by default for backwards-compatible free drawing', () => {
    expect(DEFAULT_SETTINGS.angleSnapEnabled).toBe(false);
  });
  it('quantises a point to the configured angular increment', () => {
    const constrained = constrainPointToAngle(
      { x: 10, y: 3 },
      { anchor: { x: 0, y: 0 }, angleIncrementDeg: 45 },
    );
    expect(constrained.y).toBeCloseTo(0);
    expect(Math.hypot(constrained.x, constrained.y)).toBeCloseTo(Math.hypot(10, 3));
  });

  it('uses horizontal/vertical constraint while ortho is active', () => {
    const constrained = constrainPointToAngle(
      { x: 2, y: 9 },
      { anchor: { x: 1, y: 1 }, angleIncrementDeg: 15, ortho: true },
    );
    expect(constrained.x).toBeCloseTo(1);
    expect(constrained.y).toBeGreaterThan(1);
  });
});
