import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../app/projectFactory';
import { snapWorldPoint } from '../app/snapping';
import type { ViewTransform } from '../app/projectTypes';

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
