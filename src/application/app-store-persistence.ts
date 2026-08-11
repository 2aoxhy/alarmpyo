import type { AppData } from '../models/app-data';
import { getAlarmScheduleSignature } from '../services/alarm-schedule-signature';
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

export type DeviceBackupResult<T extends PersistedMutationOutcome> = T & {
  deviceBackupSaved: boolean;
};

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
