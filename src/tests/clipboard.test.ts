import { describe, expect, it } from 'vitest';
import { copyEntities, pasteEntities } from '../app/clipboard';
import { createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';

describe('entity clipboard', () => {
  it('clones, remints IDs and progressively offsets pasted polygons', () => {
    const source = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    const copied = copyEntities([source]);
    const first = pasteEntities(copied, 5);
    const second = pasteEntities(first.clipboard, 5);
    const firstPolygon = first.entities[0];
    const secondPolygon = second.entities[0];
    expect(firstPolygon.id).not.toBe(source.id);
    expect(secondPolygon.id).not.toBe(firstPolygon.id);
    if (firstPolygon.type !== 'polygon' || secondPolygon.type !== 'polygon') return;
    expect(firstPolygon.geometry.outer[0]).toEqual({ x: 5, y: -5 });
    expect(secondPolygon.geometry.outer[0]).toEqual({ x: 10, y: -10 });
  });

  it('does not retain references to mutable source geometry', () => {
    const source = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [],
    });
    const copied = copyEntities([source]);
    source.geometry.outer[0].x = 99;
    const pasted = pasteEntities(copied, 0).entities[0];
    if (pasted.type !== 'polygon') return;
    expect(pasted.geometry.outer[0].x).toBe(0);
  });
});
