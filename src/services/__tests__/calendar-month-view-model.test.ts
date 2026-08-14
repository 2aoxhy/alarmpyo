import { describe, expect, it } from 'vitest';

import type { AppData } from '../../models/app-data';
import { buildCalendarMonthViewModel } from '../calendar-month-view-model';
import { createDefaultWorkRoutineProfiles } from '../work-routine-settings';

const data: AppData = {
  version: 20,
  shiftTypes: [
    {
      id: 'day',
      name: '주간',
      shortName: '주',
      color: '#00a58c',
      softColor: '#d9f7ef',
      startMinutes: 420,
      endMinutes: 1080,
      endsNextDay: false,
      isOff: false,
      alarmEnabled: true,
      alarmMinutesBefore: 120,
    },
    {
      id: 'off',
      name: '휴무',
      shortName: '휴',
      color: '#667085',
      softColor: '#eef1f5',
      startMinutes: null,
      endMinutes: null,
      endsNextDay: false,
      isOff: true,
      alarmEnabled: false,
      alarmMinutesBefore: 0,
    },
  ],
  pattern: {
    name: '시험 근무표',
    anchorDate: '2026-07-01',
    scheduleStartDate: '2026-07-01',
    shiftTypeIds: ['day', 'off'],
  },
  overrides: {},
  timeOverrides: {},
  dayExceptions: {},
  alarmOverrides: {},
  notes: {},
  scheduleChangeHistory: [],
  settings: {
    notificationsEnabled: false,
    sleepReminderEnabled: false,
    scheduledNotificationCount: 0,
    lastNotificationSyncAt: null,
    setupCompleted: true,
    themeMode: 'system',
    workRoutineProfiles: createDefaultWorkRoutineProfiles(),
    widgetDisplayOptions: {
      todayShift: true,
      nextShift: true,
      nextAlarm: false,
    },
  },
};

describe('달력 월 화면 계산 모델', () => {
  it('현재 달만 완전한 주 단위로 구성해요', () => {
    const model = buildCalendarMonthViewModel({
      data,
      year: 2026,
      month: 6,
      windowWidth: 390,
      fontScale: 1,
    });

    expect(model.cells).toHaveLength(35);
    expect(model.cellRows).toHaveLength(5);
    expect(model.cellRows.every((row) => row.length === 7)).toBe(true);
    expect(model.cellRows[0].map((cell) => cell.dateKey)).toEqual([
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
    ]);
    expect(model.cellRows[0][0].inCurrentMonth).toBe(false);
    expect(model.cellRows[0][6].inCurrentMonth).toBe(true);
    expect(model.effectiveDays.size).toBe(31);
    expect(
      [...model.effectiveDays.keys()].every((dateKey) =>
        dateKey.startsWith('2026-07-'),
      ),
    ).toBe(true);
    expect(model.selectableDateKeySet.has('2026-07-01')).toBe(true);
    expect(model.monthlySummary.workdayCount).toBeGreaterThan(0);
  });
});
