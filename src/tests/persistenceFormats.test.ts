import { Blob as NodeBlob } from 'node:buffer';
import {
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, createLinearEntity, createPolygonEntity } from '../app/projectFactory';
import type { Project } from '../app/projectTypes';
import { rectangleToRing } from '../geometry/circle';
import { polygonArea } from '../geometry/area';
import { buildDxf } from '../persistence/dxfExport';
import { calculateRasterSize, projectSvgForPng } from '../persistence/pngExport';
import { buildSvg } from '../persistence/svgExport';
import { serializeProject } from '../persistence/projectCodec';
import {
  buildShareUrl,
  decodeProjectFromShareHash,
  decodeProjectFromShareHashResult,
  decodeProjectFromShareHashSourceOutcome,
  decodeProjectFromShareHashSourceResult,
  decodeSharedProject,
  decodeSharedProjectResult,
  decodeSharedProjectSourceOutcome,
  encodeProjectForShare,
  encodeProjectToShareHash,
  MAX_SHARE_HASH_LENGTH,
  MAX_SHARED_PROJECT_BYTES,
} from '../persistence/shareUrl';
import { importSvgString } from '../persistence/svgImport';

function projectWithHole() {
  const project = createEmptyProject();
  const entity = createPolygonEntity({
    outer: rectangleToRing({ x: 0, y: 0 }, { x: 100, y: 80 }),
    holes: [rectangleToRing({ x: 20, y: 20 }, { x: 40, y: 40 })],
  });
  return { ...project, entities: [entity] };
}

function replaceGlobalValue(name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    name,
  );
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  };
}

describe('DXF export', () => {
  it('emits the outer ring and holes as closed LWPOLYLINE entities', () => {
    const dxf = buildDxf(projectWithHole());
    expect(dxf.match(/LWPOLYLINE/g)).toHaveLength(2);
    expect(dxf.match(/70\r\n1\r\n/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dxf.match(/100\r\nAcDbEntity\r\n/g)).toHaveLength(2);
    expect(dxf.match(/100\r\nAcDbPolyline\r\n/g)).toHaveLength(2);
    expect(dxf).toContain('9\r\n$INSUNITS\r\n70\r\n4\r\n');
    expect(dxf).toMatch(/0\r\nEOF\r\n$/);
  });

  it('emits polylines and sampled arcs as open LWPOLYLINE entities', () => {
    const project = createEmptyProject();
    project.entities = [
      createLinearEntity([{ x: 0, y: 0 }, { x: 10, y: 5 }], 'polyline'),
      createLinearEntity([{ x: 10, y: 5 }, { x: 20, y: 0 }], 'arc'),
      createLinearEntity([{ x: 0, y: 20 }, { x: 10, y: 20 }], 'guide'),
    ];
    const dxf = buildDxf(project);
    expect(dxf.match(/LWPOLYLINE/g)).toHaveLength(2);
    expect(dxf.match(/100\r\nAcDbPolyline\r\n90\r\n\d+\r\n70\r\n0\r\n/g)).toHaveLength(2);
  });
});

describe('SVG import', () => {
  it('polygonizes polygon, rect, circle, ellipse and linear path elements', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <polygon points="0,0 10,0 10,10 0,10" />
        <rect x="20" y="10" width="10" height="5" />
        <circle cx="50" cy="10" r="5" />
        <ellipse cx="70" cy="10" rx="6" ry="3" />
        <path d="M 100 0 H 120 V 20 H 100 Z M 105 5 L 105 15 L 115 15 L 115 5 Z" />
      </svg>`;
    const result = importSvgString(svg, { circleSegments: 16 });

    expect(result.warnings).toEqual([]);
    expect(result.polygons).toHaveLength(5);
    expect(result.polygons[4].holes).toHaveLength(1);
    expect(result.polygons.every((polygon) => polygonArea(polygon) > 0)).toBe(true);
    expect(Math.min(...result.polygons[1].outer.map((point) => point.y))).toBe(-15);
  });

  it('handles relative M/L/H/V/Z commands and rejects malformed XML', () => {
    const relative = importSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="m 0 0 l 10 0 v 10 h -10 z" /></svg>',
    );
    expect(relative.polygons).toHaveLength(1);
    expect(polygonArea(relative.polygons[0])).toBeCloseTo(100);

    const malformed = importSvgString('<svg><path></svg>');
    expect(malformed.polygons).toEqual([]);
    expect(malformed.warnings).toContain('invalid-svg');
  });

  it('applies nested transforms and ignores shapes in non-rendered definitions', () => {
    const result = importSvgString(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><rect x="500" y="500" width="10" height="10" /></defs>
        <g transform="translate(10 20)">
          <rect transform="scale(2)" x="0" y="0" width="5" height="3" />
        </g>
      </svg>`, { flipY: false });

    expect(result.warnings).toEqual([]);
    expect(result.polygons).toHaveLength(1);
    expect(Math.min(...result.polygons[0].outer.map((point) => point.x))).toBeCloseTo(10);
    expect(Math.max(...result.polygons[0].outer.map((point) => point.x))).toBeCloseTo(20);
    expect(Math.min(...result.polygons[0].outer.map((point) => point.y))).toBeCloseTo(20);
    expect(Math.max(...result.polygons[0].outer.map((point) => point.y))).toBeCloseTo(26);
  });

  it('rejects curved paths with multiple subpaths instead of connecting them', () => {
    const result = importSvgString(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path d="M 0 0 C 10 0 10 10 0 10 Z M 30 0 C 40 0 40 10 30 10 Z" />
      </svg>`);
    expect(result.polygons).toEqual([]);
    expect(result.warnings).toContain('unsupported-path');
  });

  it('stops before path subpaths can exceed the ring nesting limit', () => {
    const subpaths = Array.from(
      { length: 20 },
      (_, index) => `M ${index * 3} 0 h 2 v 2 h -2 z`,
    ).join(' ');
    const result = importSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="${subpaths}" /></svg>`,
      { maxRings: 10 },
    );
    expect(result.polygons).toEqual([]);
    expect(result.warnings).toContain('ring-limit-exceeded');
  });
});

describe('PNG export helpers', () => {
  it('preserves aspect ratio while enforcing a maximum canvas dimension', () => {
    expect(calculateRasterSize(3000, 1000, 2, 4096)).toEqual({ width: 4096, height: 1365 });
    expect(calculateRasterSize(0, 0)).toEqual({ width: 2, height: 2 });
  });

  it('reuses the standalone SVG representation', () => {
    const svg = projectSvgForPng(projectWithHole());
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('escapes project-controlled SVG attributes', () => {
    const project = projectWithHole();
    project.layers[0].color = '\"/><script>alert(1)</script>';
    const svg = buildSvg(project);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('share URL codec', () => {
  it('round-trips gzip/base64url project data through payloads and hashes', async () => {
    const project = projectWithHole();
    const payload = await encodeProjectForShare(project);
    expect(payload).toMatch(/^(gz|raw)\.[A-Za-z0-9_-]+$/);
    expect((await decodeSharedProject(payload))?.id).toBe(project.id);

    const hash = await encodeProjectToShareHash(project);
    expect(hash).not.toBeNull();
    expect((await decodeProjectFromShareHash(hash!))?.entities).toHaveLength(1);
  });

  it('guards hash length and replaces an existing URL hash', async () => {
    const project = projectWithHole();
    expect(await encodeProjectToShareHash(project, 8)).toBeNull();
    const url = await buildShareUrl(project, 'https://example.test/app/#old');
    expect(url).toMatch(/^https:\/\/example\.test\/app\/#pb2d=/);
  });

  it('rejects invalid payloads', async () => {
    expect(await decodeSharedProject('gz.not+base64')).toBeNull();
    expect(await decodeProjectFromShareHash('#other=value')).toBeNull();
  });

  it('classifies terminal and retryable shared-payload failures', async () => {
    await expect(decodeSharedProjectSourceOutcome('raw.')).resolves.toEqual({
      ok: false,
      reason: 'malformed-payload',
      retryable: false,
    });
    await expect(decodeSharedProjectSourceOutcome('raw.not+base64'))
      .resolves.toEqual({
        ok: false,
        reason: 'malformed-payload',
        retryable: false,
      });
    await expect(decodeSharedProjectSourceOutcome('gz.AQID'))
      .resolves.toEqual({
        ok: false,
        reason: 'malformed-payload',
        retryable: false,
      });
    await expect(decodeProjectFromShareHashSourceOutcome(
      `${'#pb2d=raw.'}${'A'.repeat(MAX_SHARE_HASH_LENGTH)}`,
    )).resolves.toEqual({
      ok: false,
      reason: 'payload-too-large',
      retryable: false,
    });

    const gzipPayload = `gz.${gzipSync(
      serializeProject(projectWithHole()),
    ).toString('base64url')}`;
    let restoreDecompressionStream = replaceGlobalValue(
      'DecompressionStream',
      undefined,
    );
    try {
      await expect(decodeSharedProjectSourceOutcome(gzipPayload))
        .resolves.toEqual({
          ok: false,
          reason: 'decompression-unavailable',
          retryable: true,
        });
    } finally {
      restoreDecompressionStream();
    }

    const restoreBlob = replaceGlobalValue('Blob', NodeBlob);
    restoreDecompressionStream = replaceGlobalValue('DecompressionStream', class {
      constructor() {
        throw new Error('Temporary decompression failure');
      }
    });
    try {
      await expect(decodeSharedProjectSourceOutcome(gzipPayload))
        .resolves.toEqual({
          ok: false,
          reason: 'decompression-failed',
          retryable: true,
        });
    } finally {
      restoreDecompressionStream();
      restoreBlob();
    }

    const oversizedGzipPayload = `gz.${gzipSync(
      'x'.repeat(MAX_SHARED_PROJECT_BYTES + 1),
    ).toString('base64url')}`;
    const restoreNativeBlob = replaceGlobalValue('Blob', NodeBlob);
    const restoreNativeDecompressionStream = replaceGlobalValue(
      'DecompressionStream',
      NodeDecompressionStream,
    );
    try {
      await expect(decodeSharedProjectSourceOutcome(oversizedGzipPayload))
        .resolves.toEqual({
          ok: false,
          reason: 'payload-too-large',
          retryable: false,
        });
    } finally {
      restoreNativeDecompressionStream();
      restoreNativeBlob();
    }
  });

  it('exposes recoverable project diagnostics from payloads and hashes', async () => {
    const project = createEmptyProject();
    const recoverable = {
      ...project,
      entities: [{ id: 'broken', type: 'polygon' }],
    } as unknown as Project;
    const payload = await encodeProjectForShare(recoverable);
    const payloadResult = await decodeSharedProjectResult(payload);

    expect(payloadResult?.ok).toBe(true);
    if (!payloadResult?.ok) return;
    expect(payloadResult.discardedItems).toEqual([
      { kind: 'entity', index: 0, reason: 'invalid-polygon' },
    ]);

    const hash = `#pb2d=${payload}`;
    const hashResult = await decodeProjectFromShareHashResult(hash);
    expect(hashResult?.ok && hashResult.discardedItemCount).toBe(1);
    const sourceResult = await decodeProjectFromShareHashSourceResult(hash);
    expect(sourceResult?.sourceJson).toBe(serializeProject(recoverable));
    expect(
      sourceResult?.decodeResult.ok &&
        sourceResult.decodeResult.discardedItemCount,
    ).toBe(1);
  });

  it('rejects oversized source data even when it would compress to a short hash', async () => {
    const project = {
      ...createEmptyProject(),
      name: 'x'.repeat(MAX_SHARED_PROJECT_BYTES + 1),
    };
    await expect(encodeProjectForShare(project)).rejects.toThrow(RangeError);
    expect(await encodeProjectToShareHash(project, Number.MAX_SAFE_INTEGER)).toBeNull();
  });
});
