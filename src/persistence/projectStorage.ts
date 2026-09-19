/** Synchronous project codec/storage logic runs against a transaction-local map.
 * The browser UI uses durableProjectStore, which commits this map to IndexedDB.
 * Keeping the legacy adapter also permits lossless migration and recovery tests.
 */
let adapter: Storage | null = null;
export function setProjectStorage(storage: Storage | null): void {
  adapter = storage;
}
export const hasProjectStorageAdapter = () => adapter !== null;
export function projectStorage(): Storage {
  if (adapter) return adapter;
  return localStorage;
}

export class ProjectMemoryStorage implements Storage {
  constructor(public values = new Map<string, string>()) {}
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}
