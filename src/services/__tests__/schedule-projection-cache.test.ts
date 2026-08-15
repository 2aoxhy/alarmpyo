import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultAppData, resolveShiftFromAppData } from '../app-data-service';
import {
  clearScheduleProjectionCacheForTests,
  getCachedDailyAlarmProjection,
  getCachedFutureAlarmProjection,
  getScheduleProjectionTimeZoneSignature,
} from '../schedule-projection-cache';

function alarmEnabledData() {
  const data = createDefaultAppData('2026-08-15');
  return {
    ...data,
    settings: {
      ...data.settings,
      setupCompleted: true,
      notificationsEnabled: true,
    },
  };
}

describe('schedule projection cache', () => {
  beforeEach(() => clearScheduleProjectionCacheForTests());

  it('같은 날짜·시간대·일정은 Today, 알람과 위젯에서 한 투영을 공유합니다', () => {
    const data = alarmEnabledData();
    const resolveShift = (dateKey: string) => resolveShiftFromAppData(data, dateKey);

    const morning = getCachedDailyAlarmProjection(
      data,
      resolveShift,
      new Date(2026, 7, 15, 7),
    );
    const evening = getCachedDailyAlarmProjection(
      data,
      resolveShift,
      new Date(2026, 7, 15, 19),
    );

    expect(evening).toBe(morning);
    expect(getCachedFutureAlarmProjection(
      data,
      resolveShift,
      new Date(2026, 7, 15, 19),
    ).every((plan) => plan.alarmAt > new Date(2026, 7, 15, 19).getTime())).toBe(true);
  });

  it('현재 UTC offset이 같아도 미래 DST 규칙이 다른 시간대를 구분합니다', () => {
    const previousTimeZone = process.env.TZ;
    try {
      process.env.TZ = 'America/Denver';
      const denverNow = new Date(2026, 0, 15, 12);
      const denver = getScheduleProjectionTimeZoneSignature(denverNow);
      process.env.TZ = 'America/Phoenix';
      const phoenixNow = new Date(2026, 0, 15, 12);
      const phoenix = getScheduleProjectionTimeZoneSignature(phoenixNow);

      expect(denverNow.getTimezoneOffset()).toBe(phoenixNow.getTimezoneOffset());
      expect(denver).not.toBe(phoenix);
    } finally {
      process.env.TZ = previousTimeZone;
    }
  });

  it('메모처럼 일정과 무관한 변경은 재계산하지 않습니다', () => {
    const data = alarmEnabledData();
    const first = getCachedDailyAlarmProjection(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      new Date(2026, 7, 15, 9),
    );
    const noteChanged = {
      ...data,
      notes: { '2026-08-15': '인수인계' },
    };
    const second = getCachedDailyAlarmProjection(
      noteChanged,
      (dateKey) => resolveShiftFromAppData(noteChanged, dateKey),
      new Date(2026, 7, 15, 10),
    );

    expect(second).toBe(first);
  });

  it('알람 일정이나 날짜가 바뀌면 새 투영을 계산합니다', () => {
    const data = alarmEnabledData();
    const first = getCachedDailyAlarmProjection(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      new Date(2026, 7, 15, 9),
    );
    const alarmChanged = {
      ...data,
      shiftTypes: data.shiftTypes.map((shift) =>
        shift.id === 'day'
          ? { ...shift, alarmMinutesBefore: shift.alarmMinutesBefore + 1 }
          : shift,
      ),
    };
    const changed = getCachedDailyAlarmProjection(
      alarmChanged,
      (dateKey) => resolveShiftFromAppData(alarmChanged, dateKey),
      new Date(2026, 7, 15, 9),
    );
    const nextDay = getCachedDailyAlarmProjection(
      data,
      (dateKey) => resolveShiftFromAppData(data, dateKey),
      new Date(2026, 7, 16, 9),
    );

    expect(changed).not.toBe(first);
    expect(nextDay).not.toBe(first);
  });
});
