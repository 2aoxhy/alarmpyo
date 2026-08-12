import type { AppData } from '../models/app-data';
import { getUtf8ByteLength } from '../utils/utf8';
import {
  createDefaultAppData,
  exportAppDataToJson,
  previewAppDataImport,
  serializeAppData,
  tryParseAppDataJson,
  withoutAlarmRuntimeState,
} from './app-data-service';
import {
  getCheckedAppDataContentsByteSize,
  getCheckedBackupContentsByteSize,
  MAX_APP_DATA_BYTES,
  MAX_BACKUP_FILE_BYTES,
} from './backup-file-policy';

export const APP_DATA_STORAGE_KEY = 'alarmpyo:app-data:v1';
export const APP_DATA_AUTOMATIC_BACKUP_KEY = 'alarmpyo:backup:before-reset';
export const APP_DATA_LAST_KNOWN_GOOD_KEY = 'alarmpyo:backup:last-known-good';
export const APP_DATA_PENDING_RESTORE_BACKUP_KEY =
  'alarmpyo:backup:pending-before-restore:v1';
export const APP_DATA_EXPLICIT_RESET_MARKER_KEY =
  'alarmpyo:reset:explicit:v1';
const CORRUPT_BACKUP_KEY_PREFIX = 'alarmpyo:corrupt:';
export const APP_DATA_CORRUPT_BACKUP_KEY = `${CORRUPT_BACKUP_KEY_PREFIX}last`;
const CLEARED_PENDING_RESTORE_BACKUP = '';
const EXPLICIT_RESET_MARKER_FORMAT = 'alarmpyo-explicit-reset';

export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

export type CorruptDataQuarantine = (
  raw: string,
  now: Date,
) => Promise<string | null>;

export type StorageWriter = {
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type SerializedMutationCoordinator = {
  getCompletedRevision: () => number;
  getRequestedRevision: () => number;
  run: <T>(operation: (revision: number) => Promise<T>) => Promise<T>;
};

export type PersistedMutationOutcome = {
  operationSucceeded: boolean;
  announceSuccess: boolean;
  partialFailure: boolean;
};

export type SnapshotPersistenceOutcome = PersistedMutationOutcome & {
  primarySaved: boolean;
  lastKnownGoodSaved: boolean;
};

export function getPersistedMutationOutcome(
  dataSaved: boolean,
  followUpSucceeded: boolean,
): PersistedMutationOutcome {
  return {
    operationSucceeded: dataSaved,
    announceSuccess: dataSaved && followUpSucceeded,
    partialFailure: dataSaved && !followUpSucceeded,
  };
}

/** 본문과 최근 정상 저장본을 별도 단계로 기록한 결과를 정확히 구분해요. */
export function getSnapshotPersistenceOutcome(
  primarySaved: boolean,
  lastKnownGoodSaved: boolean,
): SnapshotPersistenceOutcome {
  return {
    primarySaved,
    lastKnownGoodSaved,
    ...getPersistedMutationOutcome(primarySaved, lastKnownGoodSaved),
  };
}

export type LatestStorageValueCoordinator = {
  getPersistedValue: () => string | null;
  setPersistedValue: (value: string | null) => void;
  writeLatest: (
    value: string,
    options?: { force?: boolean },
  ) => Promise<{ persistedValue: string; wrote: boolean }>;
};

// pending 문서는 최대 크기의 백업과 대상 본문을 JSON 문자열로 함께 담아요.
// 각 문자열이 바깥 JSON에서 한 번 더 escape될 수 있는 최악의 경우와
// 고정 메타데이터 여유를 합친 별도 상한으로, JSON 파싱 전 메모리 사용을 제한해요.
export const MAX_PENDING_RESTORE_DOCUMENT_BYTES =
  2 * (MAX_BACKUP_FILE_BYTES + MAX_APP_DATA_BYTES) + 4 * 1024;

function getCheckedPendingRestoreDocumentByteSize(contents: string): number {
  const size = getUtf8ByteLength(contents);
  if (size > MAX_PENDING_RESTORE_DOCUMENT_BYTES) {
    throw new Error('대기 중인 복원 백업 문서가 너무 커요.');
  }
  return size;
}

export type AppDataLoadResult =
  | {
      ok: true;
      data: AppData;
      source: 'empty' | 'reset' | 'stored' | 'migrated';
      persistedSnapshot: string | null;
    }
  | {
      ok: false;
      reason: 'recovery-required';
      error: string;
      corruptBackupKey: null;
      recovery: MissingPrimaryRecoveryCandidate;
    }
  | {
      ok: false;
      reason: 'io' | 'corrupt';
      error: string;
      corruptBackupKey: string | null;
    };

export type AppDataLoadFailureReason = Extract<
  AppDataLoadResult,
  { ok: false }
>['reason'];

export type MissingPrimaryRecoverySource =
  | 'device-safety'
  | 'last-known-good'
  | 'automatic';

export type MissingPrimaryRecoveryCandidate = {
  data: AppData;
  exportedAt: string | null;
  raw: string;
  source: MissingPrimaryRecoverySource;
};

export type AppDataLoadOptions = {
  missingPrimaryRecoveryCandidates?: readonly {
    raw: string;
    source: 'device-safety';
  }[];
};

/**
 * 손상 원본을 먼저 별도 보존한 경우에만 다른 안전 백업으로 본문을 교체할 수 있어요.
 * 일시적인 읽기 오류는 정상 원본이 남아 있을 수 있으므로 복구 대상으로 보지 않아요.
 */
export function canRecoverAppDataFromSafetyBackup(
  result: AppDataLoadResult,
): result is Extract<AppDataLoadResult, { ok: false }> & {
  reason: 'corrupt';
  corruptBackupKey: string;
} {
  return (
    !result.ok &&
    result.reason === 'corrupt' &&
    result.corruptBackupKey !== null
  );
}

export function createSerializedStorageWriter(storage: StorageAdapter): StorageWriter {
  let tail: Promise<void> = Promise.resolve();

  return {
    write(key, value) {
      const task = tail.then(() => storage.setItem(key, value));
      tail = task.catch(() => undefined);
      return task;
    },
    remove(key) {
      const task = tail.then(() =>
        storage.removeItem
          ? storage.removeItem(key)
          : storage.setItem(key, CLEARED_PENDING_RESTORE_BACKUP),
      );
      tail = task.catch(() => undefined);
      return task;
    },
  };
}

/**
 * Runs stateful app operations one at a time. A failed operation does not block
 * later work, and revisions let callers reject stale async results when needed.
 */
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
 * Keeps a storage key equal to the newest requested value, even when a value
 * changes A -> B -> A while the B write is still running.
 */
export function createLatestStorageValueCoordinator(
  writer: StorageWriter,
  key: string,
): LatestStorageValueCoordinator {
  let persistedValue: string | null = null;
  let latestRequest: { force: boolean; revision: number; value: string } | null = null;
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
        throw new Error('저장 완료 상태를 확인하지 못했어요.');
      }
      return { persistedValue, wrote: before !== persistedValue || force };
    },
  };
}

function corruptBackupKey(_now: Date): string {
  // 같은 키를 덮어써 손상 원본이 재시도할 때마다 무제한 누적되지 않게 해요.
  return APP_DATA_CORRUPT_BACKUP_KEY;
}

type ExplicitResetMarker = {
  format: typeof EXPLICIT_RESET_MARKER_FORMAT;
  version: 1;
  resetAt: string;
};

function isExplicitResetMarker(raw: string | null): boolean {
  if (raw === null || raw.length === 0) return false;
  try {
    getCheckedBackupContentsByteSize(raw);
    const parsed = JSON.parse(raw) as Partial<ExplicitResetMarker>;
    return (
      parsed.format === EXPLICIT_RESET_MARKER_FORMAT &&
      parsed.version === 1 &&
      typeof parsed.resetAt === 'string' &&
      Number.isFinite(Date.parse(parsed.resetAt))
    );
  } catch {
    return false;
  }
}

export async function writeExplicitResetMarker(
  writer: StorageWriter,
  now: Date = new Date(),
): Promise<void> {
  const marker: ExplicitResetMarker = {
    format: EXPLICIT_RESET_MARKER_FORMAT,
    version: 1,
    resetAt: now.toISOString(),
  };
  await writer.write(APP_DATA_EXPLICIT_RESET_MARKER_KEY, JSON.stringify(marker));
}

export async function clearExplicitResetMarker(
  writer: StorageWriter,
): Promise<void> {
  await writer.remove(APP_DATA_EXPLICIT_RESET_MARKER_KEY);
}

export async function hasExplicitResetMarker(
  storage: StorageAdapter,
): Promise<boolean> {
  return isExplicitResetMarker(
    await storage.getItem(APP_DATA_EXPLICIT_RESET_MARKER_KEY),
  );
}

function parseMissingPrimaryRecoveryCandidate(
  raw: string | null,
  source: MissingPrimaryRecoverySource,
): MissingPrimaryRecoveryCandidate | null {
  if (raw === null) return null;
  try {
    getCheckedBackupContentsByteSize(raw);
    const preview = previewAppDataImport(raw);
    return {
      data: withoutAlarmRuntimeState(preview.data),
      exportedAt: preview.exportedAt,
      raw,
      source,
    };
  } catch {
    return null;
  }
}

function recoveryCandidateTimestamp(candidate: MissingPrimaryRecoveryCandidate): number {
  if (candidate.exportedAt === null) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(candidate.exportedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

const RECOVERY_SOURCE_PRIORITY: Record<MissingPrimaryRecoverySource, number> = {
  'device-safety': 3,
  'last-known-good': 2,
  automatic: 1,
};

function selectNewestMissingPrimaryRecoveryCandidate(
  candidates: readonly MissingPrimaryRecoveryCandidate[],
): MissingPrimaryRecoveryCandidate | null {
  return (
    [...candidates].sort((left, right) => {
      const dateDifference =
        recoveryCandidateTimestamp(right) - recoveryCandidateTimestamp(left);
      if (dateDifference !== 0) return dateDifference;
      return RECOVERY_SOURCE_PRIORITY[right.source] - RECOVERY_SOURCE_PRIORITY[left.source];
    })[0] ?? null
  );
}

export async function loadAppDataFromStorage(
  storage: StorageAdapter,
  fallback: AppData = createDefaultAppData(),
  now: Date = new Date(),
  quarantine?: CorruptDataQuarantine,
  options?: AppDataLoadOptions,
): Promise<AppDataLoadResult> {
  let raw: string | null;
  try {
    raw = await storage.getItem(APP_DATA_STORAGE_KEY);
  } catch {
    return {
      ok: false,
      reason: 'io',
      error: '근무표를 불러오지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
      corruptBackupKey: null,
    };
  }

  if (raw === null) {
    let resetMarker: string | null;
    let lastKnownGood: string | null;
    let automaticBackup: string | null;
    try {
      [resetMarker, lastKnownGood, automaticBackup] = await Promise.all([
        storage.getItem(APP_DATA_EXPLICIT_RESET_MARKER_KEY),
        storage.getItem(APP_DATA_LAST_KNOWN_GOOD_KEY),
        storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY),
      ]);
    } catch {
      return {
        ok: false,
        reason: 'io',
        error: '저장된 근무표 상태를 확인하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
        corruptBackupKey: null,
      };
    }

    if (isExplicitResetMarker(resetMarker)) {
      return { ok: true, data: fallback, source: 'reset', persistedSnapshot: null };
    }

    const externalCandidates = (options?.missingPrimaryRecoveryCandidates ?? [])
      .map(({ raw: candidateRaw, source }) =>
        parseMissingPrimaryRecoveryCandidate(candidateRaw, source),
      )
      .filter((candidate): candidate is MissingPrimaryRecoveryCandidate =>
        candidate !== null,
      );
    const internalCandidates = [
      parseMissingPrimaryRecoveryCandidate(lastKnownGood, 'last-known-good'),
      parseMissingPrimaryRecoveryCandidate(automaticBackup, 'automatic'),
    ].filter((candidate): candidate is MissingPrimaryRecoveryCandidate =>
      candidate !== null,
    );
    const recovery = selectNewestMissingPrimaryRecoveryCandidate([
      ...externalCandidates,
      ...internalCandidates,
    ]);
    if (recovery !== null) {
      return {
        ok: false,
        reason: 'recovery-required',
        error: '저장된 근무표 본문은 없지만 최근 안전 백업이 남아 있어요. 복구하거나 새 근무표로 시작해 주세요.',
        corruptBackupKey: null,
        recovery,
      };
    }

    return { ok: true, data: fallback, source: 'empty', persistedSnapshot: null };
  }

  let parsed: ReturnType<typeof tryParseAppDataJson>;
  try {
    getCheckedAppDataContentsByteSize(raw);
    parsed = tryParseAppDataJson(raw);
  } catch (error) {
    parsed = {
      ok: false,
      error: error instanceof Error ? error : new Error('근무표 데이터가 너무 커요.'),
    };
  }
  if (parsed.ok) {
    const source = parsed.value.requiresPersistence ? 'migrated' : 'stored';
    return {
      ok: true,
      data: parsed.value.data,
      source,
      persistedSnapshot: source === 'stored' ? serializeAppData(parsed.value.data) : null,
    };
  }

  const independentLocation = quarantine
    ? await quarantine(raw, now).catch(() => null)
    : null;
  const backupKey = corruptBackupKey(now);
  try {
    await storage.setItem(backupKey, raw);
  } catch {
    if (independentLocation !== null) {
      return {
        ok: false,
        reason: 'corrupt',
        error: `${parsed.error.message} 손상된 원본은 별도 복구 파일에 보관했어요.`,
        corruptBackupKey: independentLocation,
      };
    }
    return {
      ok: false,
      reason: 'corrupt',
      error: `${parsed.error.message} 기존 저장 자료는 덮어쓰지 않았어요.`,
      corruptBackupKey: null,
    };
  }

  return {
    ok: false,
    reason: 'corrupt',
    error: `${parsed.error.message} 손상된 원본은 복구용으로 따로 보관했어요.`,
    corruptBackupKey: backupKey,
  };
}

export async function writeAutomaticBackup(
  writer: StorageWriter,
  data: AppData,
  now: Date = new Date(),
): Promise<string> {
  const backup = exportAppDataToJson(data, now, { pretty: false });
  getCheckedBackupContentsByteSize(backup);
  await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, backup);
  return backup;
}

export async function readAutomaticBackup(storage: StorageAdapter): Promise<string | null> {
  try {
    return await storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY);
  } catch {
    throw new Error('최근 안전 백업을 불러오지 못했어요.');
  }
}

export async function writeLastKnownGoodBackup(
  writer: StorageWriter,
  snapshot: string,
  now: Date = new Date(),
): Promise<string> {
  getCheckedAppDataContentsByteSize(snapshot);
  const parsed = tryParseAppDataJson(snapshot);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const backup = exportAppDataToJson(parsed.value.data, now, { pretty: false });
  getCheckedBackupContentsByteSize(backup);
  await writer.write(APP_DATA_LAST_KNOWN_GOOD_KEY, backup);
  return backup;
}

export type PersistSnapshotWithBackupResult = SnapshotPersistenceOutcome & {
  /** 이번 저장 처리에서 본문 내용이 실제로 달라졌는지 나타내요. */
  primaryChanged: boolean;
  persistedSnapshot: string | null;
  lastKnownGoodSnapshot: string | null;
};

/** 본문을 먼저 저장하고 최근 정상 저장본을 별도 단계로 안전하게 갱신해요. */
export async function persistSnapshotWithLastKnownGood(
  coordinator: LatestStorageValueCoordinator,
  writer: StorageWriter,
  snapshot: string,
  lastKnownGoodSnapshot: string | null,
  options?: { force?: boolean; now?: Date },
): Promise<PersistSnapshotWithBackupResult> {
  let preparedBackup: string;
  try {
    getCheckedAppDataContentsByteSize(snapshot);
    const parsed = tryParseAppDataJson(snapshot);
    if (!parsed.ok) throw parsed.error;
    preparedBackup = exportAppDataToJson(parsed.value.data, options?.now, {
      pretty: false,
    });
    // 본문을 쓰기 전에 안전 백업까지 기록 가능한지 함께 확인해
    // 크기 경계에서 본문만 저장되는 부분 성공을 막아요.
    getCheckedBackupContentsByteSize(preparedBackup);
  } catch {
    return {
      ...getSnapshotPersistenceOutcome(false, false),
      primaryChanged: false,
      persistedSnapshot: coordinator.getPersistedValue(),
      lastKnownGoodSnapshot,
    };
  }

  const previousPersistedSnapshot = coordinator.getPersistedValue();
  let persistedSnapshot: string;
  let wrotePrimary: boolean;
  let primaryChanged: boolean;
  try {
    const result = await coordinator.writeLatest(
      snapshot,
      options?.force === true ? { force: true } : undefined,
    );
    const resultChanged = previousPersistedSnapshot !== result.persistedValue;
    if (options?.force && result.persistedValue !== snapshot) {
      return {
        ...getSnapshotPersistenceOutcome(false, false),
        primaryChanged: resultChanged,
        persistedSnapshot: result.persistedValue,
        lastKnownGoodSnapshot,
      };
    }
    persistedSnapshot = result.persistedValue;
    wrotePrimary = result.wrote;
    primaryChanged = resultChanged;
  } catch {
    return {
      ...getSnapshotPersistenceOutcome(false, false),
      primaryChanged: false,
      persistedSnapshot: coordinator.getPersistedValue(),
      lastKnownGoodSnapshot,
    };
  }

  if (!wrotePrimary && lastKnownGoodSnapshot === persistedSnapshot) {
    return {
      ...getSnapshotPersistenceOutcome(true, true),
      primaryChanged,
      persistedSnapshot,
      lastKnownGoodSnapshot,
    };
  }

  try {
    // writeLatest는 더 최신 요청을 합칠 수 있으므로 실제 저장값이 달라졌다면
    // 해당 값으로 안전 백업을 다시 만들고 크기를 확인해요.
    const backup = persistedSnapshot === snapshot
      ? preparedBackup
      : exportAppDataToJson(
          (() => {
            const parsed = tryParseAppDataJson(persistedSnapshot);
            if (!parsed.ok) throw parsed.error;
            return parsed.value.data;
          })(),
          options?.now,
          { pretty: false },
        );
    getCheckedBackupContentsByteSize(backup);
    await writer.write(APP_DATA_LAST_KNOWN_GOOD_KEY, backup);
    return {
      ...getSnapshotPersistenceOutcome(true, true),
      primaryChanged,
      persistedSnapshot,
      lastKnownGoodSnapshot: persistedSnapshot,
    };
  } catch {
    return {
      ...getSnapshotPersistenceOutcome(true, false),
      primaryChanged,
      persistedSnapshot,
      lastKnownGoodSnapshot,
    };
  }
}

export async function readLastKnownGoodBackup(storage: StorageAdapter): Promise<string | null> {
  try {
    return await storage.getItem(APP_DATA_LAST_KNOWN_GOOD_KEY);
  } catch {
    throw new Error('최근 정상 저장본을 불러오지 못했어요.');
  }
}

/**
 * 최근 정상 저장본이 현재 본문과 같은 자료인지 확인해요.
 * 읽기 실패나 손상은 앱 시작을 막지 않고 새 정상 저장본 생성 대상으로 처리해요.
 */
export async function findMatchingLastKnownGoodSnapshot(
  storage: StorageAdapter,
  persistedSnapshot: string | null,
): Promise<string | null> {
  if (persistedSnapshot === null) return null;

  let raw: string | null;
  try {
    raw = await storage.getItem(APP_DATA_LAST_KNOWN_GOOD_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const backupSnapshot = serializeAppData(previewAppDataImport(raw).data);
    return backupSnapshot === persistedSnapshot ? persistedSnapshot : null;
  } catch {
    return null;
  }
}

type PendingRestoreBackupPhase = 'prepared' | 'committed';

export type PendingRestoreBackupRecoveryState =
  | 'committed'
  | 'target-matched'
  | 'source-matched'
  | 'diverged';

export type PendingRestoreBackupDocument = {
  format: 'alarmpyo-pending-restore-backup';
  version: 1;
  phase: PendingRestoreBackupPhase;
  createdAt: string;
  backup: string;
  targetSnapshot: string;
};

export type PendingRestoreBackup = PendingRestoreBackupDocument & {
  recoveryState: PendingRestoreBackupRecoveryState;
};

export type RestoreWithAutomaticBackupResult<T> = {
  restoreStarted: boolean;
  restoreResult: T | null;
  automaticBackupSaved: boolean;
  pendingBackupAvailable: boolean;
};

export type PendingRestoreBackupRetryResult =
  | { status: 'saved' }
  | { status: 'unavailable' }
  | { status: 'confirmation-required' }
  | { status: 'failed' };

function normalizedRestoreSnapshot(data: AppData): string {
  return serializeAppData(withoutAlarmRuntimeState(data));
}

function parsePendingRestoreBackup(
  raw: string | null,
): PendingRestoreBackupDocument | null {
  if (raw === null || raw === CLEARED_PENDING_RESTORE_BACKUP) return null;
  try {
    getCheckedPendingRestoreDocumentByteSize(raw);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Partial<PendingRestoreBackupDocument>;
    if (
      candidate.format !== 'alarmpyo-pending-restore-backup' ||
      candidate.version !== 1 ||
      (candidate.phase !== 'prepared' && candidate.phase !== 'committed') ||
      typeof candidate.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.createdAt)) ||
      typeof candidate.backup !== 'string' ||
      typeof candidate.targetSnapshot !== 'string'
    ) {
      return null;
    }
    getCheckedBackupContentsByteSize(candidate.backup);
    getCheckedAppDataContentsByteSize(candidate.targetSnapshot);
    previewAppDataImport(candidate.backup);
    const target = tryParseAppDataJson(candidate.targetSnapshot);
    if (!target.ok) return null;
    return candidate as PendingRestoreBackupDocument;
  } catch {
    return null;
  }
}

function serializePendingRestoreBackup(
  document: PendingRestoreBackupDocument,
): string {
  getCheckedBackupContentsByteSize(document.backup);
  getCheckedAppDataContentsByteSize(document.targetSnapshot);
  const serialized = JSON.stringify(document);
  getCheckedPendingRestoreDocumentByteSize(serialized);
  return serialized;
}

function pendingRestoreBackupDocument(
  pending: PendingRestoreBackup,
): PendingRestoreBackupDocument {
  const { recoveryState: _recoveryState, ...document } = pending;
  return document;
}

export async function clearPendingRestoreBackup(
  writer: StorageWriter,
): Promise<void> {
  try {
    await writer.remove(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
  } catch {
    // 일부 저장소는 삭제만 실패할 수 있어요. 빈 tombstone으로 한 번 더 지워
    // 이미 승격한 백업이 나중에 오래된 pending으로 다시 나타나지 않게 해요.
    await writer.write(
      APP_DATA_PENDING_RESTORE_BACKUP_KEY,
      CLEARED_PENDING_RESTORE_BACKUP,
    );
  }
}

function getPendingRestoreBackupRecoveryState(
  pending: PendingRestoreBackupDocument,
  currentData: AppData,
): PendingRestoreBackupRecoveryState {
  if (pending.phase === 'committed') return 'committed';

  const currentSnapshot = normalizedRestoreSnapshot(currentData);
  if (currentSnapshot === pending.targetSnapshot) return 'target-matched';

  const sourceSnapshot = normalizedRestoreSnapshot(
    previewAppDataImport(pending.backup).data,
  );
  return currentSnapshot === sourceSnapshot ? 'source-matched' : 'diverged';
}

/**
 * 별도 키에 남아 있는 복원 전 백업과 현재 영속 본문의 관계를 확인해요.
 * prepared가 현재 본문과 다르더라도 숨기지 않고 diverged로 남겨, 원본은
 * 보존하되 복원이 완료됐다고 자동으로 오인하지 않게 해요.
 */
export async function readPendingRestoreBackup(
  storage: StorageAdapter,
  currentData: AppData,
): Promise<PendingRestoreBackup | null> {
  let pendingRaw: string | null;
  try {
    pendingRaw = await storage.getItem(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
  } catch {
    throw new Error('대기 중인 복원 전 백업을 확인하지 못했어요.');
  }
  const pending = parsePendingRestoreBackup(pendingRaw);
  if (pending === null) return null;

  try {
    const automaticBackup = await storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY);
    if (automaticBackup === pending.backup) return null;
  } catch {
    // 자동 백업 확인이 실패해도 별도 키의 복원 전 스냅샷은 유지해요.
  }

  return {
    ...pending,
    recoveryState: getPendingRestoreBackupRecoveryState(pending, currentData),
  };
}

/** 앱이 복원 도중 종료돼도 prepared 스냅샷을 현재 본문과 비교해 안전하게 복구해요. */
export async function reconcilePendingRestoreBackup(
  storage: StorageAdapter,
  writer: StorageWriter,
  currentData: AppData,
): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await storage.getItem(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
  } catch {
    return false;
  }
  const pending = parsePendingRestoreBackup(raw);
  if (pending === null) return false;

  try {
    if ((await storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY)) === pending.backup) {
      try {
        await clearPendingRestoreBackup(writer);
      } catch {
        // 자동 백업은 이미 완성됐으므로 pending 정리 실패가 앱 로드를 막지 않아요.
      }
      return false;
    }
  } catch {
    // 자동 백업 확인 실패와 관계없이 pending 자체를 판별해요.
  }

  if (pending.phase === 'committed') return true;

  const recoveryState = getPendingRestoreBackupRecoveryState(pending, currentData);
  if (recoveryState === 'target-matched') {
    try {
      await writer.write(
        APP_DATA_PENDING_RESTORE_BACKUP_KEY,
        serializePendingRestoreBackup({ ...pending, phase: 'committed' }),
      );
      return true;
    } catch {
      // committed 기록이 막혀도 원본을 자동 백업 슬롯에 승격할 수 있으면
      // 다음 편집 전에 거래를 안전하게 끝낼 수 있어요.
    }
    try {
      await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, pending.backup);
      try {
        await clearPendingRestoreBackup(writer);
      } catch {
        // 자동 백업이 이미 원본을 보존하므로 pending 정리 실패는 안전해요.
      }
      return false;
    } catch {
      // 두 기록이 모두 실패하면 prepared를 그대로 두고 다음 실행에서 재시도해요.
    }
    return true;
  }

  if (recoveryState === 'source-matched') {
    try {
      await clearPendingRestoreBackup(writer);
      return false;
    } catch {
      // 삭제할 수 없으면 이후 편집 전에 다시 정리하도록 pending을 유지해요.
      return true;
    }
  }

  // 현재 본문만으로 복원 완료 여부를 증명할 수 없어요. 원본은 그대로
  // 보존하고 사용자 확인 없이 committed나 자동 백업으로 승격하지 않아요.
  return true;
}

/**
 * prepared 거래의 증거가 다음 본문 저장으로 사라지기 전에 원본 보호 상태를
 * 확정해요. 확정 기록과 자동 백업이 모두 실패하면 다음 본문 저장을 막아요.
 */
export async function protectPendingRestoreBackupBeforeDataChange(
  storage: StorageAdapter,
  writer: StorageWriter,
  currentData: AppData,
  nextData: AppData,
): Promise<boolean> {
  const currentSnapshot = normalizedRestoreSnapshot(currentData);
  const nextSnapshot = normalizedRestoreSnapshot(nextData);
  if (currentSnapshot === nextSnapshot) return true;

  const pending = await readPendingRestoreBackup(storage, currentData);
  if (pending === null || pending.recoveryState === 'committed') return true;

  if (pending.recoveryState === 'target-matched') {
    try {
      await writer.write(
        APP_DATA_PENDING_RESTORE_BACKUP_KEY,
        serializePendingRestoreBackup({
          ...pendingRestoreBackupDocument(pending),
          phase: 'committed',
        }),
      );
      return true;
    } catch {
      // pending 키가 일시적으로 막혀 있으면 자동 백업 슬롯으로 한 번 더 보호해요.
    }
    try {
      await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, pending.backup);
      try {
        await clearPendingRestoreBackup(writer);
      } catch {
        // 자동 백업에 원본이 있으므로 다음 저장을 진행해도 안전해요.
      }
      return true;
    } catch {
      return false;
    }
  }

  if (pending.recoveryState === 'source-matched') {
    // source -> target 저장은 준비된 복원 자체예요. 그 외 변경은 먼저
    // 준비 문서를 확실히 정리해야 나중에 복원 성공으로 오인하지 않아요.
    if (nextSnapshot === pending.targetSnapshot) return true;
    try {
      await clearPendingRestoreBackup(writer);
      return true;
    } catch {
      return false;
    }
  }

  // 이전 버전에서 이미 본문이 달라진 prepared는 원본을 별도 키에 계속
  // 보존하고 화면에 확인 대상으로 노출해요. 여기서 상태를 추측해 바꾸지 않아요.
  return true;
}

/** 대기 중인 복원 전 스냅샷을 최근 자동 백업 슬롯에 다시 저장해요. */
export async function retryPendingRestoreBackupCommit(
  storage: StorageAdapter,
  writer: StorageWriter,
  currentData: AppData,
  options?: { allowUnverified?: boolean },
): Promise<PendingRestoreBackupRetryResult> {
  const pending = await readPendingRestoreBackup(storage, currentData);
  if (pending === null) return { status: 'unavailable' };
  if (
    (pending.recoveryState === 'source-matched' ||
      pending.recoveryState === 'diverged') &&
    options?.allowUnverified !== true
  ) {
    return { status: 'confirmation-required' };
  }

  try {
    await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, pending.backup);
  } catch {
    return { status: 'failed' };
  }

  try {
    await clearPendingRestoreBackup(writer);
  } catch {
    // 자동 백업은 이미 저장됐으므로 다음 조회에서 같은 원본임을 확인해 숨겨요.
  }
  return { status: 'saved' };
}

/**
 * 복원 전 현재 상태를 별도 키에 먼저 영속화하고 본문을 복원해요.
 * 자동 백업 슬롯 갱신이 실패해도 별도 키를 남겨 다음 실행에서 다시 시도할 수 있어요.
 */
export async function restoreWithAutomaticBackupCommit<
  T extends { primarySaved: boolean },
>(
  writer: StorageWriter,
  currentData: AppData,
  targetData: AppData,
  restore: () => Promise<T>,
  now: Date = new Date(),
): Promise<RestoreWithAutomaticBackupResult<T>> {
  const prepared: PendingRestoreBackupDocument = {
    format: 'alarmpyo-pending-restore-backup',
    version: 1,
    phase: 'prepared',
    createdAt: now.toISOString(),
    backup: exportAppDataToJson(currentData, now),
    targetSnapshot: normalizedRestoreSnapshot(targetData),
  };

  try {
    await writer.write(
      APP_DATA_PENDING_RESTORE_BACKUP_KEY,
      serializePendingRestoreBackup(prepared),
    );
  } catch {
    return {
      restoreStarted: false,
      restoreResult: null,
      automaticBackupSaved: false,
      pendingBackupAvailable: false,
    };
  }

  let restoreResult: T;
  try {
    restoreResult = await restore();
  } catch {
    // 콜백이 본문 저장 뒤 실패했을 수도 있으므로 prepared 스냅샷을 지우지 않아요.
    return {
      restoreStarted: true,
      restoreResult: null,
      automaticBackupSaved: false,
      pendingBackupAvailable: true,
    };
  }
  if (!restoreResult.primarySaved) {
    try {
      await clearPendingRestoreBackup(writer);
    } catch {
      // prepared 상태는 목표 본문과 다르면 재시도 대상으로 노출하지 않아요.
    }
    return {
      restoreStarted: true,
      restoreResult,
      automaticBackupSaved: false,
      pendingBackupAvailable: false,
    };
  }

  const committed = { ...prepared, phase: 'committed' as const };
  try {
    await writer.write(
      APP_DATA_PENDING_RESTORE_BACKUP_KEY,
      serializePendingRestoreBackup(committed),
    );
  } catch {
    // prepared 상태라도 현재 본문이 목표와 같으면 재시도 대상으로 복구할 수 있어요.
  }

  try {
    await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, prepared.backup);
  } catch {
    return {
      restoreStarted: true,
      restoreResult,
      automaticBackupSaved: false,
      pendingBackupAvailable: true,
    };
  }

  try {
    await clearPendingRestoreBackup(writer);
  } catch {
    // 자동 백업은 이미 저장됐으므로 남은 pending 키는 무해해요.
  }
  return {
    restoreStarted: true,
    restoreResult,
    automaticBackupSaved: true,
    pendingBackupAvailable: false,
  };
}

/**
 * 최근 정상 저장본이 손상됐거나 읽히지 않을 때 초기화 전 자동 백업으로 이어서 복구해요.
 */
export async function readRecoveryBackup(storage: StorageAdapter): Promise<string | null> {
  try {
    const lastKnownGood = await readLastKnownGoodBackup(storage);
    if (lastKnownGood !== null) {
      try {
        previewAppDataImport(lastKnownGood);
        return lastKnownGood;
      } catch {
        // 더 오래된 자동 백업이 정상이라면 계속 복구할 수 있어요.
      }
    }
  } catch {
    // 최근 정상 저장본 키를 읽지 못해도 자동 백업을 확인해요.
  }

  const automaticBackup = await readAutomaticBackup(storage);
  if (automaticBackup !== null) previewAppDataImport(automaticBackup);
  return automaticBackup;
}
