import type { AppData } from '../models/app-data';
import { withoutAlarmRuntimeState } from '../services/app-data-service';
import { getAlarmScheduleSignature } from '../services/alarm-schedule-signature';
import { getSleepReminderScheduleSignature } from '../services/sleep-reminder-planner';
import {
  getPersistedMutationOutcome,
  type PersistedMutationOutcome,
} from '../services/app-storage-service';

export type DataReplacementResult = {
  primarySaved: boolean;
  operationSucceeded: boolean;
  announceSuccess: boolean;
  partialFailure: boolean;
};

export type ResetAllDataResult =
  | { status: 'success'; dataReset: true }
  | { status: 'partial'; dataReset: true; reason: 'follow-up-failed' }
  | {
      status: 'failure';
      dataReset: false;
      reason: 'backup-failed' | 'reset-failed';
    };

export type DeviceBackupResult<T extends PersistedMutationOutcome> = T & {
  deviceBackupSaved: boolean;
};

export type LatestCanonicalSleepSyncResult<TSnapshot, TPersistence> = {
  canonicalSnapshot: TSnapshot;
  persistence: TPersistence;
  sleepReminderSyncSucceeded: boolean | null;
};

export function applyCanonicalSnapshotIfSourceIsCurrent<TSnapshot>({
  sourceSnapshot,
  canonicalSnapshot,
  getCurrentSnapshot,
  applyCanonicalSnapshot,
}: {
  sourceSnapshot: TSnapshot;
  canonicalSnapshot: TSnapshot;
  getCurrentSnapshot: () => TSnapshot;
  applyCanonicalSnapshot: (snapshot: TSnapshot) => void;
}): boolean {
  if (!Object.is(getCurrentSnapshot(), sourceSnapshot)) return false;
  applyCanonicalSnapshot(canonicalSnapshot);
  return true;
}

export function shouldSkipAutomaticSaveForAppliedCanonicalSnapshot<TSnapshot>(
  currentSnapshot: TSnapshot,
  appliedCanonicalSnapshot: TSnapshot | null,
): boolean {
  return (
    appliedCanonicalSnapshot !== null &&
    Object.is(currentSnapshot, appliedCanonicalSnapshot)
  );
}

/**
 * 자동 저장의 dirty 판정에서 네이티브 예약 조회로만 바뀌는 런타임 메타데이터는
 * 제외합니다. 사용자가 바꿀 수 있는 자료는 모두 포함하므로 명시 저장 직후의
 * 동일 자료만 후속 debounce에서 건너뜁니다.
 */
export function getAutomaticSaveContentSignature(data: AppData): string {
  return JSON.stringify(withoutAlarmRuntimeState(data));
}

export function shouldFlushAutomaticSave(
  currentSignature: string,
  persistedSignature: string | null,
): boolean {
  return persistedSignature === null || currentSignature !== persistedSignature;
}

export function getSleepReminderProjectionKey(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('수면 알림 계산 기준 시각이 올바르지 않습니다.');
  }
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    // IANA 시간대를 제공하지 않는 구형 런타임은 offset으로 구분합니다.
  }
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + 14);
  return [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    timeZone,
    now.getTimezoneOffset(),
    horizonEnd.getTimezoneOffset(),
  ].join('|');
}

export function shouldSkipEquivalentExplicitSave({
  currentSnapshot,
  nextSnapshot,
  forceAlarmSync,
  hasPersistenceCallback,
  hasPendingSaveRetry,
}: {
  currentSnapshot: string;
  nextSnapshot: string;
  forceAlarmSync: boolean;
  hasPersistenceCallback: boolean;
  hasPendingSaveRetry: boolean;
}): boolean {
  return (
    currentSnapshot === nextSnapshot &&
    !forceAlarmSync &&
    !hasPersistenceCallback &&
    !hasPendingSaveRetry
  );
}

/**
 * Reads the latest state only when the serialized flush actually starts, then
 * passes the same canonical object to persistence and native sleep scheduling.
 */
export async function persistLatestCanonicalSnapshotAndSyncSleep<
  TSnapshot,
  TPersistence,
>({
  getLatestCanonicalSnapshot,
  persist,
  isPersistenceComplete,
  syncSleepReminders,
}: {
  getLatestCanonicalSnapshot: () => TSnapshot;
  persist: (snapshot: TSnapshot) => Promise<TPersistence>;
  isPersistenceComplete: (result: TPersistence) => boolean;
  syncSleepReminders: (snapshot: TSnapshot) => Promise<boolean>;
}): Promise<LatestCanonicalSleepSyncResult<TSnapshot, TPersistence>> {
  const canonicalSnapshot = getLatestCanonicalSnapshot();
  const persistence = await persist(canonicalSnapshot);
  if (!isPersistenceComplete(persistence)) {
    return {
      canonicalSnapshot,
      persistence,
      sleepReminderSyncSucceeded: null,
    };
  }
  return {
    canonicalSnapshot,
    persistence,
    sleepReminderSyncSucceeded: await syncSleepReminders(canonicalSnapshot),
  };
}

export function shouldClearSleepReminderSaveError({
  failureRevision,
  currentRevision,
  currentIssueCode,
}: {
  failureRevision: number | null;
  currentRevision: number;
  currentIssueCode: string | null;
}): boolean {
  return (
    failureRevision !== null &&
    failureRevision === currentRevision &&
    currentIssueCode === 'sleep-reminder-sync-failed'
  );
}

/** 본문 저장과 기기 파일 복사본의 결과를 하나의 부분 실패 상태로 합쳐요. */
export function withDeviceBackupResult<T extends PersistedMutationOutcome>(
  outcome: T,
  deviceBackupSaved: boolean,
): DeviceBackupResult<T> {
  return {
    ...outcome,
    announceSuccess: outcome.announceSuccess && deviceBackupSaved,
    partialFailure:
      outcome.partialFailure ||
      (outcome.operationSucceeded && !deviceBackupSaved),
    deviceBackupSaved,
  };
}

export function createDataReplacementResult({
  primarySaved,
  dataApplied,
  followUpSucceeded,
}: {
  primarySaved: boolean;
  dataApplied: boolean;
  followUpSucceeded: boolean;
}): DataReplacementResult {
  return {
    primarySaved,
    ...getPersistedMutationOutcome(
      dataApplied,
      dataApplied && followUpSucceeded,
    ),
  };
}

export function getResetAllDataResult(
  outcome: DataReplacementResult,
): ResetAllDataResult {
  if (!outcome.primarySaved) {
    return { status: 'failure', dataReset: false, reason: 'reset-failed' };
  }
  if (!outcome.operationSucceeded || outcome.partialFailure) {
    return { status: 'partial', dataReset: true, reason: 'follow-up-failed' };
  }
  return { status: 'success', dataReset: true };
}

export function shouldSyncAlarmsAfterReplacement({
  current,
  next,
  failedSignature,
  force,
}: {
  current: AppData;
  next: AppData;
  failedSignature: string | null;
  force: boolean;
}): boolean {
  const nextSignature = getAlarmScheduleSignature(next);
  return (
    force ||
    getAlarmScheduleSignature(current) !== nextSignature ||
    failedSignature === nextSignature
  );
}

export function shouldSyncSleepRemindersAfterReplacement({
  current,
  next,
  lastSyncedSignature,
  failedSignature,
  force,
}: {
  current: AppData;
  next: AppData;
  lastSyncedSignature: string | null;
  failedSignature: string | null;
  force: boolean;
}): boolean {
  const nextSignature = getSleepReminderScheduleSignature(next);
  return (
    force ||
    getSleepReminderScheduleSignature(current) !== nextSignature ||
    lastSyncedSignature !== nextSignature ||
    failedSignature === nextSignature
  );
}
