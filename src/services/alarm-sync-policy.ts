import { toDateKey } from '../utils/date';
import type { AlarmPyoAlarmPlan } from './alarm-planner';

export const MAX_NATIVE_SCHEDULED_ALARMS = 3;
export const ALARM_RESYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ALARM_DELIVERY_RETRY_GRACE_MS = 30 * 60 * 1000;
const ALARM_EARLY_DELIVERY_TOLERANCE_MS = 60 * 1000;

export type AlarmAutoCheckStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'recovered'
  | 'needs-access'
  | 'error';

export function resolveCompletedAlarmAutoCheckStatus({
  accessMissing,
  repairNeeded,
  success,
  synchronized,
}: {
  accessMissing: boolean;
  repairNeeded: boolean;
  success: boolean;
  synchronized: boolean;
}): AlarmAutoCheckStatus {
  if (!success) return 'error';
  if (accessMissing) return 'needs-access';
  return synchronized && repairNeeded ? 'recovered' : 'ready';
}

export function shouldBlockAutomaticAlarmRepair({
  exactAlarmAllowed,
  notificationsEnabled,
  supported,
}: {
  exactAlarmAllowed: boolean;
  notificationsAllowed: boolean;
  notificationsEnabled: boolean;
  supported: boolean;
}): boolean {
  return (
    notificationsEnabled &&
    (!supported || !exactAlarmAllowed)
  );
}

export function markAlarmDisableSyncPending({
  scheduledNotificationCount,
}: {
  scheduledNotificationCount: number;
  lastNotificationSyncAt: string | null;
}): {
  scheduledNotificationCount: number;
  lastNotificationSyncAt: null;
} {
  // 네이티브 empty-plan 동기화가 성공하기 전에는 예약 0개를 단정하지 않아요.
  // 기존 개수와 미확인 시각을 저장해야 앱 복귀 시 취소를 다시 시도할 수 있어요.
  return {
    scheduledNotificationCount,
    lastNotificationSyncAt: null,
  };
}

export type AlarmScheduleCountInput = {
  actualScheduledCount: number;
  exactAlarmAllowed: boolean;
  notificationsAllowed: boolean;
  plannedAlarmCount: number;
};

/**
 * JS 계획은 네이티브가 다음 근무를 자동 보충할 수 있도록 366일치를 전달하지만,
 * Android AlarmManager에는 배터리 사용을 줄이기 위해 가장 가까운 3개만 올려요.
 * 따라서 동기화 성공 여부는 전체 계획 수가 아닌 실제 예약 상한과 비교해야 해요.
 */
export function getExpectedNativeScheduledAlarmCount({
  exactAlarmAllowed,
  plannedAlarmCount,
}: Omit<AlarmScheduleCountInput, 'actualScheduledCount'>): number {
  return exactAlarmAllowed
    ? Math.min(MAX_NATIVE_SCHEDULED_ALARMS, Math.max(0, plannedAlarmCount))
    : 0;
}

export function isAlarmPyoAlarmScheduleSynchronized(
  input: AlarmScheduleCountInput,
): boolean {
  return input.actualScheduledCount === getExpectedNativeScheduledAlarmCount(input);
}

export function isAlarmPyoAlarmPlanContentSynchronized({
  actualScheduledAlarms,
  exactAlarmAllowed,
  notificationsAllowed,
  plannedAlarms,
}: {
  actualScheduledAlarms: readonly AlarmPyoAlarmPlan[];
  exactAlarmAllowed: boolean;
  notificationsAllowed: boolean;
  plannedAlarms: readonly AlarmPyoAlarmPlan[];
}): boolean {
  if (!exactAlarmAllowed) return true;

  const sortAlarms = (alarms: readonly AlarmPyoAlarmPlan[]) =>
    [...alarms]
      .sort((left, right) => {
        const timeDifference = left.alarmAt - right.alarmAt;
        return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id);
      })
      .slice(0, MAX_NATIVE_SCHEDULED_ALARMS);
  const actual = sortAlarms(actualScheduledAlarms);
  const expected = sortAlarms(plannedAlarms);
  if (actual.length !== expected.length) return false;

  return actual.every((alarm, index) => {
    const planned = expected[index];
    return (
      alarm.id === planned.id &&
      alarm.dateKey === planned.dateKey &&
      alarm.shiftTypeId === planned.shiftTypeId &&
      alarm.shiftName === planned.shiftName &&
      alarm.alarmAt === planned.alarmAt &&
      alarm.startMinutes === planned.startMinutes &&
      alarm.alarmMinutesBefore === planned.alarmMinutesBefore
    );
  });
}

function sameAlarmMetadata(left: AlarmPyoAlarmPlan, right: AlarmPyoAlarmPlan): boolean {
  return (
    left.id === right.id &&
    left.dateKey === right.dateKey &&
    left.shiftTypeId === right.shiftTypeId &&
    left.shiftName === right.shiftName &&
    left.startMinutes === right.startMinutes &&
    left.alarmMinutesBefore === right.alarmMinutesBefore
  );
}

function sortedNativeAlarms(alarms: readonly AlarmPyoAlarmPlan[]): AlarmPyoAlarmPlan[] {
  return [...alarms]
    .sort((left, right) => {
      const timeDifference = left.alarmAt - right.alarmAt;
      return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id);
    })
    .slice(0, MAX_NATIVE_SCHEDULED_ALARMS);
}

/**
 * 현재 APK는 전달 실패 재시도의 originalAlarmAt과 deliveryAttempt를 JS에 노출하지 않아요.
 * 대신 재시도는 원래 계획의 ID와 근무 메타데이터를 유지하고 alarmAt만 30분 안에서
 * 뒤로 이동하므로, 이 조건을 모두 만족할 때만 수동 앱 복귀 동기화를 잠시 보류해요.
 */
export function canPreserveActiveAlarmDeliveryRetry({
  actualScheduledAlarms,
  actualScheduledCount,
  exactAlarmAllowed,
  force,
  notificationsAllowed,
  now,
  plannedAlarms,
  recentPlannedAlarms,
  retryPending,
  scheduleChanged,
}: {
  actualScheduledAlarms: readonly AlarmPyoAlarmPlan[];
  actualScheduledCount: number;
  exactAlarmAllowed: boolean;
  force: boolean;
  notificationsAllowed: boolean;
  now: Date;
  plannedAlarms: readonly AlarmPyoAlarmPlan[];
  recentPlannedAlarms: readonly AlarmPyoAlarmPlan[];
  retryPending: boolean;
  scheduleChanged: boolean;
}): boolean {
  if (
    force ||
    retryPending ||
    scheduleChanged ||
    !exactAlarmAllowed ||
    !notificationsAllowed ||
    actualScheduledCount !== actualScheduledAlarms.length
  ) {
    return false;
  }

  const nowTimestamp = now.getTime();
  if (!Number.isFinite(nowTimestamp)) return false;

  const recentById = new Map(recentPlannedAlarms.map((alarm) => [alarm.id, alarm]));
  const activeRetries = actualScheduledAlarms.filter((actual) => {
    const original = recentById.get(actual.id);
    if (!original || !sameAlarmMetadata(actual, original)) return false;
    return (
      original.alarmAt >= nowTimestamp - ALARM_DELIVERY_RETRY_GRACE_MS &&
      original.alarmAt <= nowTimestamp + ALARM_EARLY_DELIVERY_TOLERANCE_MS &&
      actual.alarmAt > original.alarmAt &&
      actual.alarmAt <= original.alarmAt + ALARM_DELIVERY_RETRY_GRACE_MS
    );
  });
  if (activeRetries.length === 0) return false;

  const retryIds = new Set(activeRetries.map((alarm) => alarm.id));
  const expected = sortedNativeAlarms([
    ...activeRetries,
    ...plannedAlarms.filter((alarm) => !retryIds.has(alarm.id)),
  ]);
  const actual = sortedNativeAlarms(actualScheduledAlarms);
  if (expected.length !== actual.length) return false;

  return actual.every((alarm, index) => {
    const expectedAlarm = expected[index];
    return sameAlarmMetadata(alarm, expectedAlarm) && alarm.alarmAt === expectedAlarm.alarmAt;
  });
}

export type AlarmResumeSyncPolicyInput = {
  actualScheduledCount: number;
  exactAlarmAllowed: boolean;
  notificationsAllowed: boolean;
  plannedAlarmCount: number;
  storedScheduledCount: number;
  lastSyncAt: string | null;
  now: Date;
  previousTimeZoneOffset: number;
};

export type AlarmSnapshotSyncPolicyInput = AlarmResumeSyncPolicyInput & {
  force: boolean;
  retryPending: boolean;
  scheduleChanged: boolean;
};

export function canSkipDisabledAlarmStatusCheck({
  notificationsEnabled,
  storedScheduledCount,
  lastSyncAt,
}: {
  notificationsEnabled: boolean;
  storedScheduledCount: number;
  lastSyncAt: string | null;
}): boolean {
  return !notificationsEnabled && storedScheduledCount === 0 && lastSyncAt !== null;
}

/**
 * 앱 복귀 시 네이티브에 366일 안전 계획을 다시 전달해야 하는지 판단해요.
 * 전체 화면 권한은 예약 가능 여부와 별개이므로 동기화 반복 조건에 넣지 않아요.
 */
export function shouldSyncAlarmPyoAlarmsOnResume({
  actualScheduledCount,
  exactAlarmAllowed,
  notificationsAllowed,
  plannedAlarmCount,
  storedScheduledCount,
  lastSyncAt,
  now,
  previousTimeZoneOffset,
}: AlarmResumeSyncPolicyInput): boolean {
  if (storedScheduledCount !== actualScheduledCount) return true;

  if (!isAlarmPyoAlarmScheduleSynchronized({
    actualScheduledCount,
    exactAlarmAllowed,
    notificationsAllowed,
    plannedAlarmCount,
  })) return true;

  const previousSync = lastSyncAt ? new Date(lastSyncAt) : null;
  if (!previousSync || Number.isNaN(previousSync.getTime())) return true;
  if (now.getTimezoneOffset() !== previousTimeZoneOffset) return true;
  if (toDateKey(previousSync) !== toDateKey(now)) return true;

  const elapsed = now.getTime() - previousSync.getTime();
  return elapsed < 0 || elapsed >= ALARM_RESYNC_COOLDOWN_MS;
}

/**
 * 콜드 스타트와 앱 복귀가 같은 판단 기준을 사용하게 해요.
 * 현재 실행 중 바뀐 계획이나 직전 실패는 예약 개수가 같아도 다시 전달해야 해요.
 */
export function shouldSyncAlarmPyoAlarmSnapshot({
  force,
  retryPending,
  scheduleChanged,
  ...resumeInput
}: AlarmSnapshotSyncPolicyInput): boolean {
  return (
    force ||
    retryPending ||
    scheduleChanged ||
    shouldSyncAlarmPyoAlarmsOnResume(resumeInput)
  );
}
