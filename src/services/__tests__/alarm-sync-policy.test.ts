import { describe, expect, it } from 'vitest';

import {
  ALARM_DELIVERY_RETRY_GRACE_MS,
  canPreserveActiveAlarmDeliveryRetry,
  canSkipDisabledAlarmStatusCheck,
  getExpectedNativeScheduledAlarmCount,
  isAlarmPyoAlarmPlanContentSynchronized,
  isAlarmPyoAlarmScheduleSynchronized,
  markAlarmDisableSyncPending,
  resolveCompletedAlarmAutoCheckStatus,
  shouldBlockAutomaticAlarmRepair,
  shouldSyncAlarmPyoAlarmSnapshot,
  shouldSyncAlarmPyoAlarmsOnResume,
} from '../alarm-sync-policy';

const NOW = new Date(2026, 6, 11, 12, 0);
const PLAN = [
  {
    id: 'day-1',
    dateKey: '2026-07-12',
    shiftTypeId: 'day',
    shiftName: '주간',
    alarmAt: new Date(2026, 6, 12, 5, 0).getTime(),
    startMinutes: 7 * 60,
    alarmMinutesBefore: 2 * 60,
  },
  {
    id: 'night-1',
    dateKey: '2026-07-13',
    shiftTypeId: 'night',
    shiftName: '야간',
    alarmAt: new Date(2026, 6, 13, 16, 0).getTime(),
    startMinutes: 18 * 60,
    alarmMinutesBefore: 2 * 60,
  },
];

function input(
  patch: Partial<Parameters<typeof shouldSyncAlarmPyoAlarmsOnResume>[0]> = {},
) {
  return {
    actualScheduledCount: 3,
    exactAlarmAllowed: true,
    notificationsAllowed: true,
    plannedAlarmCount: 30,
    storedScheduledCount: 3,
    lastSyncAt: new Date(2026, 6, 11, 10, 0).toISOString(),
    now: NOW,
    previousTimeZoneOffset: NOW.getTimezoneOffset(),
    ...patch,
  };
}

describe('앱 복귀 알람 동기화 정책', () => {
  it('자동 점검 결과를 정상·복구·권한 필요·오류로 구분해요', () => {
    expect(resolveCompletedAlarmAutoCheckStatus({
      accessMissing: false,
      repairNeeded: false,
      success: true,
      synchronized: false,
    })).toBe('ready');
    expect(resolveCompletedAlarmAutoCheckStatus({
      accessMissing: false,
      repairNeeded: true,
      success: true,
      synchronized: true,
    })).toBe('recovered');
    expect(resolveCompletedAlarmAutoCheckStatus({
      accessMissing: true,
      repairNeeded: true,
      success: true,
      synchronized: true,
    })).toBe('needs-access');
    expect(resolveCompletedAlarmAutoCheckStatus({
      accessMissing: false,
      repairNeeded: true,
      success: false,
      synchronized: true,
    })).toBe('error');
  });

  it('정확한 알람 권한만 예약을 막고 알림 권한 차단 중에는 미래 예약을 유지해요', () => {
    expect(shouldBlockAutomaticAlarmRepair({
      exactAlarmAllowed: false,
      notificationsAllowed: true,
      notificationsEnabled: true,
      supported: true,
    })).toBe(true);
    expect(shouldBlockAutomaticAlarmRepair({
      exactAlarmAllowed: true,
      notificationsAllowed: false,
      notificationsEnabled: true,
      supported: true,
    })).toBe(false);
    expect(shouldBlockAutomaticAlarmRepair({
      exactAlarmAllowed: true,
      notificationsAllowed: true,
      notificationsEnabled: true,
      supported: true,
    })).toBe(false);
    // 사용자가 알람을 끈 경우에는 권한과 관계없이 기존 예약 정리를 허용해요.
    expect(shouldBlockAutomaticAlarmRepair({
      exactAlarmAllowed: false,
      notificationsAllowed: false,
      notificationsEnabled: false,
      supported: true,
    })).toBe(false);
  });

  it('366일 계획 중 실제 예약 상한인 다음 3개가 등록되면 동기화 성공으로 판단해요', () => {
    expect(getExpectedNativeScheduledAlarmCount({
      exactAlarmAllowed: true,
      notificationsAllowed: true,
      plannedAlarmCount: 60,
    })).toBe(3);
    expect(isAlarmPyoAlarmScheduleSynchronized({
      actualScheduledCount: 3,
      exactAlarmAllowed: true,
      notificationsAllowed: true,
      plannedAlarmCount: 60,
    })).toBe(true);
    expect(isAlarmPyoAlarmScheduleSynchronized({
      actualScheduledCount: 2,
      exactAlarmAllowed: true,
      notificationsAllowed: true,
      plannedAlarmCount: 60,
    })).toBe(false);
  });

  it('예약 개수가 같아도 교육 알람의 종류·이름·시각이 다르면 다시 동기화해요', () => {
    expect(isAlarmPyoAlarmPlanContentSynchronized({
      actualScheduledAlarms: PLAN,
      exactAlarmAllowed: true,
      notificationsAllowed: true,
      plannedAlarms: PLAN,
    })).toBe(true);
    expect(isAlarmPyoAlarmPlanContentSynchronized({
      actualScheduledAlarms: PLAN,
      exactAlarmAllowed: true,
      notificationsAllowed: true,
      plannedAlarms: [
        { ...PLAN[0], id: 'education-1', shiftName: '교육' },
        PLAN[1],
      ],
    })).toBe(false);
  });

  it('예약 권한이 없을 때는 비어 있는 네이티브 목록을 내용 불일치로 반복 처리하지 않아요', () => {
    expect(isAlarmPyoAlarmPlanContentSynchronized({
      actualScheduledAlarms: [],
      exactAlarmAllowed: false,
      notificationsAllowed: false,
      plannedAlarms: PLAN,
    })).toBe(true);
  });

  it('재생 실패 뒤 30분 안의 전달 재시도는 일반 앱 복귀에서 보존해요', () => {
    const original = {
      ...PLAN[0],
      alarmAt: NOW.getTime() - 10_000,
    };
    const retry = {
      ...original,
      alarmAt: NOW.getTime() + 50_000,
    };
    expect(canPreserveActiveAlarmDeliveryRetry({
      actualScheduledAlarms: [retry, PLAN[1]],
      actualScheduledCount: 2,
      exactAlarmAllowed: true,
      force: false,
      notificationsAllowed: true,
      now: NOW,
      plannedAlarms: [PLAN[1]],
      recentPlannedAlarms: [original, PLAN[1]],
      retryPending: false,
      scheduleChanged: false,
    })).toBe(true);
  });

  it('전달 재시도가 30분 경계를 넘거나 근무 메타데이터가 다르면 보존하지 않아요', () => {
    const original = {
      ...PLAN[0],
      alarmAt: NOW.getTime() - ALARM_DELIVERY_RETRY_GRACE_MS,
    };
    const input = {
      actualScheduledCount: 1,
      exactAlarmAllowed: true,
      force: false,
      notificationsAllowed: true,
      now: NOW,
      plannedAlarms: [] as typeof PLAN,
      recentPlannedAlarms: [original],
      retryPending: false,
      scheduleChanged: false,
    };
    expect(canPreserveActiveAlarmDeliveryRetry({
      ...input,
      actualScheduledAlarms: [{
        ...original,
        alarmAt: original.alarmAt + ALARM_DELIVERY_RETRY_GRACE_MS + 1,
      }],
    })).toBe(false);
    expect(canPreserveActiveAlarmDeliveryRetry({
      ...input,
      actualScheduledAlarms: [{
        ...original,
        shiftName: '다른 근무',
        alarmAt: original.alarmAt + 60_000,
      }],
    })).toBe(false);
  });

  it('강제 재예약·직전 실패·실제 일정 변경은 전달 재시도보다 우선해요', () => {
    const original = { ...PLAN[0], alarmAt: NOW.getTime() - 1_000 };
    const retry = { ...original, alarmAt: NOW.getTime() + 60_000 };
    const input = {
      actualScheduledAlarms: [retry],
      actualScheduledCount: 1,
      exactAlarmAllowed: true,
      force: false,
      notificationsAllowed: true,
      now: NOW,
      plannedAlarms: [] as typeof PLAN,
      recentPlannedAlarms: [original],
      retryPending: false,
      scheduleChanged: false,
    };
    expect(canPreserveActiveAlarmDeliveryRetry({ ...input, force: true })).toBe(false);
    expect(canPreserveActiveAlarmDeliveryRetry({ ...input, retryPending: true })).toBe(false);
    expect(canPreserveActiveAlarmDeliveryRetry({ ...input, scheduleChanged: true })).toBe(false);
  });

  it('정확한 알람 권한이 없을 때만 실제 예약 0개를 정상 상태로 판단해요', () => {
    expect(isAlarmPyoAlarmScheduleSynchronized({
      actualScheduledCount: 0,
      exactAlarmAllowed: false,
      notificationsAllowed: true,
      plannedAlarmCount: 60,
    })).toBe(true);
    expect(isAlarmPyoAlarmScheduleSynchronized({
      actualScheduledCount: 0,
      exactAlarmAllowed: true,
      notificationsAllowed: false,
      plannedAlarmCount: 60,
    })).toBe(false);
    expect(isAlarmPyoAlarmScheduleSynchronized({
      actualScheduledCount: 3,
      exactAlarmAllowed: true,
      notificationsAllowed: false,
      plannedAlarmCount: 60,
    })).toBe(true);
  });

  it('알람을 성공적으로 비운 상태만 네이티브 상태 조회를 생략해요', () => {
    expect(canSkipDisabledAlarmStatusCheck({
      notificationsEnabled: false,
      storedScheduledCount: 0,
      lastSyncAt: NOW.toISOString(),
    })).toBe(true);
    expect(canSkipDisabledAlarmStatusCheck({
      notificationsEnabled: true,
      storedScheduledCount: 0,
      lastSyncAt: NOW.toISOString(),
    })).toBe(false);
    expect(canSkipDisabledAlarmStatusCheck({
      notificationsEnabled: false,
      storedScheduledCount: 1,
      lastSyncAt: NOW.toISOString(),
    })).toBe(false);
    expect(canSkipDisabledAlarmStatusCheck({
      notificationsEnabled: false,
      storedScheduledCount: 0,
      lastSyncAt: null,
    })).toBe(false);
  });

  it('알람 끄기 저장은 기존 예약 수를 유지하고 취소 확인 시각을 비워 재시도해요', () => {
    const pending = markAlarmDisableSyncPending({
      scheduledNotificationCount: 3,
      lastNotificationSyncAt: NOW.toISOString(),
    });
    expect(pending).toEqual({
      scheduledNotificationCount: 3,
      lastNotificationSyncAt: null,
    });
    expect(canSkipDisabledAlarmStatusCheck({
      notificationsEnabled: false,
      storedScheduledCount: pending.scheduledNotificationCount,
      lastSyncAt: pending.lastNotificationSyncAt,
    })).toBe(false);
    expect(shouldSyncAlarmPyoAlarmsOnResume(input({
      actualScheduledCount: 3,
      plannedAlarmCount: 0,
      storedScheduledCount: pending.scheduledNotificationCount,
      lastSyncAt: pending.lastNotificationSyncAt,
    }))).toBe(true);

    // empty-plan 동기화가 성공해 0개와 확인 시각이 기록된 뒤에만 조회를 생략해요.
    expect(canSkipDisabledAlarmStatusCheck({
      notificationsEnabled: false,
      storedScheduledCount: 0,
      lastSyncAt: NOW.toISOString(),
    })).toBe(true);
    expect(shouldSyncAlarmPyoAlarmsOnResume(input({
      actualScheduledCount: 0,
      plannedAlarmCount: 0,
      storedScheduledCount: 0,
      lastSyncAt: NOW.toISOString(),
    }))).toBe(false);
  });

  it('예약 수와 당일 동기화 상태가 같으면 네이티브 작업을 반복하지 않아요', () => {
    expect(shouldSyncAlarmPyoAlarmsOnResume(input())).toBe(false);
  });

  it('첫 설정 전 빈 계획은 실제 예약도 비어 있을 때만 다시 전달하지 않아요', () => {
    expect(shouldSyncAlarmPyoAlarmsOnResume(input({
      actualScheduledCount: 0,
      plannedAlarmCount: 0,
      storedScheduledCount: 0,
    }))).toBe(false);
    expect(shouldSyncAlarmPyoAlarmsOnResume(input({
      actualScheduledCount: 3,
      plannedAlarmCount: 0,
      storedScheduledCount: 3,
    }))).toBe(true);
  });

  it('콜드 스타트도 복귀 정책을 따르고 실패·실행 중 변경·강제 요청만 우선해요', () => {
    const base = {
      ...input(),
      force: false,
      retryPending: false,
      scheduleChanged: false,
    };
    expect(shouldSyncAlarmPyoAlarmSnapshot(base)).toBe(false);
    expect(shouldSyncAlarmPyoAlarmSnapshot({ ...base, force: true })).toBe(true);
    expect(shouldSyncAlarmPyoAlarmSnapshot({ ...base, retryPending: true })).toBe(true);
    expect(shouldSyncAlarmPyoAlarmSnapshot({ ...base, scheduleChanged: true })).toBe(true);
  });

  it('전체 화면 권한이 상태상 꺼져도 예약이 정상이라면 반복 동기화하지 않아요', () => {
    // 정책 입력에 전체 화면 권한을 두지 않는 것이 의도한 동작이에요.
    expect(shouldSyncAlarmPyoAlarmsOnResume(input())).toBe(false);
  });

  it('직전 동기화 실패로 저장 개수와 실제 개수가 다르면 바로 복구해요', () => {
    expect(
      shouldSyncAlarmPyoAlarmsOnResume(input({ storedScheduledCount: 0 })),
    ).toBe(true);
  });

  it('권한이 없을 때 실제 예약이 0개면 같은 날 반복하지 않아요', () => {
    expect(
      shouldSyncAlarmPyoAlarmsOnResume(
        input({
          actualScheduledCount: 0,
          exactAlarmAllowed: false,
          notificationsAllowed: false,
          storedScheduledCount: 0,
        }),
      ),
    ).toBe(false);
  });

  it('권한 복구·날짜 변경·시간대 변경·잘못된 동기화 시각을 감지해요', () => {
    expect(
      shouldSyncAlarmPyoAlarmsOnResume(
        input({ actualScheduledCount: 0, storedScheduledCount: 0 }),
      ),
    ).toBe(true);
    expect(
      shouldSyncAlarmPyoAlarmsOnResume(
        input({ lastSyncAt: new Date(2026, 6, 10, 23, 59).toISOString() }),
      ),
    ).toBe(true);
    expect(
      shouldSyncAlarmPyoAlarmsOnResume(
        input({ previousTimeZoneOffset: NOW.getTimezoneOffset() + 60 }),
      ),
    ).toBe(true);
    expect(shouldSyncAlarmPyoAlarmsOnResume(input({ lastSyncAt: '잘못된 시각' }))).toBe(true);
  });
});
