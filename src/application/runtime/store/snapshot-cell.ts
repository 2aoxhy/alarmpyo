type StateUpdater<T> = T | ((previous: T) => T);

/** Preserve equal branches when schema validation creates equivalent objects. */
function shareValue<T>(previous: T, candidate: T): T {
  if (Object.is(previous, candidate)) return previous;
  if (candidate === null || typeof candidate !== 'object') return candidate;
  if (
    previous === null ||
    typeof previous !== 'object' ||
    Array.isArray(previous) !== Array.isArray(candidate)
  ) {
    return freezeValue(candidate);
  }
  const previousRecord = previous as Record<string, unknown>;
  const candidateRecord = candidate as Record<string, unknown>;
  const keys = Object.keys(candidateRecord);
  let equal = keys.length === Object.keys(previousRecord).length;
  const output: Record<string, unknown> = Array.isArray(candidate)
    ? ([] as unknown as Record<string, unknown>)
    : {};
  for (const key of keys) {
    const next = shareValue(previousRecord[key], candidateRecord[key]);
    output[key] = next;
    if (
      !Object.prototype.hasOwnProperty.call(previousRecord, key) ||
      !Object.is(next, previousRecord[key])
    )
      equal = false;
  }
  return equal ? previous : (Object.freeze(output) as T);
}

function freezeValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const copy = Array.isArray(value)
    ? value.map((child) => freezeValue(child))
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeValue(child)]));
  return Object.freeze(copy) as T;
}

/** One immutable state source, coalescing synchronous status changes into one notification. */
export class AppStoreSnapshotCell<T extends object> {
  private snapshot: T;
  private readonly listeners = new Set<() => void>();
  private notificationPending = false;

  constructor(initial: T) {
    this.snapshot = freezeValue(initial);
  }

  getSnapshot = (): T => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set<K extends keyof T>(key: K, update: StateUpdater<T[K]>): void {
    const previous = this.snapshot[key];
    const candidate =
      typeof update === 'function' ? (update as (value: T[K]) => T[K])(previous) : update;
    const next = shareValue(previous, candidate);
    if (Object.is(previous, next)) return;
    this.snapshot = Object.freeze({ ...this.snapshot, [key]: next });
    if (this.notificationPending) return;
    this.notificationPending = true;
    queueMicrotask(() => {
      this.notificationPending = false;
      for (const listener of this.listeners) listener();
    });
  }
}
