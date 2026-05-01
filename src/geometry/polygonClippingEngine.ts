import polygonClipping from 'polygon-clipping';
import type {
  MultiPolygon as PCMultiPolygon,
  Pair as PCPair,
  Polygon as PCPolygon,
  Ring as PCRing,
} from 'polygon-clipping';
import { multiPolygonArea } from './area';
import { normalizeMultiPolygon } from './normalize';
import { validatePolygon } from './validation';
import type {
  GeometryEngine,
  GeometryValidationIssue,
  GeometryValidationResult,
  MultiPolygonGeometry,
  PolygonGeometry,
  Ring,
} from './types';

function ringToPC(ring: Ring): PCRing {
  const out: PCPair[] = ring.map((p) => [p.x, p.y] as PCPair);
  if (out.length > 0) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      out.push([first[0], first[1]]);
    }
  }
  return out;
}

function polygonToPC(poly: PolygonGeometry): PCPolygon {
  return [ringToPC(poly.outer), ...poly.holes.map(ringToPC)];
}

function multiPolygonToPC(mp: MultiPolygonGeometry): PCMultiPolygon {
  return mp.map(polygonToPC);
}

function ringFromPC(ring: PCRing): Ring {
  const out: Ring = ring.map(([x, y]) => ({ x, y }));
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.x === last.x && first.y === last.y) out.pop();
  }
  return out;
}

function polygonFromPC(poly: PCPolygon): PolygonGeometry {
  const [outer, ...holes] = poly;
  return {
    outer: ringFromPC(outer),
    holes: holes.map(ringFromPC),
  };
}

function multiPolygonFromPC(mp: PCMultiPolygon): MultiPolygonGeometry {
  return mp.map(polygonFromPC);
}

export class PolygonClippingEngine implements GeometryEngine {
  union(input: MultiPolygonGeometry): MultiPolygonGeometry {
    if (input.length === 0) return [];
    const result = polygonClipping.union(multiPolygonToPC(input));
    return normalizeMultiPolygon(multiPolygonFromPC(result));
  }
  difference(
    subject: MultiPolygonGeometry,
    cutters: MultiPolygonGeometry,
  ): MultiPolygonGeometry {
    if (subject.length === 0) return [];
    if (cutters.length === 0) return normalizeMultiPolygon(subject);
    const result = polygonClipping.difference(
      multiPolygonToPC(subject),
      multiPolygonToPC(cutters),
    );
    return normalizeMultiPolygon(multiPolygonFromPC(result));
  }
  intersection(input: MultiPolygonGeometry): MultiPolygonGeometry {
    if (input.length === 0) return [];
    const [first, ...rest] = input;
    const result = polygonClipping.intersection(
      multiPolygonToPC([first]),
      ...rest.map((p) => multiPolygonToPC([p])),
    );
    return normalizeMultiPolygon(multiPolygonFromPC(result));
  }
  xor(input: MultiPolygonGeometry): MultiPolygonGeometry {
    if (input.length === 0) return [];
    const [first, ...rest] = input;
    const result = polygonClipping.xor(
      multiPolygonToPC([first]),
      ...rest.map((p) => multiPolygonToPC([p])),
    );
    return normalizeMultiPolygon(multiPolygonFromPC(result));
  }
  area(input: MultiPolygonGeometry): number {
    return multiPolygonArea(input);
  }
  normalize(input: MultiPolygonGeometry): MultiPolygonGeometry {
    return normalizeMultiPolygon(input);
  }
  validate(input: MultiPolygonGeometry): GeometryValidationResult {
    const issues = new Set<GeometryValidationIssue>();
    let valid = true;
    for (const p of input) {
      const r = validatePolygon(p);
      if (!r.valid) {
        valid = false;
        for (const i of r.issues) issues.add(i);
      }
    }
    return { valid, issues: Array.from(issues) };
  }
}

export const defaultEngine: GeometryEngine = new PolygonClippingEngine();
