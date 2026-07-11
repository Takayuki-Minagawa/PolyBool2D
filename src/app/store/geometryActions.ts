import { polygonArea } from '../../geometry/area';
import { convexHull } from '../../geometry/convexHull';
import { defaultEngine } from '../../geometry/geometryEngine';
import { knifeSplitPolygon } from '../../geometry/knifeSplit';
import { polygonBBox } from '../../geometry/measure';
import { normalizePolygon } from '../../geometry/normalize';
import { simplifyRing } from '../../geometry/simplify';
import { translatePolygon } from '../../geometry/translate';
import {
  mirrorPolygon,
  rotatePolygon,
  scalePolygon,
} from '../../geometry/transform2d';
import { deleteVertexFromRing, insertVertexInRing } from '../../geometry/vertexEdit';
import { offsetPolygon } from '../../geometry/offset';
import { repairPolygon } from '../../geometry/repair';
import { chamferPolygon, filletPolygon } from '../../geometry/corner';
import { minimumAreaBoundingRectangle } from '../../geometry/minimumBoundingRectangle';
import type { Point, PolygonGeometry } from '../../geometry/types';
import { boundsForEntities } from '../transform';
import { createPolygonEntity } from '../projectFactory';
import type { PolygonEntity } from '../projectTypes';
import {
  alignOffset,
  collectPolygonPoints,
  editRingGeometry,
  getPolygon,
  isPolygon,
  polygonCenter,
  polygonsByIds,
  replaceEntities,
  touchProject,
} from './helpers';
import type { AppGet, AppSet, AppState } from './types';

export function createGeometryActions(set: AppSet, get: AppGet): Pick<
  AppState,
  | 'unionSelected'
  | 'intersectSelected'
  | 'xorSelected'
  | 'differenceSelected'
  | 'knifeSelected'
  | 'rotateSelected'
  | 'scaleSelected'
  | 'mirrorSelected'
  | 'convexHullSelected'
  | 'simplifySelected'
  | 'alignSelected'
  | 'distributeSelected'
  | 'insertVertex'
  | 'deleteVertex'
  | 'offsetSelected'
  | 'repairSelected'
  | 'chamferSelected'
  | 'filletSelected'
  | 'minimumBoundingRectangleSelected'
> {
  function replaceEntitiesWithHistory(removeIds: string[], added: PolygonEntity[]) {
    get().pushHistory();
    set((s) => ({
      project: replaceEntities(s.project, removeIds, added),
      selectedEntityIds: added.map((e) => e.id),
    }));
  }

  function applyBooleanToSelection(op: 'union' | 'intersection' | 'xor', name: string) {
    const { project, selectedEntityIds } = get();
    const polys = polygonsByIds(project, selectedEntityIds);
    if (polys.length < 2) {
      get().setErrorMessage('errors.booleanNeedsTwo');
      return;
    }
    const result = defaultEngine[op](polys.map((p) => p.geometry));
    if (result.length === 0) {
      get().setErrorMessage('errors.emptyResult');
      return;
    }
    const newEntities = result.map((g) =>
      createPolygonEntity(g, {
        name,
        metadata: { sourceShape: 'boolean-result', createdByOperation: op },
        layerId: polys[0].layerId,
      }),
    );
    replaceEntitiesWithHistory(
      polys.map((polygon) => polygon.id),
      newEntities,
    );
  }

  function transformSelected(fn: (geom: PolygonGeometry, pivot: Point) => PolygonGeometry) {
    const { project, selectedEntityIds } = get();
    const polys = polygonsByIds(project, selectedEntityIds);
    if (polys.length === 0) return;
    const bounds = boundsForEntities(polys);
    if (!bounds) return;
    const pivot = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const selected = new Set(selectedEntityIds);
    get().pushHistory();
    set((s) => ({
      project: touchProject(
        s.project,
        s.project.entities.map((e) => {
          if (!isPolygon(e) || !selected.has(e.id)) return e;
          const normalized = normalizePolygon(fn(e.geometry, pivot));
          return normalized ? { ...e, geometry: normalized } : e;
        }),
      ),
    }));
  }

  return {
    unionSelected: () => applyBooleanToSelection('union', 'Union'),

    intersectSelected: () => applyBooleanToSelection('intersection', 'Intersection'),

    xorSelected: () => applyBooleanToSelection('xor', 'XOR'),

    differenceSelected: (subjectId, cutterIds) => {
      const { project } = get();
      const subject = polygonsByIds(project, [subjectId])[0];
      if (!subject) {
        get().setErrorMessage('errors.subjectNotSelected');
        return;
      }
      const cutters = polygonsByIds(project, cutterIds);
      if (cutters.length === 0) {
        get().setErrorMessage('errors.cutterNotSelected');
        return;
      }
      const result = defaultEngine.difference(
        [subject.geometry],
        cutters.map((c) => c.geometry),
      );
      const newEntities = result.map((g) =>
        createPolygonEntity(g, {
          name: 'Difference',
          metadata: {
            sourceShape: 'boolean-result',
            createdByOperation: 'difference',
          },
          layerId: subject.layerId,
        }),
      );
      replaceEntitiesWithHistory(
        [subject.id, ...cutters.map((cutter) => cutter.id)],
        newEntities,
      );
    },

    knifeSelected: (entityId, start, end) => {
      const { project } = get();
      const target = polygonsByIds(project, [entityId])[0];
      if (!target) {
        get().setErrorMessage('errors.knifeNoTarget');
        return false;
      }
      const result = knifeSplitPolygon(target.geometry, start, end);
      if (!result.ok) {
        get().setErrorMessage(`errors.knife.${result.reason}`);
        return false;
      }
      const totalBefore = polygonArea(target.geometry);
      const totalAfter = result.polygons.reduce((acc, p) => acc + polygonArea(p), 0);
      if (Math.abs(totalBefore - totalAfter) > 1e-3) {
        get().setErrorMessage('errors.knife.areaMismatch');
        return false;
      }
      const newEntities = result.polygons.map((g, i) =>
        createPolygonEntity(g, {
          name: `${target.name} (${i + 1})`,
          layerId: target.layerId,
          metadata: {
            sourceShape: 'knife-result',
            createdByOperation: 'knife',
          },
        }),
      );
      replaceEntitiesWithHistory([entityId], newEntities);
      return true;
    },

    rotateSelected: (angleRad) =>
      transformSelected((geom, pivot) => rotatePolygon(geom, pivot, angleRad)),

    scaleSelected: (sx, sy) => {
      if (sx === 0 || sy === 0 || !Number.isFinite(sx) || !Number.isFinite(sy)) {
        get().setErrorMessage('errors.invalidScale');
        return;
      }
      transformSelected((geom, pivot) => scalePolygon(geom, pivot, sx, sy));
    },

    mirrorSelected: (axis) =>
      transformSelected((geom, pivot) => mirrorPolygon(geom, pivot, axis)),

    convexHullSelected: () => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length === 0) return;
      const hull = convexHull(collectPolygonPoints(polys));
      if (!hull) {
        get().setErrorMessage('errors.hullDegenerate');
        return;
      }
      const created = createPolygonEntity(
        { outer: hull, holes: [] },
        {
          name: 'Convex hull',
          layerId: polys[0].layerId,
          metadata: { sourceShape: 'polygon', createdByOperation: 'draw' },
        },
      );
      replaceEntitiesWithHistory(
        polys.map((polygon) => polygon.id),
        [created],
      );
    },

    simplifySelected: (tolerance) => {
      if (!(tolerance > 0)) return;
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length === 0) return;
      const selected = new Set(selectedEntityIds);
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) => {
            if (!isPolygon(e) || !selected.has(e.id)) return e;
            const simplified: PolygonGeometry = {
              outer: simplifyRing(e.geometry.outer, tolerance),
              holes: e.geometry.holes.map((h) => simplifyRing(h, tolerance)),
            };
            const normalized = normalizePolygon(simplified);
            return normalized ? { ...e, geometry: normalized } : e;
          }),
        ),
      }));
    },

    alignSelected: (mode) => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length < 2) return;
      const group = boundsForEntities(polys);
      if (!group) return;
      const selected = new Set(selectedEntityIds);
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) => {
            if (!isPolygon(e) || !selected.has(e.id)) return e;
            const box = polygonBBox(e.geometry);
            if (!box) return e;
            const { dx, dy } = alignOffset(box, group, mode);
            return dx === 0 && dy === 0
              ? e
              : { ...e, geometry: translatePolygon(e.geometry, dx, dy) };
          }),
        ),
      }));
    },

    distributeSelected: (axis) => {
      const { project, selectedEntityIds } = get();
      const polys = polygonsByIds(project, selectedEntityIds);
      if (polys.length < 3) return;
      const items = polys
        .map((p) => ({ id: p.id, center: polygonCenter(p, axis) }))
        .filter((it): it is { id: string; center: number } => it.center !== null)
        .sort((a, b) => a.center - b.center);
      if (items.length < 3) return;
      const first = items[0].center;
      const last = items[items.length - 1].center;
      const step = (last - first) / (items.length - 1);
      const targetById = new Map<string, number>();
      items.forEach((it, i) => targetById.set(it.id, first + step * i));
      get().pushHistory();
      set((s) => ({
        project: touchProject(
          s.project,
          s.project.entities.map((e) => {
            if (!isPolygon(e)) return e;
            const target = targetById.get(e.id);
            if (target === undefined) return e;
            const center = polygonCenter(e, axis);
            if (center === null) return e;
            const delta = target - center;
            if (delta === 0) return e;
            return {
              ...e,
              geometry: translatePolygon(
                e.geometry,
                axis === 'x' ? delta : 0,
                axis === 'y' ? delta : 0,
              ),
            };
          }),
        ),
      }));
    },

    insertVertex: (ref, point) => {
      const ent = getPolygon(get().project, ref.entityId);
      if (!ent) return;
      const geom = editRingGeometry(ent, ref, (ring) =>
        insertVertexInRing(ring, ref.vertexIndex, point),
      );
      if (geom && geom !== 'too-few') get().updateEntityGeometry(ref.entityId, geom);
    },

    deleteVertex: (ref) => {
      const ent = getPolygon(get().project, ref.entityId);
      if (!ent) return;
      const geom = editRingGeometry(ent, ref, (ring) =>
        deleteVertexFromRing(ring, ref.vertexIndex),
      );
      if (geom === 'too-few') {
        get().setErrorMessage('errors.vertexMinimum');
        return;
      }
      if (geom) get().updateEntityGeometry(ref.entityId, geom);
    },

    offsetSelected: (distance) => {
      if (!Number.isFinite(distance) || distance === 0) {
        get().setErrorMessage('errors.invalidOffset');
        return;
      }
      const { project, selectedEntityIds } = get();
      const polygons = polygonsByIds(project, selectedEntityIds);
      if (polygons.length === 0) return;
      const created = polygons.flatMap((polygon) =>
        offsetPolygon(polygon.geometry, distance, {
          arcSegments: project.settings.circleSegments,
        }).map((geometry, index) =>
          createPolygonEntity(geometry, {
            name: `${polygon.name} offset${index > 0 ? ` ${index + 1}` : ''}`,
            layerId: polygon.layerId,
            metadata: {
              sourceShape: 'offset-result',
              createdByOperation: 'offset',
            },
          }),
        ),
      );
      if (created.length === 0) {
        get().setErrorMessage('errors.emptyResult');
        return;
      }
      get().pushHistory();
      set((state) => ({
        project: touchProject(state.project, [...state.project.entities, ...created]),
        selectedEntityIds: created.map((entity) => entity.id),
      }));
    },

    repairSelected: () => {
      const { project, selectedEntityIds } = get();
      const polygons = polygonsByIds(project, selectedEntityIds);
      if (polygons.length === 0) return;
      const repaired: PolygonEntity[] = [];
      const repairedSourceIds: string[] = [];
      const failedSourceIds: string[] = [];
      for (const polygon of polygons) {
        const geometries = repairPolygon(polygon.geometry);
        if (geometries.length === 0) {
          failedSourceIds.push(polygon.id);
          continue;
        }
        repairedSourceIds.push(polygon.id);
        repaired.push(
          ...geometries.map((geometry, index) =>
            createPolygonEntity(geometry, {
              name: `${polygon.name}${index > 0 ? ` ${index + 1}` : ''}`,
              layerId: polygon.layerId,
              metadata: {
                sourceShape: polygon.metadata?.sourceShape ?? 'polygon',
                createdByOperation: 'repair',
              },
            }),
          ),
        );
      }
      if (repaired.length === 0) {
        get().setErrorMessage('errors.repairFailed');
        return;
      }
      const removed = new Set(repairedSourceIds);
      get().pushHistory();
      set((state) => ({
        project: replaceEntities(state.project, repairedSourceIds, repaired),
        selectedEntityIds: [
          ...state.selectedEntityIds.filter((id) => !removed.has(id)),
          ...repaired.map((entity) => entity.id),
        ],
        ui: {
          ...state.ui,
          errorMessage:
            failedSourceIds.length > 0
              ? 'errors.repairFailed'
              : state.ui.errorMessage,
          invalidEntityIds: state.ui.invalidEntityIds.filter(
            (id) => !removed.has(id),
          ),
        },
      }));
    },

    chamferSelected: (distance) => {
      if (!Number.isFinite(distance) || distance <= 0) {
        get().setErrorMessage('errors.invalidCorner');
        return;
      }
      const { project, selectedEntityIds } = get();
      const selected = new Set(selectedEntityIds);
      let changed = false;
      const entities = project.entities.map((entity) => {
        if (!isPolygon(entity) || !selected.has(entity.id)) return entity;
        const geometry = chamferPolygon(entity.geometry, distance);
        if (!geometry) return entity;
        changed = true;
        return {
          ...entity,
          geometry,
          metadata: {
            sourceShape: 'corner-result' as const,
            createdByOperation: 'chamfer' as const,
          },
        };
      });
      if (!changed) {
        get().setErrorMessage('errors.invalidCorner');
        return;
      }
      get().pushHistory();
      set((state) => ({ project: touchProject(state.project, entities) }));
    },

    filletSelected: (radius, segments = 4) => {
      if (!Number.isFinite(radius) || radius <= 0) {
        get().setErrorMessage('errors.invalidCorner');
        return;
      }
      const { project, selectedEntityIds } = get();
      const selected = new Set(selectedEntityIds);
      let changed = false;
      const entities = project.entities.map((entity) => {
        if (!isPolygon(entity) || !selected.has(entity.id)) return entity;
        const geometry = filletPolygon(entity.geometry, radius, {
          segmentsPerQuarter: segments,
        });
        if (!geometry) return entity;
        changed = true;
        return {
          ...entity,
          geometry,
          metadata: {
            sourceShape: 'corner-result' as const,
            createdByOperation: 'fillet' as const,
          },
        };
      });
      if (!changed) {
        get().setErrorMessage('errors.invalidCorner');
        return;
      }
      get().pushHistory();
      set((state) => ({ project: touchProject(state.project, entities) }));
    },

    minimumBoundingRectangleSelected: () => {
      const { project, selectedEntityIds } = get();
      const polygons = polygonsByIds(project, selectedEntityIds);
      const rectangle = minimumAreaBoundingRectangle(collectPolygonPoints(polygons));
      if (!rectangle) {
        get().setErrorMessage('errors.boundingRectangleFailed');
        return;
      }
      const entity = createPolygonEntity(
        { outer: rectangle.corners, holes: [] },
        {
          name: 'Minimum bounding rectangle',
          layerId: polygons[0].layerId,
          metadata: {
            sourceShape: 'bounding-rectangle',
            createdByOperation: 'minimum-bounds',
          },
        },
      );
      get().pushHistory();
      set((state) => ({
        project: touchProject(state.project, [...state.project.entities, entity]),
        selectedEntityIds: [entity.id],
      }));
    },
  };
}
