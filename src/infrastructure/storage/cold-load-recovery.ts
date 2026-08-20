import type { AppData } from '../../models/app-data';
import {
  createDefaultAppData,
  previewAppDataImport,
  serializeAppData,
  tryParseAppDataJson,
  withoutAlarmRuntimeState,
} from '../../services/app-data-service';
import {
  getCheckedAppDataContentsByteSize,
  getCheckedBackupContentsByteSize,
} from '../../services/backup-file-policy';
import {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_CORRUPT_BACKUP_KEY,
  APP_DATA_EXPLICIT_RESET_MARKER_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
  APP_DATA_STORAGE_KEY,
} from './app-data-storage-keys';
import type { StorageAdapter, StorageWriter } from './serialized-storage';

const EXPLICIT_RESET_MARKER_FORMAT = 'alarmpyo-explicit-reset';

export type CorruptDataQuarantine = (
  raw: string,
  now: Date,
) => Promise<string | null>;


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
      error: '근무표를 불러오지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
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
        error: '저장된 근무표 상태를 확인하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
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
        error: '저장된 근무표 본문은 없지만 최근 안전 백업이 남아 있습니다. 복구하거나 새 근무표로 시작해야 합니다.',
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
      error: error instanceof Error ? error : new Error('근무표 데이터가 너무 큽니다.'),
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
        error: `${parsed.error.message} 손상된 원본은 별도 복구 파일에 보관했습니다.`,
        corruptBackupKey: independentLocation,
      };
    }
    return {
      ok: false,
      reason: 'corrupt',
      error: `${parsed.error.message} 기존 저장 자료는 덮어쓰지 않았습니다.`,
      corruptBackupKey: null,
    };
  }

  return {
    ok: false,
    reason: 'corrupt',
    error: `${parsed.error.message} 손상된 원본은 복구용으로 따로 보관했습니다.`,
    corruptBackupKey: backupKey,
  };
}
