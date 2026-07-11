import { translatePolygon } from '../geometry/translate';
import type { Entity } from './projectTypes';
import { makeId } from './idUtils';

export type EntityClipboard = {
  entities: Entity[];
  pasteCount: number;
};

export function copyEntities(entities: Entity[]): EntityClipboard {
  return { entities: structuredClone(entities), pasteCount: 0 };
}

/**
 * Create independent entities from clipboard data. Every paste uses fresh IDs
 * and applies a progressively larger offset so repeated pastes stay visible.
 */
export function pasteEntities(
  clipboard: EntityClipboard,
  baseOffset: number,
): { entities: Entity[]; clipboard: EntityClipboard } {
  if (!Number.isFinite(baseOffset)) baseOffset = 0;
  const pasteCount = clipboard.pasteCount + 1;
  const delta = baseOffset * pasteCount;
  const entities = clipboard.entities.map((source): Entity => {
    if (source.type === 'polygon') {
      return {
        ...structuredClone(source),
        id: makeId('poly'),
        name: `${source.name} copy`,
        geometry: translatePolygon(source.geometry, delta, -delta),
      };
    }
    return {
      ...structuredClone(source),
      id: makeId('guide'),
      points: source.points.map((point) => ({
        x: point.x + delta,
        y: point.y - delta,
      })),
    };
  });
  return {
    entities,
    clipboard: { entities: clipboard.entities, pasteCount },
  };
}
