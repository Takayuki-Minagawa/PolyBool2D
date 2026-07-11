import { describe, expect, it } from 'vitest';
import {
  deserializeProject,
  serializeProject,
} from '../persistence/projectSerializer';
import { createEmptyProject, createPolygonEntity } from '../app/projectFactory';
import { APP_VERSION } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';

function validProject() {
  const p = createEmptyProject();
  const ent = createPolygonEntity({
    outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 100 }),
    holes: [],
  });
  p.entities.push(ent);
  return p;
}

describe('deserializeProject', () => {
  it('round-trips a valid project', () => {
    const p = validProject();
    const json = serializeProject(p);
    const out = deserializeProject(json);
    expect(out).not.toBeNull();
    expect(out!.entities.length).toBe(1);
    expect(out!.entities[0].type).toBe('polygon');
  });

  it('rejects malformed JSON', () => {
    expect(deserializeProject('{ broken }')).toBeNull();
  });

  it('rejects unknown version', () => {
    const p = validProject();
    const json = serializeProject({ ...p, version: '999.0.0' });
    expect(deserializeProject(json)).toBeNull();
  });

  it('drops an entity with missing geometry without discarding the project', () => {
    const p = validProject();
    const broken = JSON.parse(serializeProject(p));
    delete broken.entities[0].geometry;
    expect(deserializeProject(JSON.stringify(broken))?.entities).toEqual([]);
  });

  it('drops an entity with non-numeric points', () => {
    const p = validProject();
    const broken = JSON.parse(serializeProject(p));
    broken.entities[0].geometry.outer[0] = { x: 'oops', y: 0 };
    expect(deserializeProject(JSON.stringify(broken))?.entities).toEqual([]);
  });

  it('drops a polygon ring with fewer than 3 points', () => {
    const p = validProject();
    const broken = JSON.parse(serializeProject(p));
    broken.entities[0].geometry.outer = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(deserializeProject(JSON.stringify(broken))?.entities).toEqual([]);
  });

  it('keeps valid entities when a one-point linear entity is corrupt', () => {
    const mixed = JSON.parse(serializeProject(validProject()));
    mixed.entities.push({
      id: 'broken-line',
      type: 'guide-line',
      name: 'Broken',
      kind: 'polyline',
      layerId: mixed.layers[0].id,
      points: [{ x: 0, y: 0 }],
      style: { stroke: '#000000', strokeWidth: 1, opacity: 1 },
      locked: false,
      visible: true,
    });

    const out = deserializeProject(JSON.stringify(mixed));

    expect(out?.entities).toHaveLength(1);
    expect(out?.entities[0].type).toBe('polygon');
  });

  it('rejects when layers array is empty', () => {
    const p = validProject();
    const broken = JSON.parse(serializeProject(p));
    broken.layers = [];
    expect(deserializeProject(JSON.stringify(broken))).toBeNull();
  });

  it('rejects unknown unit', () => {
    const p = validProject();
    const broken = JSON.parse(serializeProject(p));
    broken.unit = 'inch';
    expect(deserializeProject(JSON.stringify(broken))).toBeNull();
  });

  it('fills missing settings with defaults', () => {
    const p = validProject();
    const partial = JSON.parse(serializeProject(p));
    delete partial.settings;
    const out = deserializeProject(JSON.stringify(partial));
    expect(out).not.toBeNull();
    expect(out!.settings.gridSize).toBeGreaterThan(0);
    expect(out!.settings.circleSegments).toBeGreaterThanOrEqual(8);
  });

  it('migrates 0.1 projects to the current schema version', () => {
    const legacy = JSON.parse(serializeProject(validProject()));
    legacy.version = '0.1.0';
    delete legacy.settings.angleSnapEnabled;
    delete legacy.settings.angleSnapIncrementDeg;

    const out = deserializeProject(JSON.stringify(legacy));

    expect(out?.version).toBe(APP_VERSION);
    expect(out?.settings.angleSnapEnabled).toBe(false);
    expect(out?.settings.angleSnapIncrementDeg).toBeGreaterThan(0);
  });

  it('sanitizes invalid layer colors from imported JSON', () => {
    const unsafe = JSON.parse(serializeProject(validProject()));
    unsafe.layers[0].color = '\"/><script>alert(1)</script>';

    const out = deserializeProject(JSON.stringify(unsafe));

    expect(out?.layers[0].color).toBe('#3a8dde');
  });

  it('clamps unsafe precision settings to a renderable range', () => {
    const p = validProject();
    const unsafe = JSON.parse(serializeProject(p));
    unsafe.settings.areaPrecision = 101;
    unsafe.settings.coordinatePrecision = 101;

    const out = deserializeProject(JSON.stringify(unsafe));

    expect(out).not.toBeNull();
    expect(out!.settings.areaPrecision).toBeLessThanOrEqual(12);
    expect(out!.settings.coordinatePrecision).toBeLessThanOrEqual(12);
    expect(() => (1).toFixed(out!.settings.areaPrecision)).not.toThrow();
    expect(() => (1).toFixed(out!.settings.coordinatePrecision)).not.toThrow();
  });

  it('ignores non-finite numeric settings from JSON', () => {
    const p = validProject();
    const raw = serializeProject(p)
      .replace('"gridSize": 100', '"gridSize": 1e999')
      .replace('"coordinatePrecision": 3', '"coordinatePrecision": 1e999')
      .replace('"circleSegments": 64', '"circleSegments": 1e999');

    const out = deserializeProject(raw);

    expect(out).not.toBeNull();
    expect(out!.settings.gridSize).toBe(100);
    expect(out!.settings.coordinatePrecision).toBe(3);
    expect(out!.settings.circleSegments).toBe(64);
  });
});
