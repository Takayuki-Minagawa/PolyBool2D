import type { BBox } from './measure';
import type { Point } from './types';
import { isFinitePoint } from './numeric';

export type BBoxIndexItem<T> = {
  bbox: BBox;
  value: T;
};

type BBoxTreeNode<T> = {
  bbox: BBox;
  items?: BBoxIndexItem<T>[];
  left?: BBoxTreeNode<T>;
  right?: BBoxTreeNode<T>;
};

const DEFAULT_LEAF_SIZE = 8;

export function normalizeBBox(box: BBox): BBox | null {
  if (
    !Number.isFinite(box.minX) ||
    !Number.isFinite(box.minY) ||
    !Number.isFinite(box.maxX) ||
    !Number.isFinite(box.maxY)
  ) {
    return null;
  }
  return {
    minX: Math.min(box.minX, box.maxX),
    minY: Math.min(box.minY, box.maxY),
    maxX: Math.max(box.minX, box.maxX),
    maxY: Math.max(box.minY, box.maxY),
  };
}
function intersectsNormalized(a: BBox, b: BBox): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

export function bboxesIntersect(a: BBox, b: BBox): boolean {
  const na = normalizeBBox(a);
  const nb = normalizeBBox(b);
  return na !== null && nb !== null && intersectsNormalized(na, nb);
}

export function bboxContainsPoint(box: BBox, point: Point): boolean {
  const normalized = normalizeBBox(box);
  return (
    normalized !== null &&
    isFinitePoint(point) &&
    point.x >= normalized.minX &&
    point.x <= normalized.maxX &&
    point.y >= normalized.minY &&
    point.y <= normalized.maxY
  );
}

function unionBoxes(items: readonly BBoxIndexItem<unknown>[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.bbox.minX);
    minY = Math.min(minY, item.bbox.minY);
    maxX = Math.max(maxX, item.bbox.maxX);
    maxY = Math.max(maxY, item.bbox.maxY);
  }
  return { minX, minY, maxX, maxY };
}

function buildTree<T>(
  items: BBoxIndexItem<T>[],
  leafSize: number,
): BBoxTreeNode<T> | null {
  if (items.length === 0) return null;
  const bbox = unionBoxes(items);
  if (items.length <= leafSize) return { bbox, items };

  const splitX = bbox.maxX - bbox.minX >= bbox.maxY - bbox.minY;
  items.sort((a, b) => {
    const centerA = splitX
      ? (a.bbox.minX + a.bbox.maxX) / 2
      : (a.bbox.minY + a.bbox.maxY) / 2;
    const centerB = splitX
      ? (b.bbox.minX + b.bbox.maxX) / 2
      : (b.bbox.minY + b.bbox.maxY) / 2;
    return centerA - centerB;
  });
  const middle = Math.floor(items.length / 2);
  return {
    bbox,
    left: buildTree(items.slice(0, middle), leafSize) ?? undefined,
    right: buildTree(items.slice(middle), leafSize) ?? undefined,
  };
}

/**
 * A balanced, in-memory AABB index. Mutations rebuild the tree; queries are
 * O(log n + k) for ordinary distributions and work well for CAD hit/snap
 * candidate filtering without adding another dependency.
 */
export class BBoxSpatialIndex<T> {
  private items: BBoxIndexItem<T>[] = [];
  private root: BBoxTreeNode<T> | null = null;
  private readonly leafSize: number;

  constructor(
    items: readonly BBoxIndexItem<T>[] = [],
    leafSize = DEFAULT_LEAF_SIZE,
  ) {
    this.leafSize =
      Number.isFinite(leafSize) && leafSize >= 1
        ? Math.floor(leafSize)
        : DEFAULT_LEAF_SIZE;
    this.load(items);
  }

  get size(): number {
    return this.items.length;
  }

  private rebuild(): void {
    this.root = buildTree([...this.items], this.leafSize);
  }

  load(items: readonly BBoxIndexItem<T>[]): void {
    this.items = [];
    for (const item of items) {
      const bbox = normalizeBBox(item.bbox);
      if (bbox) this.items.push({ bbox, value: item.value });
    }
    this.rebuild();
  }

  clear(): void {
    this.items = [];
    this.root = null;
  }

  insert(item: BBoxIndexItem<T>): boolean {
    const bbox = normalizeBBox(item.bbox);
    if (!bbox) return false;
    this.items.push({ bbox, value: item.value });
    this.rebuild();
    return true;
  }

  remove(value: T): boolean {
    const index = this.items.findIndex((item) => Object.is(item.value, value));
    if (index < 0) return false;
    this.items.splice(index, 1);
    this.rebuild();
    return true;
  }

  update(value: T, bbox: BBox): boolean {
    const normalized = normalizeBBox(bbox);
    if (!normalized) return false;
    const item = this.items.find((candidate) => Object.is(candidate.value, value));
    if (!item) return false;
    item.bbox = normalized;
    this.rebuild();
    return true;
  }

  all(): BBoxIndexItem<T>[] {
    return this.items.map((item) => ({ bbox: { ...item.bbox }, value: item.value }));
  }

  query(box: BBox): BBoxIndexItem<T>[] {
    const query = normalizeBBox(box);
    if (!query || !this.root) return [];
    const result: BBoxIndexItem<T>[] = [];
    const stack: BBoxTreeNode<T>[] = [this.root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!intersectsNormalized(node.bbox, query)) continue;
      if (node.items) {
        for (const item of node.items) {
          if (intersectsNormalized(item.bbox, query)) {
            result.push({ bbox: { ...item.bbox }, value: item.value });
          }
        }
      } else {
        if (node.left) stack.push(node.left);
        if (node.right) stack.push(node.right);
      }
    }
    return result;
  }

  queryValues(box: BBox): T[] {
    return this.query(box).map((item) => item.value);
  }

  queryPoint(point: Point): BBoxIndexItem<T>[] {
    if (!isFinitePoint(point)) return [];
    return this.query({
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    });
  }
}
