// 공통 저장소에 접근하는 얇은 층. 실제로는 서비스 워커의 Firestore(포트로 부탁), 테스트와 개발 화면에서는 메모리를 쓴다.
export type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  getKeys(): Promise<string[]>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  onChanged(listener: (changes: StorageChanges) => void): () => void;
}

export const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

// JSON으로 같은 값인지 본다(저장소 값은 JSON이다).
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createMemoryArea(initial: Record<string, unknown> = {}): StorageArea {
  const data = new Map<string, unknown>(Object.entries(clone(initial)));
  const listeners = new Set<(changes: StorageChanges) => void>();
  const emit = (changes: StorageChanges) => {
    if (Object.keys(changes).length === 0) return;
    listeners.forEach((l) => l(changes));
  };
  return {
    async get(keys) {
      const result: Record<string, unknown> = {};
      keys.forEach((k) => {
        if (data.has(k)) result[k] = clone(data.get(k));
      });
      return result;
    },
    async getKeys() {
      return Array.from(data.keys());
    },
    async set(items) {
      const changes: StorageChanges = {};
      Object.entries(items).forEach(([k, v]) => {
        changes[k] = { oldValue: data.get(k), newValue: clone(v) };
        data.set(k, clone(v));
      });
      emit(changes);
    },
    async remove(keys) {
      const changes: StorageChanges = {};
      keys.forEach((k) => {
        if (data.has(k)) {
          changes[k] = { oldValue: data.get(k) };
          data.delete(k);
        }
      });
      emit(changes);
    },
    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
