import { describe, expect, it } from 'vitest';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';
import {
  calculateMultiPolygonSectionProperties,
  calculateSectionProperties,
} from '../geometry/sectionProperties';
import {
  buildProjectSectionReportHtml,
  buildSectionReportData,
} from '../persistence/sectionReport';

describe('section properties', () => {
  it('calculates rectangle moments, section moduli, and radii of gyration', () => {
    const result = calculateSectionProperties({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 4, y: 2 }),
      holes: [],
    });

    expect(result).not.toBeNull();
    expect(result!.area).toBeCloseTo(8);
    expect(result!.centroid).toEqual({ x: 2, y: 1 });
    expect(result!.ix).toBeCloseTo((4 * 2 ** 3) / 12);
    expect(result!.iy).toBeCloseTo((2 * 4 ** 3) / 12);
    expect(result!.ixy).toBeCloseTo(0);
    expect(result!.sectionModulus.x).toBeCloseTo(8 / 3);
    expect(result!.sectionModulus.y).toBeCloseTo(16 / 3);
    expect(result!.radiusOfGyration.x).toBeCloseTo(Math.sqrt(1 / 3));
    expect(result!.radiusOfGyration.y).toBeCloseTo(Math.sqrt(4 / 3));
  });

  it('subtracts a centered hole independently of ring winding', () => {
    const hole = rectangleToRing({ x: 2, y: 2 }, { x: 8, y: 8 });
    const result = calculateSectionProperties({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [hole],
    });
    const reversed = calculateSectionProperties({
      outer: [...rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 })].reverse(),
      holes: [[...hole].reverse()],
    });

    expect(result!.area).toBeCloseTo(64);
    expect(result!.centroid).toEqual({ x: 5, y: 5 });
    expect(result!.ix).toBeCloseTo(10 * 10 ** 3 / 12 - 6 * 6 ** 3 / 12);
    expect(result!.iy).toBeCloseTo(result!.ix);
    expect(reversed).toMatchObject({
      area: result!.area,
      centroid: result!.centroid,
      ix: result!.ix,
      iy: result!.iy,
    });
  });

  it('is stable when the same section is translated far from the origin', () => {
    const near = calculateSectionProperties({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 4, y: 2 }),
      holes: [],
    })!;
    const offset = 1_000_000_000;
    const far = calculateSectionProperties({
      outer: rectangleToRing(
        { x: offset, y: -offset },
        { x: offset + 4, y: -offset + 2 },
      ),
      holes: [],
    })!;

    expect(far.area).toBeCloseTo(near.area);
    expect(far.ix).toBeCloseTo(near.ix);
    expect(far.iy).toBeCloseTo(near.iy);
    expect(far.centroid.x).toBe(offset + 2);
    expect(far.centroid.y).toBe(-offset + 1);
  });

  it('uses the parallel-axis theorem when combining disjoint polygons', () => {
    const result = calculateMultiPolygonSectionProperties([
      { outer: rectangleToRing({ x: 0, y: 0 }, { x: 2, y: 2 }), holes: [] },
      { outer: rectangleToRing({ x: 4, y: 0 }, { x: 6, y: 2 }), holes: [] },
    ]);

    expect(result!.area).toBeCloseTo(8);
    expect(result!.centroid).toEqual({ x: 3, y: 1 });
    expect(result!.ix).toBeCloseTo(8 / 3);
    expect(result!.iy).toBeCloseTo(104 / 3);
  });
});

describe('section report', () => {
  it('builds serializable data and injection-safe print HTML', () => {
    const project = createEmptyProject();
    project.name = '<Building & Annex>';
    project.entities = [createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 4, y: 2 }),
      holes: [],
    }, { name: '<script>alert(1)</script>' })];

    const data = buildSectionReportData(project, {
      generatedAt: '2026-07-29T00:00:00.000Z',
    });
    const html = buildProjectSectionReportHtml(project, {
      generatedAt: '2026-07-29T00:00:00.000Z',
    });

    expect(data.rows).toHaveLength(1);
    expect(data.total?.area).toBeCloseTo(8);
    expect(html).toContain('@media print');
    expect(html).toContain('&lt;Building &amp; Annex&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('2026-07-29T00:00:00.000Z');
  });
});
