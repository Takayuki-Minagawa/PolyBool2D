import { describe, expect, it } from 'vitest';
import { buildSvg } from '../persistence/svgExport';
import { buildAreaCsv, buildVertexCsv } from '../persistence/csvExport';
import { createEmptyProject, createLinearEntity, createPolygonEntity } from '../app/projectFactory';
import { rectangleToRing } from '../geometry/circle';
import type { Project } from '../app/projectTypes';

function projectWithSquare(): Project {
  const project = createEmptyProject();
  const ent = createPolygonEntity(
    { outer: rectangleToRing({ x: 0, y: 0 }, { x: 1000, y: 1000 }), holes: [] },
    { name: 'Sq' },
  );
  return { ...project, entities: [ent] };
}

describe('svg export', () => {
  it('emits a well-formed svg with a path per polygon', () => {
    const svg = buildSvg(projectWithSquare());
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<path');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('Z');
  });

  it('handles an empty project without throwing', () => {
    const svg = buildSvg(createEmptyProject());
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<path');
  });

  it('exports polylines and sampled arcs but omits construction guides', () => {
    const project = createEmptyProject();
    project.entities = [
      createLinearEntity([{ x: 0, y: 0 }, { x: 10, y: 5 }], 'polyline'),
      createLinearEntity([{ x: 10, y: 5 }, { x: 20, y: 0 }], 'arc'),
      createLinearEntity([{ x: 0, y: 20 }, { x: 10, y: 20 }], 'guide'),
    ];
    const svg = buildSvg(project);
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg).not.toContain('100000');
  });
});

describe('csv export', () => {
  it('builds an area summary with a header and one data row', () => {
    const csv = buildAreaCsv(projectWithSquare());
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('area_m²');
    // 1000x1000 (mm units) = 1 m².
    expect(lines[1]).toContain('Sq');
    expect(lines[1]).toContain('1.000');
  });

  it('escapes names containing commas', () => {
    const base = createEmptyProject();
    const ent = createPolygonEntity(
      { outer: rectangleToRing({ x: 0, y: 0 }, { x: 10, y: 10 }), holes: [] },
      { name: 'a,b' },
    );
    const csv = buildAreaCsv({ ...base, entities: [ent] });
    expect(csv).toContain('"a,b"');
  });

  it('neutralizes formula-injection names but keeps negative numbers numeric', () => {
    const base = createEmptyProject();
    const ent = createPolygonEntity(
      { outer: rectangleToRing({ x: -5, y: -5 }, { x: 5, y: 5 }), holes: [] },
      { name: '=cmd()' },
    );
    const csv = buildVertexCsv({ ...base, entities: [ent] });
    // Name with leading '=' is prefixed with a quote (and wrapped because of it).
    expect(csv).toContain("'=cmd()");
    // Negative coordinates remain plain numeric cells, not quoted/prefixed.
    expect(csv).toContain('-5.000');
    expect(csv).not.toContain("'-5");
  });

  it('lists every vertex with ring labels', () => {
    const csv = buildVertexCsv(projectWithSquare());
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('entity,ring,index,x,y');
    // header + 4 outer vertices
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('outer');
  });

  it('lists polyline and arc vertices while omitting guides', () => {
    const project = createEmptyProject();
    project.entities = [
      createLinearEntity([{ x: 0, y: 0 }, { x: 2, y: 3 }], 'polyline', { name: 'Route' }),
      createLinearEntity([{ x: 3, y: 3 }, { x: 4, y: 5 }], 'arc', { name: 'Curve' }),
      createLinearEntity([{ x: 0, y: 9 }, { x: 10, y: 9 }], 'guide', { name: 'Helper' }),
    ];
    const csv = buildVertexCsv(project);
    expect(csv).toContain('Route,polyline');
    expect(csv).toContain('Curve,arc');
    expect(csv).not.toContain('Helper');
  });

  it('includes linear lengths in the area summary without inventing an area', () => {
    const project = createEmptyProject();
    project.entities = [
      createLinearEntity([{ x: 0, y: 0 }, { x: 3, y: 4 }], 'polyline', { name: 'Route' }),
    ];
    const lines = buildAreaCsv(project).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('Route,,5.000,2,0');
  });
});
