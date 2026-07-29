import { describe, expect, it } from 'vitest';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { polygonArea, signedRingArea } from '../geometry/area';
import { rectangleToRing } from '../geometry/circle';
import { buildDxf } from '../persistence/dxfExport';
import { importDxfString } from '../persistence/dxfImport';
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
