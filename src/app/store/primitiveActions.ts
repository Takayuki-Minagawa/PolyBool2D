import { addHoleToPolygon, removeHoleFromPolygon } from '../../geometry/holes';
import { ellipseToRing } from '../../geometry/primitives';
import { distance } from '../../geometry/numeric';
import { validatePolygon } from '../../geometry/validation';
import { createLinearEntity } from '../projectFactory';
import { getPolygon, resolveDrawingLayer, touchProject } from './helpers';
import type { AppGet, AppSet, AppState } from './types';

function activeLayerId(get: AppGet): string | null {
  const state = get();
  return resolveDrawingLayer(state.project, state.ui.activeLayerId)?.id ?? null;
}

export function createPrimitiveActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'addEllipse'
  | 'addLinearEntity'
  | 'addHole'
  | 'removeHole'
  | 'validateEntity'
> {
  return {
    addEllipse: (center, radiusX, radiusY) => {
      const ring = ellipseToRing(
        center,
        radiusX,
        radiusY,
        get().project.settings.circleSegments,
      );
      if (ring.length === 0) {
        get().setErrorMessage('errors.invalidEllipse');
        return null;
      }
      return get().addPolygonFromOuter(ring, {
        sourceShape: 'ellipse',
        createdByOperation: 'draw',
      });
    },

    addLinearEntity: (points, kind, options = {}) => {
      const minimumPoints =
        kind === 'annotation'
          ? 1
          : kind === 'linear-dimension' || kind === 'angular-dimension'
            ? 3
            : 2;
      const finite = points.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      );
      const validShape =
        kind === 'annotation'
          ? typeof options.label === 'string' && options.label.trim().length > 0
          : kind === 'linear-dimension'
            ? points.length >= 2 && distance(points[0], points[1]) > 1e-9
            : kind === 'angular-dimension'
              ? points.length >= 3 &&
                distance(points[0], points[1]) > 1e-9 &&
                distance(points[0], points[2]) > 1e-9
              : points.length >= 2 &&
                points.some((point) => distance(point, points[0]) > 1e-9);
      if (points.length < minimumPoints || !finite || !validShape) {
        get().setErrorMessage('errors.invalidLine');
        return null;
      }
      const layerId = activeLayerId(get);
      if (!layerId) {
        get().setErrorMessage('errors.noDrawableLayer');
        return null;
      }
      const entity = createLinearEntity(points, kind, { ...options, layerId });
      get().pushHistory();
      set((state) => ({
        project: touchProject(state.project, [...state.project.entities, entity]),
        selectedEntityIds: [entity.id],
      }));
      return entity;
    },

    addHole: (entityId, ring) => {
      const entity = getPolygon(get().project, entityId);
      if (!entity) return false;
      const result = addHoleToPolygon(entity.geometry, ring);
      if (!result.ok) {
        get().setErrorMessage(`errors.validation.${result.issues[0]}`);
        return false;
      }
      get().updateEntityGeometry(entityId, result.geometry);
      return true;
    },

    removeHole: (entityId, holeIndex) => {
      const entity = getPolygon(get().project, entityId);
      if (!entity) return;
      const geometry = removeHoleFromPolygon(entity.geometry, holeIndex);
      if (geometry) get().updateEntityGeometry(entityId, geometry);
    },

    validateEntity: (id) => {
      const entity = get().project.entities.find((item) => item.id === id);
      if (!entity || entity.type !== 'polygon') return true;
      const validation = validatePolygon(entity.geometry);
      set((state) => ({
        ui: {
          ...state.ui,
          invalidEntityIds: validation.valid
            ? state.ui.invalidEntityIds.filter((entityId) => entityId !== id)
            : [...new Set([...state.ui.invalidEntityIds, id])],
          errorMessage: validation.valid
            ? state.ui.errorMessage?.startsWith('errors.validation.')
              ? null
              : state.ui.errorMessage
            : `errors.validation.${validation.issues[0]}`,
        },
      }));
      return validation.valid;
    },
  };
}
