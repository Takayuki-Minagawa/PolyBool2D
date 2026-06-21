import { describe, expect, it } from 'vitest';
import { buildSvg } from '../persistence/svgExport';
import { buildAreaCsv, buildVertexCsv } from '../persistence/csvExport';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
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
});
