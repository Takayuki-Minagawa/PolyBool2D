export type Point = { x: number; y: number };
export type Ring = Point[];

export type PolygonGeometry = {
  outer: Ring;
  holes: Ring[];
};

export type MultiPolygonGeometry = PolygonGeometry[];

export type BooleanOperation = 'union' | 'difference' | 'intersection' | 'xor';

export type GeometryValidationIssue =
  | 'outer-too-few-points'
  | 'hole-too-few-points'
  | 'self-intersection'
  | 'hole-outside-outer'
  | 'hole-overlap'
  | 'zero-area';

export type GeometryValidationResult = {
  valid: boolean;
  issues: GeometryValidationIssue[];
};

export interface GeometryEngine {
  union(input: MultiPolygonGeometry): MultiPolygonGeometry;
  difference(
    subject: MultiPolygonGeometry,
    cutters: MultiPolygonGeometry,
  ): MultiPolygonGeometry;
  intersection(input: MultiPolygonGeometry): MultiPolygonGeometry;
  xor(input: MultiPolygonGeometry): MultiPolygonGeometry;
  area(input: MultiPolygonGeometry): number;
  normalize(input: MultiPolygonGeometry): MultiPolygonGeometry;
  validate(input: MultiPolygonGeometry): GeometryValidationResult;
}

export const EPS = 1e-9;
