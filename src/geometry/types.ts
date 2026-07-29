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

export type GeometryOperationResult<
  T,
  FailureReason extends string,
  Diagnostic = never,
> =
  | {
      ok: true;
      value: T;
      diagnostics: Diagnostic[];
    }
  | {
      ok: false;
      value: T;
      reason: FailureReason;
      message: string;
      diagnostics: Diagnostic[];
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
  /** Normalize self-crossing input without discarding zero signed-area rings. */
  repair?(input: MultiPolygonGeometry): MultiPolygonGeometry;
}

export const EPS = 1e-9;
