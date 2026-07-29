import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { polygonArea, signedRingArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import { buildDxf } from '../persistence/dxfExport';
import { importDxfFile, importDxfString } from '../persistence/dxfImport';
import {
  buildGeoJson,
  buildProjectGeoJson,
  importGeoJsonString,
} from '../persistence/geoJson';

function dxfEntityDocument(entityLines: Array<string | number>): string {
  return [
    0, 'SECTION', 2, 'ENTITIES',
    ...entityLines,
    0, 'ENDSEC', 0, 'EOF',
  ].join('\n');
}

function dxfDocument(
  entityLines: Array<string | number>,
  insunits?: number,
): string {
  return [
    ...(insunits === undefined
      ? []
      : [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, insunits, 0, 'ENDSEC']),
    0, 'SECTION', 2, 'ENTITIES',
    ...entityLines,
    0, 'ENDSEC', 0, 'EOF',
  ].join('\n');
}

function dxfBlockDocument(
  blockLines: Array<string | number>,
  entityLines: Array<string | number>,
  insunits?: number,
): string {
  return [
    ...(insunits === undefined
      ? []
      : [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, insunits, 0, 'ENDSEC']),
    0, 'SECTION', 2, 'BLOCKS',
    ...blockLines,
    0, 'ENDSEC',
    0, 'SECTION', 2, 'ENTITIES',
    ...entityLines,
    0, 'ENDSEC', 0, 'EOF',
  ].join('\n');
}

describe('DXF import', () => {
  it('round-trips exported LWPOLYLINE rings, units, and holes', () => {
    const project = createEmptyProject();
    project.entities = [createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 80 }),
      holes: [rectangleToRing({ x: 20, y: 20 }, { x: 40, y: 40 })],
    })];

    const result = importDxfString(buildDxf(project));

    expect(result.unit).toBe('mm');
    expect(result.warnings).toEqual([]);
    expect(result.polygons).toHaveLength(1);
    expect(result.polygons[0].holes).toHaveLength(1);
    expect(polygonArea(result.polygons[0])).toBeCloseTo(7600);
  });

  it('reads LINE, ARC, CIRCLE, and legacy POLYLINE records', () => {
    const dxf = dxfEntityDocument([
      0, 'LINE', 8, 'Edges', 10, 0, 20, 0, 11, 3, 21, 4,
      0, 'ARC', 8, 'Edges', 10, 0, 20, 0, 40, 10, 50, 0, 51, 90,
      0, 'CIRCLE', 8, 'Faces', 10, 20, 20, 20, 40, 5,
      0, 'POLYLINE', 8, 'Faces', 70, 1,
      0, 'VERTEX', 10, 0, 20, 0,
      0, 'VERTEX', 10, 5, 20, 0,
      0, 'VERTEX', 10, 5, 20, 5,
      0, 'VERTEX', 10, 0, 20, 5,
      0, 'SEQEND',
    ]);

    const result = importDxfString(dxf, { curveSegments: 16 });

    expect(result.warnings).toEqual([]);
    expect(result.polylines).toHaveLength(2);
    expect(result.polylines[0]).toMatchObject({
      kind: 'polyline',
      layer: 'Edges',
      source: 'LINE',
    });
    expect(result.polylines[0].points).toEqual([{ x: 0, y: 0 }, { x: 3, y: 4 }]);
    expect(result.polylines[1].kind).toBe('arc');
    expect(result.polylines[1].points).toHaveLength(5);
    expect(result.polygons).toHaveLength(2);
    expect(result.polygons.map(polygonArea).sort((a, b) => a - b)[0]).toBeCloseTo(25);
  });

  it('reports malformed and resource-limited data without throwing', () => {
    const truncated = importDxfString('0\nSECTION\n2');
    expect(truncated.warnings).toContain('truncated-group-pair');
    expect(truncated.warnings).toContain('missing-eof');

    const limited = importDxfString(dxfEntityDocument([
      0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 1,
      0, 'LINE', 10, 2, 20, 2, 11, 3, 21, 3,
    ]), { maxEntities: 1 });
    expect(limited.polylines).toHaveLength(1);
    expect(limited.warnings).toContain('entity-limit-exceeded');
  });

  it('bounds source text and raw group pairs before scanning unsupported data', () => {
    const oversizedText = importDxfString(
      '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF',
      { maxInputCharacters: 16 },
    );
    const unsupportedPairs = Array.from(
      { length: 1_100 },
      (_, index) => [1, `unsupported-${index}`],
    ).flat();
    const pairLimited = importDxfString(dxfEntityDocument([
      0, 'SPLINE',
      ...unsupportedPairs,
      0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 0,
    ]), {
      maxEntities: 1,
      maxVerticesPerEntity: 2,
      maxTotalVertices: 2,
    });

    expect(oversizedText.polygons).toEqual([]);
    expect(oversizedText.polylines).toEqual([]);
    expect(oversizedText.warnings).toEqual(['input-size-limit-exceeded']);
    expect(pairLimited.polygons).toEqual([]);
    expect(pairLimited.polylines).toEqual([]);
    expect(pairLimited.warnings).toEqual(expect.arrayContaining([
      'group-pair-limit-exceeded',
      'unsupported-entity:SPLINE',
      'missing-eof',
    ]));
  });

  it('reports unsupported entities, units, and undefined blocks', () => {
    const result = importDxfString(dxfDocument([
      0, 'INSERT', 2, 'BLOCK_A', 10, 0, 20, 0,
      0, 'SPLINE', 8, 'Curves',
    ], 1));

    expect(result.warnings).toEqual(expect.arrayContaining([
      'unsupported-unit:1',
      'undefined-block:BLOCK_A',
      'unsupported-entity:SPLINE',
    ]));
  });

  it('resolves transformed, nested, and layer-inheriting INSERT records', () => {
    const result = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'Plate', 10, 0, 20, 0,
      0, 'LWPOLYLINE', 8, '0', 70, 1, 90, 4,
      10, 0, 20, 0,
      10, 10, 20, 0,
      10, 10, 20, 10,
      10, 0, 20, 10,
      0, 'ENDBLK',
      0, 'BLOCK', 2, 'NESTED', 10, 0, 20, 0,
      0, 'INSERT', 8, '0', 2, 'PLATE', 10, 5, 20, 0,
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 8, 'Inserted', 2, 'NESTED',
      10, 100, 20, 50, 41, 2, 42, 2, 50, 90,
    ]));

    expect(result.warnings).toEqual([]);
    expect(result.polygons).toHaveLength(1);
    expect(polygonArea(result.polygons[0])).toBeCloseTo(400);
    expect(result.polygons[0].outer).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 100, y: 60 }),
      expect.objectContaining({ x: 100, y: 80 }),
      expect.objectContaining({ x: 80, y: 80 }),
      expect.objectContaining({ x: 80, y: 60 }),
    ]));
  });

  it('bounds block recursion and supports INSERT arrays', () => {
    const cyclic = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'CYCLE_A', 10, 0, 20, 0,
      0, 'INSERT', 2, 'CYCLE_B', 10, 0, 20, 0,
      0, 'ENDBLK',
      0, 'BLOCK', 2, 'CYCLE_B', 10, 0, 20, 0,
      0, 'INSERT', 2, 'CYCLE_A', 10, 0, 20, 0,
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 2, 'CYCLE_A', 10, 0, 20, 0,
    ]));
    const array = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'EDGE', 10, 0, 20, 0,
      0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 8, 'Array', 2, 'EDGE', 10, 10, 20, 20,
      41, 2, 42, 2, 70, 2, 71, 2, 44, 5, 45, 7,
    ]));

    expect(cyclic.polygons).toEqual([]);
    expect(cyclic.polylines).toEqual([]);
    expect(cyclic.warnings).toContain('cyclic-block:CYCLE_A');
    expect(array.warnings).toEqual([]);
    expect(array.polylines.map((line) => line.points[0])).toEqual([
      { x: 10, y: 20 },
      { x: 15, y: 20 },
      { x: 10, y: 27 },
      { x: 15, y: 27 },
    ]);
    expect(array.polylines.map((line) => line.points[1].x)).toEqual([
      12, 17, 12, 17,
    ]);
    expect(array.polylines.every((line) => line.layer === 'Array')).toBe(true);
  });

  it('discards zero-scale INSERTs without charging their output vertices', () => {
    const result = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'EDGE', 10, 0, 20, 0,
      0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 2, 'EDGE', 10, 10, 20, 20, 41, 0, 42, 1,
      0, 'LINE', 10, 5, 20, 5, 11, 6, 21, 5,
    ]), { maxTotalVertices: 2 });

    expect(result.polygons).toEqual([]);
    expect(result.polylines).toHaveLength(1);
    expect(result.polylines[0].points).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    expect(result.warnings).toEqual(['invalid-insert']);
  });

  it('validates every transformed primitive before charging output vertices', () => {
    const result = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'OVERFLOW', 10, 0, 20, 0,
      0, 'LINE', 10, 2, 20, 0, 11, 3, 21, 0,
      0, 'ARC', 10, 2, 20, 0, 40, 1, 50, 0, 51, 90,
      0, 'CIRCLE', 10, 2, 20, 0, 40, 1,
      0, 'LWPOLYLINE', 70, 0, 90, 2,
      10, 2, 20, 0,
      10, 3, 20, 0,
      0, 'LWPOLYLINE', 70, 1, 90, 3,
      10, 2, 20, 0,
      10, 3, 20, 0,
      10, 2, 20, 1,
      0, 'POLYLINE', 70, 0,
      0, 'VERTEX', 10, 2, 20, 0,
      0, 'VERTEX', 10, 3, 20, 0,
      0, 'SEQEND',
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 2, 'OVERFLOW', 10, 0, 20, 0, 41, 1e308, 42, 1e308,
      0, 'LINE', 10, 5, 20, 5, 11, 6, 21, 5,
    ]), {
      curveSegments: 8,
      maxTotalVertices: 2,
    });

    expect(result.polygons).toEqual([]);
    expect(result.polylines).toHaveLength(1);
    expect(result.polylines[0].points).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    expect(result.warnings).toEqual([
      'invalid-line',
      'invalid-arc',
      'invalid-circle',
      'invalid-open-polyline',
      'invalid-closed-polyline',
    ]);
  });

  it('caps nested empty INSERT expansion independently of leaf entities', () => {
    const result = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'EMPTY', 10, 0, 20, 0,
      0, 'ENDBLK',
      0, 'BLOCK', 2, 'INNER', 10, 0, 20, 0,
      0, 'INSERT', 2, 'EMPTY', 10, 0, 20, 0, 70, 1000, 44, 1,
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 2, 'INNER', 10, 0, 20, 0, 70, 1000, 44, 1,
    ]), { maxEntities: 3 });

    expect(result.polygons).toEqual([]);
    expect(result.polylines).toEqual([]);
    expect(result.warnings).toContain('entity-limit-exceeded');
  });

  it('shares the output vertex budget across MINSERT instances', () => {
    const result = importDxfString(dxfBlockDocument([
      0, 'BLOCK', 2, 'EDGE', 10, 0, 20, 0,
      0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'ENDBLK',
    ], [
      0, 'INSERT', 8, 'Array', 2, 'EDGE', 10, 10, 20, 20,
      70, 4, 71, 1, 44, 2, 45, 0,
      0, 'LINE', 10, 100, 20, 100, 11, 101, 21, 100,
    ]), { maxTotalVertices: 5 });

    expect(result.polylines).toHaveLength(2);
    expect(result.polylines.map((line) => line.points[0])).toEqual([
      { x: 10, y: 20 },
      { x: 12, y: 20 },
    ]);
    expect(result.warnings).toEqual(['vertex-limit-exceeded']);
  });

  it('charges the minimum eight CIRCLE samples to entity and total limits', () => {
    const entityLimited = importDxfString(dxfEntityDocument([
      0, 'CIRCLE', 10, 0, 20, 0, 40, 10,
    ]), {
      curveSegments: 3,
      maxVerticesPerEntity: 7,
      maxTotalVertices: 100,
    });
    const accepted = importDxfString(dxfEntityDocument([
      0, 'CIRCLE', 10, 0, 20, 0, 40, 10,
    ]), {
      curveSegments: 3,
      maxVerticesPerEntity: 8,
      maxTotalVertices: 8,
    });
    const totalLimited = importDxfString(dxfEntityDocument([
      0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'CIRCLE', 10, 0, 20, 0, 40, 10,
      0, 'LINE', 10, 2, 20, 0, 11, 3, 21, 0,
    ]), {
      curveSegments: 3,
      maxVerticesPerEntity: 8,
      maxTotalVertices: 9,
    });

    expect(entityLimited.polygons).toEqual([]);
    expect(entityLimited.warnings).toEqual(['vertex-limit-exceeded']);
    expect(accepted.polygons).toHaveLength(1);
    expect(accepted.polygons[0].outer).toHaveLength(8);
    expect(accepted.warnings).toEqual([]);
    expect(totalLimited.polygons).toEqual([]);
    expect(totalLimited.polylines).toHaveLength(1);
    expect(totalLimited.warnings).toEqual(['vertex-limit-exceeded']);
  });

  it('shares the output vertex budget across polylines, arcs, and lines', () => {
    const result = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 70, 0, 90, 3,
      10, 0, 20, 0,
      10, 1, 20, 0,
      10, 2, 20, 0,
      0, 'ARC', 10, 0, 20, 0, 40, 10, 50, 0, 51, 90,
      0, 'LINE', 10, 3, 20, 0, 11, 4, 21, 0,
    ]), {
      curveSegments: 4,
      maxTotalVertices: 5,
    });

    expect(result.polylines.map((line) => line.source)).toEqual([
      'LWPOLYLINE',
      'ARC',
    ]);
    expect(result.polylines.flatMap((line) => line.points)).toHaveLength(5);
    expect(result.warnings).toEqual(['vertex-limit-exceeded']);
  });

  it('recognizes duplicate-endpoint rings and tessellates bulge arcs', () => {
    const duplicateClosed = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 70, 0, 90, 5,
      10, 0, 20, 0,
      10, 10, 20, 0,
      10, 10, 20, 10,
      10, 0, 20, 10,
      10, 0, 20, 0,
    ]));
    const bulged = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 70, 1, 90, 4,
      10, 0, 20, 0, 42, 1,
      10, 10, 20, 0,
      10, 10, 20, 10,
      10, 0, 20, 10,
    ]), { curveSegments: 64 });

    expect(duplicateClosed.polygons).toHaveLength(1);
    expect(duplicateClosed.polylines).toHaveLength(0);
    expect(polygonArea(duplicateClosed.polygons[0])).toBeCloseTo(100);
    expect(bulged.warnings).toEqual([]);
    expect(bulged.polygons).toHaveLength(1);
    expect(Math.abs(
      polygonArea(bulged.polygons[0]) - (100 + Math.PI * 5 ** 2 / 2),
    )).toBeLessThan(0.1);
  });

  it('converts metric source units and accepts an explicit full-circle ARC', () => {
    const metres = importDxfString(dxfDocument([
      0, 'LINE', 10, 1, 20, 2, 11, 3, 21, 4,
      0, 'ARC', 10, 0, 20, 0, 40, 2, 50, 0, 51, 360,
    ], 6), { curveSegments: 16, targetUnit: 'mm' });

    expect(metres.unit).toBe('m');
    expect(metres.warnings).toEqual([]);
    expect(metres.polylines[0].points).toEqual([
      { x: 1_000, y: 2_000 },
      { x: 3_000, y: 4_000 },
    ]);
    expect(metres.polylines[1].points).toHaveLength(17);
    expect(metres.polylines[1].points[0].x).toBeCloseTo(2_000);
  });

  it('rejects unit-conversion overflow before charging the output budget', () => {
    const result = importDxfString(dxfDocument([
      0, 'LINE', 10, 1e308, 20, 0, 11, 1.1e308, 21, 0,
      0, 'LINE', 10, 1, 20, 2, 11, 3, 21, 4,
    ], 6), {
      targetUnit: 'mm',
      maxTotalVertices: 2,
    });

    expect(result.polylines).toHaveLength(1);
    expect(result.polylines[0].points).toEqual([
      { x: 1_000, y: 2_000 },
      { x: 3_000, y: 4_000 },
    ]);
    expect(result.warnings).toEqual(['invalid-line']);
  });

  it('rejects oversized files before starting a full text read', async () => {
    const file = new File(['0\nEOF\n'], 'oversized.dxf', {
      type: 'application/dxf',
    });
    const readAsText = vi.spyOn(FileReader.prototype, 'readAsText');
    try {
      const result = await importDxfFile(file, { maxInputCharacters: 1 });
      expect(result.polygons).toEqual([]);
      expect(result.polylines).toEqual([]);
      expect(result.warnings).toEqual(['input-size-limit-exceeded']);
      expect(readAsText).not.toHaveBeenCalled();
    } finally {
      readAsText.mockRestore();
    }
  });

  it('preserves fallback geometry and enforces limits without partial shapes', () => {
    const openLoop = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 70, 0, 90, 3,
      10, 0, 20, 0,
      10, 10, 20, 0,
      10, 0, 20, 0,
    ]));
    const limitedBulge = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 70, 1, 90, 4,
      10, 0, 20, 0, 42, 1,
      10, 10, 20, 0,
      10, 10, 20, 10,
      10, 0, 20, 10,
    ]), { curveSegments: 64, maxVerticesPerEntity: 5 });
    const selfIntersectingOpenLoop = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 70, 0, 90, 5,
      10, 0, 20, 0,
      10, 5, 20, 0,
      10, 1, 20, 4,
      10, 4, 20, 4,
      10, 0, 20, 0,
    ]));
    const unsupportedBeforeGeometry = importDxfString(dxfDocument([
      0, 'TEXT', 1, 'one',
      0, 'TEXT', 1, 'two',
      0, 'LINE', 10, 0, 20, 0, 11, 10, 21, 0,
      0, 'ATTRIB', 1, 'attribute',
      0, 'SEQEND',
    ], 0), { maxEntities: 1 });

    expect(openLoop.polygons).toEqual([]);
    expect(openLoop.polylines).toHaveLength(1);
    expect(openLoop.polylines[0].points).toHaveLength(3);
    expect(openLoop.warnings).toContain('invalid-closed-polyline');
    expect(limitedBulge.polygons).toEqual([]);
    expect(limitedBulge.polylines).toEqual([]);
    expect(limitedBulge.warnings).toEqual(['vertex-limit-exceeded']);
    expect(selfIntersectingOpenLoop.polygons).toEqual([]);
    expect(selfIntersectingOpenLoop.polylines).toHaveLength(1);
    expect(selfIntersectingOpenLoop.warnings).toContain(
      'invalid-closed-polyline',
    );
    expect(unsupportedBeforeGeometry.polylines).toHaveLength(1);
    expect(unsupportedBeforeGeometry.warnings).toEqual([
      'unsupported-entity:TEXT',
    ]);
  });

  it('deduplicates repeated entity diagnostics', () => {
    const result = importDxfString(dxfEntityDocument([
      0, 'LINE', 10, 0, 20, 0, 11, 0, 21, 0,
      0, 'LINE', 10, 1, 20, 1, 11, 1, 21, 1,
      0, 'CIRCLE', 10, 0, 20, 0, 40, 0,
      0, 'CIRCLE', 10, 0, 20, 0, 40, 0,
    ]));

    expect(result.warnings).toEqual(['invalid-line', 'invalid-circle']);
  });

  it('applies layer matching case-insensitively and caps sampled primitives', () => {
    const nested = importDxfString(dxfEntityDocument([
      0, 'LWPOLYLINE', 8, 'Walls', 70, 1, 90, 4,
      10, 0, 20, 0,
      10, 20, 20, 0,
      10, 20, 20, 20,
      10, 0, 20, 20,
      0, 'LWPOLYLINE', 8, 'WALLS', 70, 1, 90, 4,
      10, 5, 20, 5,
      10, 15, 20, 5,
      10, 15, 20, 15,
      10, 5, 20, 15,
    ]));
    const limited = importDxfString(dxfEntityDocument([
      0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'CIRCLE', 10, 0, 20, 0, 40, 10,
      0, 'ARC', 10, 0, 20, 0, 40, 10, 50, 0, 51, 360,
    ]), { curveSegments: 64, maxVerticesPerEntity: 1 });

    expect(nested.polygons).toHaveLength(1);
    expect(nested.polygons[0].holes).toHaveLength(1);
    expect(polygonArea(nested.polygons[0])).toBeCloseTo(300);
    expect(limited.polygons).toEqual([]);
    expect(limited.polylines).toEqual([]);
    expect(limited.warnings).toEqual(['vertex-limit-exceeded']);
  });
});

describe('GeoJSON interoperability', () => {
  it('imports Polygon and MultiPolygon features with properties and holes', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'parcel-a',
          properties: { name: 'A' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
              [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]],
            ],
          },
        },
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[20, 0], [22, 0], [22, 2], [20, 2], [20, 0]]],
              [[[30, 0], [33, 0], [33, 3], [30, 3], [30, 0]]],
            ],
          },
        },
      ],
    };

    const result = importGeoJsonString(JSON.stringify(input));

    expect(result.warnings).toEqual([]);
    expect(result.polygons).toHaveLength(3);
    expect(result.features[0]).toMatchObject({ id: 'parcel-a', properties: { name: 'A' } });
    expect(result.polygons[0].holes).toHaveLength(1);
    expect(result.polygons.every((polygon) => signedRingArea(polygon.outer) > 0)).toBe(true);
    expect(result.polygons[0].holes.every((hole) => signedRingArea(hole) < 0)).toBe(true);
  });

  it('exports closed RFC 7946 rings and round-trips geometry', () => {
    const polygon = {
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }),
      holes: [rectangleToRing({ x: 2, y: 2 }, { x: 4, y: 4 })],
    };
    const json = buildGeoJson([{ geometry: polygon, properties: { label: '<safe data>' } }]);
    const raw = JSON.parse(json);
    const coordinates = raw.features[0].geometry.coordinates;

    expect(coordinates[0][0]).toEqual(coordinates[0].at(-1));
    expect(coordinates[1][0]).toEqual(coordinates[1].at(-1));
    const decoded = importGeoJsonString(json);
    expect(decoded.warnings).toEqual([]);
    expect(polygonArea(decoded.polygons[0])).toBeCloseTo(96);
  });

  it('exports only effectively visible project polygons', () => {
    const project = createEmptyProject();
    const visible = createPolygonEntity({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 1, y: 1 }),
      holes: [],
    }, { name: 'Visible' });
    const hidden = createPolygonEntity({
      outer: rectangleToRing({ x: 2, y: 0 }, { x: 3, y: 1 }),
      holes: [],
    }, { name: 'Hidden' });
    hidden.visible = false;
    project.entities = [visible, hidden];

    const raw = JSON.parse(buildProjectGeoJson(project));

    expect(raw.features).toHaveLength(1);
    expect(raw.features[0].properties.name).toBe('Visible');
  });

  it('rejects malformed JSON and caps positions', () => {
    expect(importGeoJsonString('{').warnings).toEqual(['invalid-json']);
    const limited = importGeoJsonString(JSON.stringify({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    }), { maxPositions: 3 });
    expect(limited.polygons).toEqual([]);
    expect(limited.warnings).toContain('position-limit-exceeded');
  });
});
