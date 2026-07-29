import { polygonArea } from '../../geometry/area';
import type { PolygonEntity } from '../projectTypes';
import type { AppState } from './types';

export const selectProjectEntities = (state: AppState) => state.project.entities;
export const selectProjectLayers = (state: AppState) => state.project.layers;
export const selectProjectSettings = (state: AppState) => state.project.settings;
export const selectProjectUnit = (state: AppState) => state.project.unit;
export const selectSelectedEntityIds = (state: AppState) => state.selectedEntityIds;

export function selectSelectedPolygons(state: AppState): PolygonEntity[] {
  const selected = new Set(state.selectedEntityIds);
  return state.project.entities.filter(
    (entity): entity is PolygonEntity =>
      entity.type === 'polygon' && selected.has(entity.id),
  );
}

export type SelectedAreaSummary = {
  count: number;
  area: number;
  unit: AppState['project']['unit'];
  areaDisplayUnit: AppState['project']['settings']['areaDisplayUnit'];
  areaPrecision: number;
};

export function selectSelectedAreaSummary(state: AppState): SelectedAreaSummary {
  const selected = new Set(state.selectedEntityIds);
  let count = 0;
  let area = 0;
  for (const entity of state.project.entities) {
    if (entity.type !== 'polygon' || !selected.has(entity.id)) continue;
    count += 1;
    area += polygonArea(entity.geometry);
  }
  return {
    count,
    area,
    unit: state.project.unit,
    areaDisplayUnit: state.project.settings.areaDisplayUnit,
    areaPrecision: state.project.settings.areaPrecision,
  };
}
