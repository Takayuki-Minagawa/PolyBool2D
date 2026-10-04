import { describe, expect, it } from 'vitest';
import {
  createAngularDimensionEntity,
  createLinearDimensionEntity,
  createLinearEntity,
  createPolygonEntity,
} from '../app/projectFactory';
import { entityIntersectsSelection } from '../app/selection';
import { rectangleToRing } from '../geometry/circle';

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
const rectangle = (minX: number, minY: number, maxX: number, maxY: number) => (
  createPolygonEntity({
    outer: rectangleToRing({ x: minX, y: minY }, { x: maxX, y: maxY }),
    holes: [],
  })
);

describe('CAD box selection', () => {
  it('distinguishes containment from crossing and includes boundary contact', () => {
    const partial = rectangle(5, 5, 15, 15);
    expect(entityIntersectsSelection(partial, bounds, 'window')).toBe(false);
    expect(entityIntersectsSelection(partial, bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(rectangle(0, 0, 10, 10), bounds, 'window')).toBe(true);
    expect(entityIntersectsSelection(rectangle(10, 10, 20, 20), bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(rectangle(11, 11, 20, 20), bounds, 'crossing')).toBe(false);
  });

  it('finds polygons enclosing the box but excludes holes and empty concave regions', () => {
    const polygon = rectangle(-20, -20, 20, 20);
    expect(entityIntersectsSelection(polygon, bounds, 'crossing')).toBe(true);
    polygon.geometry.holes = [rectangleToRing({ x: -1, y: -1 }, { x: 11, y: 11 })];
    expect(entityIntersectsSelection(polygon, bounds, 'crossing')).toBe(false);
    expect(entityIntersectsSelection(polygon, { ...bounds, maxX: 12 }, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(polygon, { ...bounds, maxX: 11 }, 'crossing')).toBe(true);

    const concave = createPolygonEntity({
      outer: [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: -1 },
        { x: -1, y: -1 }, { x: -1, y: 15 }, { x: -5, y: 15 }],
      holes: [],
    });
    expect(entityIntersectsSelection(concave, bounds, 'crossing')).toBe(false);
  });

  it('tests polygon edges when every polygon and box vertex is outside the other', () => {
    const diamond = createPolygonEntity({
      outer: [{ x: -3, y: 5 }, { x: 5, y: -3 }, { x: 13, y: 5 }, { x: 5, y: 13 }],
      holes: [],
    });
    expect(entityIntersectsSelection(diamond, bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(diamond, bounds, 'window')).toBe(false);
  });

  it('tests actual open segments, not their bounds or an implicit closing edge', () => {
    const miss = createLinearEntity([{ x: -5, y: 8 }, { x: 8, y: 21 }], 'polyline');
    const cross = createLinearEntity([{ x: -5, y: 5 }, { x: 15, y: 5 }], 'polyline');
    expect(entityIntersectsSelection(miss, bounds, 'crossing')).toBe(false);
    expect(entityIntersectsSelection(cross, bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(cross, bounds, 'window')).toBe(false);
    const open = createLinearEntity([
      { x: -2, y: 5 }, { x: -2, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 5 },
    ], 'arc');
    expect(entityIntersectsSelection(open, bounds, 'crossing')).toBe(false);
    const inside = createLinearEntity([{ x: 0, y: 1 }, { x: 9, y: 9 }], 'arc');
    expect(entityIntersectsSelection(inside, bounds, 'window')).toBe(true);
  });

  it('selects infinite guides beyond their defining endpoints only in crossing mode', () => {
    const guide = createLinearEntity([{ x: 100, y: 5 }, { x: 101, y: 5 }], 'guide');
    expect(entityIntersectsSelection(guide, bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(guide, bounds, 'window')).toBe(false);
    const vertical = createLinearEntity([{ x: 10, y: 30 }, { x: 10, y: 40 }], 'guide');
    expect(entityIntersectsSelection(vertical, bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(createLinearEntity([
      { x: 11, y: 30 }, { x: 11, y: 40 },
    ], 'guide'), bounds, 'crossing')).toBe(false);
    expect(entityIntersectsSelection(createLinearEntity([
      { x: 1, y: 1 }, { x: 1, y: 1 },
    ], 'guide'), bounds, 'crossing')).toBe(false);
  });

  it('uses the rendered offset dimension line and excludes the unrendered measured edge', () => {
    const dimension = createLinearDimensionEntity({ x: 0, y: 0 }, { x: 10, y: 0 }, 100)!;
    expect(entityIntersectsSelection(dimension, { minX: 4, minY: 99, maxX: 6, maxY: 101 }, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(dimension, { minX: 4, minY: -1, maxX: 6, maxY: 1 }, 'crossing')).toBe(false);
    expect(entityIntersectsSelection(dimension, { minX: -1, minY: 1, maxX: 11, maxY: 101 }, 'window')).toBe(true);
    expect(entityIntersectsSelection(dimension, { minX: -1, minY: -1, maxX: 11, maxY: 50 }, 'window')).toBe(false);
  });

  it('selects rotated dimension segments without treating the anchor as an endpoint', () => {
    const dimension = createLinearDimensionEntity({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)!;
    // Offset endpoints are (-8, 6) and (-5, 10).
    expect(entityIntersectsSelection(dimension, { minX: -8.1, minY: 5.9, maxX: -7.9, maxY: 6.1 }, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(dimension, { minX: -7, minY: 7.5, maxX: -6, maxY: 8.5 }, 'window')).toBe(false);
  });

  it('uses the angular dimension arc and radius instead of remote defining rays', () => {
    const dimension = createAngularDimensionEntity(
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, 10,
    )!;
    expect(entityIntersectsSelection(dimension, { minX: -1, minY: -1, maxX: 11, maxY: 11 }, 'window')).toBe(true);
    expect(entityIntersectsSelection(dimension, { minX: 6.5, minY: 6.5, maxX: 7.5, maxY: 7.5 }, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(dimension, { minX: 4, minY: 4, maxX: 5, maxY: 5 }, 'crossing')).toBe(false);
    expect(entityIntersectsSelection(dimension, { minX: 49, minY: -1, maxX: 51, maxY: 1 }, 'crossing')).toBe(false);
  });

  it('selects annotation insertion points independently of text rotation', () => {
    const annotation = createLinearEntity([{ x: 5, y: 5 }], 'annotation', {
      label: 'Note', rotationDeg: 45,
    });
    expect(entityIntersectsSelection(annotation, bounds, 'window')).toBe(true);
    expect(entityIntersectsSelection(annotation, bounds, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(annotation, { minX: 6, minY: 6, maxX: 20, maxY: 20 }, 'crossing')).toBe(false);
  });

  it('normalizes drag bounds, supports zero-width contact, and rejects non-finite input', () => {
    const polygon = rectangle(2, 2, 8, 8);
    expect(entityIntersectsSelection(polygon, { minX: 10, minY: 10, maxX: 0, maxY: 0 }, 'window')).toBe(true);
    expect(entityIntersectsSelection(polygon, { minX: 3, minY: 3, maxX: 3, maxY: 3 }, 'crossing')).toBe(true);
    expect(entityIntersectsSelection(polygon, { ...bounds, maxX: Infinity }, 'crossing')).toBe(false);
    polygon.geometry.outer[0].x = NaN;
    expect(entityIntersectsSelection(polygon, bounds, 'window')).toBe(false);
    expect(entityIntersectsSelection(createLinearEntity([], 'polyline'), bounds, 'window')).toBe(false);
    expect(entityIntersectsSelection(createLinearEntity([
      { x: 0, y: 0 }, { x: Infinity, y: 2 },
    ], 'polyline'), bounds, 'crossing')).toBe(false);
  });

  it('preserves intersections after large coordinate translations', () => {
    const origin = 1_000_000_000;
    const line = createLinearEntity([
      { x: origin - 5, y: origin + 5 }, { x: origin + 15, y: origin + 5 },
    ], 'polyline');
    expect(entityIntersectsSelection(line, {
      minX: origin, minY: origin, maxX: origin + 10, maxY: origin + 10,
    }, 'crossing')).toBe(true);
  });
});
