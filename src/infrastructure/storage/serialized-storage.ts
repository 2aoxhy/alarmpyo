export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

export type StorageWriteOperations = {
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type StorageWriter = StorageWriteOperations & {
  /** Use the supplied operations inside the callback; re-enqueueing would deadlock. */
  runExclusive: <T>(operation: (writer: StorageWriteOperations) => Promise<T>) => Promise<T>;
};

export type SerializedMutationCoordinator = {
  getCompletedRevision: () => number;
  getRequestedRevision: () => number;
  run: <T>(operation: (revision: number) => Promise<T>) => Promise<T>;
};

export type LatestStorageValueCoordinator = {
  getPersistedValue: () => string | null;
  setPersistedValue: (value: string | null) => void;
  writeLatest: (
    value: string,
    options?: { force?: boolean },
  ) => Promise<{ persistedValue: string; wrote: boolean }>;
};

/**
 * Storage writes are serialized so a failed write cannot overtake a later one.
 * The fallback value preserves adapters that do not expose removeItem.
 */
export function createSerializedStorageWriter(
  storage: StorageAdapter,
  removedValue = '',
): StorageWriter {
  let tail: Promise<void> = Promise.resolve();
  const operations: StorageWriteOperations = {
    write: (key, value) => storage.setItem(key, value),
    remove: (key) => storage.removeItem
      ? storage.removeItem(key)
      : storage.setItem(key, removedValue),
  };
  const runExclusive = <T>(operation: (writer: StorageWriteOperations) => Promise<T>) => {
    const task = tail.then(() => operation(operations));
    tail = task.then(() => undefined, () => undefined);
    return task;
  };
  return {
    write: (key, value) => runExclusive((writer) => writer.write(key, value)),
    remove: (key) => runExclusive((writer) => writer.remove(key)),
    runExclusive,
  };
}

/** A rejected operation still completes its revision and never blocks the queue. */
export function createSerializedMutationCoordinator(): SerializedMutationCoordinator {
  let tail: Promise<void> = Promise.resolve();
  let requestedRevision = 0;
  let completedRevision = 0;

  return {
    getCompletedRevision: () => completedRevision,
    getRequestedRevision: () => requestedRevision,
    run<T>(operation: (revision: number) => Promise<T>) {
      requestedRevision += 1;
      const revision = requestedRevision;
      const task = tail.then(() => operation(revision));
      tail = task.then(
        () => {
          completedRevision = revision;
        },
        () => {
          completedRevision = revision;
        },
      );
      return task;
    },
  };
}

/**
 * Keeps one storage key equal to the newest requested value, including A -> B
 * -> A changes while the B write is still running.
 */
export function createLatestStorageValueCoordinator(
  writer: StorageWriter,
  key: string,
): LatestStorageValueCoordinator {
  let persistedValue: string | null = null;
  let latestRequest: { force: boolean; revision: number; value: string } | null =
    null;
  let handledRevision = 0;
  let nextRevision = 0;
  let drainPromise: Promise<void> | null = null;

  const drain = async () => {
    while (latestRequest !== null && handledRevision < latestRequest.revision) {
      const request = latestRequest;
      if (!request.force && persistedValue === request.value) {
        handledRevision = request.revision;
        continue;
      }

      await writer.write(key, request.value);
      persistedValue = request.value;
      handledRevision = request.revision;
    }
  };

  const ensureDrain = () => {
    if (drainPromise !== null) return drainPromise;
    const running = drain();
    const tracked = running.finally(() => {
      if (drainPromise === tracked) drainPromise = null;
    });
    drainPromise = tracked;
    return tracked;
  };

  return {
    getPersistedValue: () => persistedValue,
    setPersistedValue(value) {
      persistedValue = value;
    },
    async writeLatest(value, options) {
      const revision = nextRevision + 1;
      nextRevision = revision;
      const force =
        options?.force === true ||
        (latestRequest !== null &&
          handledRevision < latestRequest.revision &&
          latestRequest.force);
      latestRequest = { force, revision, value };
      const before = persistedValue;

      while (handledRevision < revision) await ensureDrain();

      if (persistedValue === null) {
        throw new Error('저장 완료 상태를 확인하지 못했습니다.');
      }
      return { persistedValue, wrote: before !== persistedValue || force };
    },
  };
}
