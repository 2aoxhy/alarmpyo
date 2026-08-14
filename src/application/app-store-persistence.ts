import type { AppData } from '../models/app-data';
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

export async function clearSetupDraftBeforeApplyingReset(
  clearDraft: () => Promise<void>,
): Promise<void> {
  try {
    await clearDraft();
  } catch {
    throw new Error('초기 설정 임시 저장을 지우지 못했어요.');
  }
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

export function getSleepReminderSyncModeForAppState(
  previousState: string,
  nextState: string,
): 'force' | null {
  if (nextState === 'active') {
    return previousState === 'active' ? null : 'force';
  }
  // 백그라운드 전환은 Provider의 저장 flush가 같은 canonical snapshot을
  // 영속화한 뒤 수면 계획까지 동기화해요. 여기서 별도 동기화를 예약하면
  // 저장 실패 뒤에도 네이티브 계획만 앞서갈 수 있어요.
  return null;
}
