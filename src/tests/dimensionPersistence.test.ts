import { describe, expect, it } from 'vitest';
import {
  createAngularDimensionEntity,
  createAnnotationEntity,
  createEmptyProject,
  createLinearDimensionEntity,
  createLinearEntity,
} from '../app/projectFactory';
import type { GuideLineEntity, LinearEntity } from '../app/projectTypes';
import { buildDxf } from '../persistence/dxfExport';
import { decodeProject, serializeProject } from '../persistence/projectCodec';
import { buildSvg } from '../persistence/svgExport';

describe('dimension and annotation entities', () => {
  it('builds canonical entities with documented point semantics', () => {
    const linear = createLinearDimensionEntity(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      5,
      { label: 'WIDTH', precision: 3 },
    );
    const angular = createAngularDimensionEntity(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      7,
    );
    const annotation = createAnnotationEntity(
      { x: 4, y: 6 },
      'Column A',
      { rotationDeg: 30, textHeight: 4 },
    );

    expect(linear).toMatchObject({
      type: 'guide-line',
      kind: 'linear-dimension',
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }],
      label: 'WIDTH',
      precision: 3,
    });
    expect(angular).toMatchObject({
      kind: 'angular-dimension',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
        { x: 7, y: 0 },
      ],
    });
    expect(annotation).toMatchObject({
      kind: 'annotation',
      points: [{ x: 4, y: 6 }],
      label: 'Column A',
      rotationDeg: 30,
      textHeight: 4,
    });

    const canonical: LinearEntity = annotation!;
    const legacyAlias: GuideLineEntity = canonical;
    expect(legacyAlias).toBe(canonical);
    expect(createLinearDimensionEntity({ x: 0, y: 0 }, { x: 0, y: 0 }, 2)).toBeNull();
    expect(createAnnotationEntity({ x: 0, y: 0 }, '')).toBeNull();
  });

  it('round-trips new kinds and keeps old guide-line files compatible', () => {
    const project = createEmptyProject();
    project.entities = [
      createLinearDimensionEntity({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)!,
      createAngularDimensionEntity(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      )!,
      createAnnotationEntity({ x: 2, y: 3 }, 'Note')!,
      createLinearEntity([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'polyline'),
    ];

    const decoded = decodeProject(serializeProject(project));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.entities.map((entity) => (
      entity.type === 'guide-line' ? entity.kind : entity.type
    ))).toEqual([
      'linear-dimension',
      'angular-dimension',
      'annotation',
      'polyline',
    ]);
    const note = decoded.project.entities[2];
    expect(note.type).toBe('guide-line');
    if (note.type === 'guide-line') {
      expect(note.label).toBe('Note');
      expect(note.points).toEqual([{ x: 2, y: 3 }]);
    }
  });

  it('reports invalid new entity shapes with an entity-level reason', () => {
    const project = createEmptyProject();
    const raw = JSON.parse(serializeProject(project));
    raw.entities = [
      {
        id: 'bad-dimension',
        type: 'guide-line',
        kind: 'linear-dimension',
        name: 'Bad',
        layerId: project.layers[0].id,
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      },
      {
        id: 'bad-annotation',
        type: 'guide-line',
        kind: 'annotation',
        layerId: project.layers[0].id,
        points: [{ x: 0, y: 0 }],
      },
    ];

    const decoded = decodeProject(JSON.stringify(raw));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.project.entities).toEqual([]);
    expect(decoded.discardedEntities).toEqual([
      { index: 0, reason: 'invalid-linear-entity' },
      { index: 1, reason: 'invalid-linear-entity' },
    ]);
  });
});

describe('dimension and annotation export', () => {
  function dimensionProject() {
    const project = createEmptyProject();
    project.settings.coordinatePrecision = 1;
    project.entities = [
      createLinearDimensionEntity({ x: 0, y: 0 }, { x: 10, y: 0 }, 5)!,
      createAngularDimensionEntity(
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 20, y: 10 },
        8,
      )!,
      createAnnotationEntity(
        { x: 5, y: 12 },
        '<Column & beam>',
        { rotationDeg: 15 },
      )!,
    ];
    return project;
  }

  it('writes SVG dimensions as linework plus escaped text', () => {
    const svg = buildSvg(dimensionProject());

    expect(svg.match(/<line /g)).toHaveLength(5);
    expect(svg.match(/<text /g)).toHaveLength(3);
    expect(svg).toContain('10 mm');
    expect(svg).toContain('90°');
    expect(svg).toContain('&lt;Column &amp; beam&gt;');
    expect(svg).not.toContain('<Column & beam>');
  });

  it('writes DXF dimensions as LINE/LWPOLYLINE plus safe TEXT records', () => {
    const project = dimensionProject();
    const annotation = project.entities[2];
    if (annotation.type === 'guide-line') annotation.label = 'Note\n0\nEOF';

    const dxf = buildDxf(project);

    expect(dxf.match(/0\r\nLINE\r\n/g)).toHaveLength(5);
    expect(dxf.match(/0\r\nTEXT\r\n/g)).toHaveLength(3);
    expect(dxf.match(/0\r\nLWPOLYLINE\r\n/g)).toHaveLength(1);
    expect(dxf).toContain('1\r\n10 mm\r\n');
    expect(dxf).toContain('1\r\n90°\r\n');
    expect(dxf).toContain('1\r\nNote 0 EOF\r\n');
  });
});
