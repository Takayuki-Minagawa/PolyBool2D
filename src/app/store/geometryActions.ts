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
    replaceEntitiesWithHistory(selectedEntityIds, newEntities);
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
      replaceEntitiesWithHistory([subjectId, ...cutterIds], newEntities);
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
      replaceEntitiesWithHistory(selectedEntityIds, [created]);
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
  };
}
