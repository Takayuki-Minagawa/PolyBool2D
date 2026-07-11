import { describe, expect, it } from 'vitest';
import {
  entitiesReassignedFromLayer,
  isEntityEffectivelyLocked,
  isEntityEffectivelyVisible,
  uniqueLayerName,
} from '../app/layers';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';

describe('layer helpers', () => {
  it('combines entity and layer visibility/lock state', () => {
    const project = createEmptyProject();
    const entity = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1, y: 1 }),
      holes: [],
    });
    project.entities = [entity];
    expect(isEntityEffectivelyVisible(project, entity)).toBe(true);
    expect(isEntityEffectivelyLocked(project, entity)).toBe(false);
    project.layers[0].visible = false;
    project.layers[0].locked = true;
    expect(isEntityEffectivelyVisible(project, entity)).toBe(false);
    expect(isEntityEffectivelyLocked(project, entity)).toBe(true);
  });

  it('creates unique layer names and reassigns removed layer entities', () => {
    const project = createEmptyProject();
    expect(uniqueLayerName(project.layers, 'Layer 1')).toBe('Layer 1 2');
    const entity = createPolygonEntity(
      { outer: rectangleToRing({ x: 0, y: 0 }, { x: 1, y: 1 }), holes: [] },
      { layerId: 'removed' },
    );
    expect(entitiesReassignedFromLayer([entity], 'removed', 'fallback')[0].layerId).toBe(
      'fallback',
    );
  });
});
