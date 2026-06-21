import { describe, expect, it } from 'vitest';
import {
  rotatePoint,
  rotatePolygon,
  scalePolygon,
  mirrorPolygon,
} from '../geometry/transform2d';
import { polygonArea } from '../geometry/area';
import type { PolygonGeometry } from '../geometry/types';

const square: PolygonGeometry = {
  outer: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  holes: [],
};

describe('transform2d', () => {
  it('rotates a point 90deg CCW around origin', () => {
    const r = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('rotation preserves area', () => {
    const rotated = rotatePolygon(square, { x: 5, y: 5 }, Math.PI / 4);
    expect(polygonArea(rotated)).toBeCloseTo(polygonArea(square));
  });

  it('scaling by (2,2) quadruples area', () => {
    const scaled = scalePolygon(square, { x: 0, y: 0 }, 2, 2);
    expect(polygonArea(scaled)).toBeCloseTo(polygonArea(square) * 4);
  });

  it('mirror across vertical line flips x but keeps area magnitude', () => {
    const mirrored = mirrorPolygon(square, { x: 5, y: 5 }, 'vertical');
    expect(Math.abs(polygonArea(mirrored))).toBeCloseTo(polygonArea(square));
    // x=0 maps to x=10 across pivot 5.
    expect(mirrored.outer[0].x).toBeCloseTo(10);
    expect(mirrored.outer[0].y).toBeCloseTo(0);
  });

  it('mirror across horizontal line flips y', () => {
    const mirrored = mirrorPolygon(square, { x: 5, y: 5 }, 'horizontal');
    expect(mirrored.outer[0].x).toBeCloseTo(0);
    expect(mirrored.outer[0].y).toBeCloseTo(10);
  });
});
