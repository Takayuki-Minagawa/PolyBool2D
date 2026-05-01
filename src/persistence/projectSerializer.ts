import type {
  Entity,
  GuideLineEntity,
  Layer,
  PolygonEntity,
  Project,
  ProjectSettings,
} from '../app/projectTypes';
import { APP_VERSION, DEFAULT_SETTINGS, DEFAULT_STYLE } from '../app/projectTypes';

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export const SUPPORTED_VERSIONS = new Set([APP_VERSION]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPoint(v: unknown): v is { x: number; y: number } {
  if (!isObject(v)) return false;
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

function isRing(v: unknown): v is { x: number; y: number }[] {
  return Array.isArray(v) && v.every(isPoint);
}

function isPolygonGeometry(
  v: unknown,
): v is { outer: { x: number; y: number }[]; holes: { x: number; y: number }[][] } {
  if (!isObject(v)) return false;
  if (!isRing(v.outer) || v.outer.length < 3) return false;
  if (!Array.isArray(v.holes)) return false;
  return v.holes.every((h) => isRing(h) && (h as unknown[]).length >= 3);
}

function parseLayer(v: unknown): Layer | null {
  if (!isObject(v)) return null;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  return {
    id: v.id,
    name: v.name,
    visible: v.visible !== false,
    locked: v.locked === true,
    color: typeof v.color === 'string' ? v.color : '#3a8dde',
  };
}

function parseSettings(v: unknown): ProjectSettings {
  if (!isObject(v)) return { ...DEFAULT_SETTINGS };
  const s: ProjectSettings = { ...DEFAULT_SETTINGS };
  if (typeof v.gridSize === 'number' && v.gridSize > 0) s.gridSize = v.gridSize;
  if (typeof v.snapEnabled === 'boolean') s.snapEnabled = v.snapEnabled;
  if (typeof v.snapToGrid === 'boolean') s.snapToGrid = v.snapToGrid;
  if (typeof v.snapToVertex === 'boolean') s.snapToVertex = v.snapToVertex;
  if (typeof v.snapToEdge === 'boolean') s.snapToEdge = v.snapToEdge;
  if (typeof v.snapTolerancePx === 'number' && v.snapTolerancePx > 0)
    s.snapTolerancePx = v.snapTolerancePx;
  if (typeof v.areaPrecision === 'number' && v.areaPrecision >= 0)
    s.areaPrecision = Math.floor(v.areaPrecision);
  if (typeof v.coordinatePrecision === 'number' && v.coordinatePrecision >= 0)
    s.coordinatePrecision = Math.floor(v.coordinatePrecision);
  if (typeof v.circleSegments === 'number' && v.circleSegments >= 8)
    s.circleSegments = Math.floor(v.circleSegments);
  return s;
}

function parsePolygonEntity(v: Record<string, unknown>): PolygonEntity | null {
  if (typeof v.id !== 'string') return null;
  if (typeof v.name !== 'string') return null;
  if (typeof v.layerId !== 'string') return null;
  if (!isPolygonGeometry(v.geometry)) return null;
  const style = isObject(v.style)
    ? {
        fill: typeof v.style.fill === 'string' ? v.style.fill : DEFAULT_STYLE.fill,
        stroke:
          typeof v.style.stroke === 'string' ? v.style.stroke : DEFAULT_STYLE.stroke,
        strokeWidth:
          typeof v.style.strokeWidth === 'number'
            ? v.style.strokeWidth
            : DEFAULT_STYLE.strokeWidth,
        opacity:
          typeof v.style.opacity === 'number'
            ? v.style.opacity
            : DEFAULT_STYLE.opacity,
      }
    : { ...DEFAULT_STYLE };
  const ALLOWED_SHAPES = ['polygon', 'rectangle', 'circle', 'boolean-result', 'knife-result'] as const;
  const ALLOWED_OPS = ['draw', 'union', 'difference', 'knife'] as const;
  type Shape = (typeof ALLOWED_SHAPES)[number];
  type Op = (typeof ALLOWED_OPS)[number];
  const metadata = isObject(v.metadata)
    ? {
        sourceShape:
          typeof v.metadata.sourceShape === 'string' &&
          (ALLOWED_SHAPES as readonly string[]).includes(v.metadata.sourceShape)
            ? (v.metadata.sourceShape as Shape)
            : undefined,
        createdByOperation:
          typeof v.metadata.createdByOperation === 'string' &&
          (ALLOWED_OPS as readonly string[]).includes(v.metadata.createdByOperation)
            ? (v.metadata.createdByOperation as Op)
            : undefined,
      }
    : undefined;

  return {
    id: v.id,
    type: 'polygon',
    name: v.name,
    layerId: v.layerId,
    geometry: {
      outer: v.geometry.outer.map((p) => ({ x: p.x, y: p.y })),
      holes: v.geometry.holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))),
    },
    style,
    locked: v.locked === true,
    visible: v.visible !== false,
    metadata,
  };
}

function parseGuideLineEntity(v: Record<string, unknown>): GuideLineEntity | null {
  if (typeof v.id !== 'string') return null;
  if (typeof v.layerId !== 'string') return null;
  if (!isRing(v.points)) return null;
  return {
    id: v.id,
    type: 'guide-line',
    layerId: v.layerId,
    points: v.points.map((p) => ({ x: p.x, y: p.y })),
    locked: v.locked === true,
    visible: v.visible !== false,
  };
}

function parseEntity(v: unknown): Entity | null {
  if (!isObject(v)) return null;
  if (v.type === 'polygon') return parsePolygonEntity(v);
  if (v.type === 'guide-line') return parseGuideLineEntity(v);
  return null;
}

export function deserializeProject(json: string): Project | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;
  if (typeof parsed.version !== 'string') return null;
  if (!SUPPORTED_VERSIONS.has(parsed.version)) return null;
  if (typeof parsed.id !== 'string') return null;
  if (typeof parsed.name !== 'string') return null;
  if (parsed.unit !== 'mm' && parsed.unit !== 'cm' && parsed.unit !== 'm') {
    return null;
  }
  if (typeof parsed.createdAt !== 'string') return null;
  if (typeof parsed.updatedAt !== 'string') return null;

  if (!Array.isArray(parsed.layers)) return null;
  const layers: Layer[] = [];
  for (const l of parsed.layers) {
    const parsedLayer = parseLayer(l);
    if (!parsedLayer) return null;
    layers.push(parsedLayer);
  }
  if (layers.length === 0) return null;

  if (!Array.isArray(parsed.entities)) return null;
  const entities: Entity[] = [];
  for (const e of parsed.entities) {
    const parsedEntity = parseEntity(e);
    if (!parsedEntity) return null;
    entities.push(parsedEntity);
  }

  return {
    id: parsed.id,
    name: parsed.name,
    version: parsed.version,
    unit: parsed.unit,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    settings: parseSettings(parsed.settings),
    layers,
    entities,
  };
}

export function exportProjectFile(p: Project): void {
  const blob = new Blob([serializeProject(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 13);
  a.href = url;
  a.download = `cad-project-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importProjectFile(file: File): Promise<Project | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      resolve(deserializeProject(text));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}
