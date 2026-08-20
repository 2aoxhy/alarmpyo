import { describe, expect, it } from 'vitest';

import type { AppData } from '../../models/app-data';
import {
  buildCalendarMonthViewModel,
  selectCalendarProjectionData,
} from '../calendar-month-view-model';
import { createDefaultWorkRoutineProfiles } from '../work-routine-settings';

const data: AppData = {
  version: 21,
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
  payrollSettings: { day: 21, adjustment: 'previous-business-day' },
  patternVault: [],
  patternHistory: [],
  appliedPatternSource: 'legacy',
  appliedPatternId: null,
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
    dismissedUpdateVersionCode: null,
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
    expect(model.month).toEqual({ year: 2026, month: 6 });
    expect(model.monthKey).toBe('2026-07');
    expect(model.weekSections).toHaveLength(5);
    expect(model.weekSections.every((week) => week.days.length === 7)).toBe(true);
    expect(model.daysByDate.get('2026-06-30')).toMatchObject({
      inCurrentMonth: false,
      effectiveDay: null,
      isSelectable: false,
    });
    expect(model.currentMonthDateKeys).toHaveLength(31);
    expect(model.dateSummaries).toHaveLength(31);
    expect(model.dateSummaryByDate.size).toBe(31);
  });

  it('기본 근무와 실제 근무·시간, 직접 변경, 전체 메모를 함께 제공합니다', () => {
    const model = buildCalendarMonthViewModel({
      data: {
        ...data,
        timeOverrides: {
          '2026-07-01': {
            shiftTypeId: 'day',
            startMinutes: 480,
            endMinutes: 1020,
            endsNextDay: false,
          },
        },
        notes: { '2026-07-01': '교대 전에 장비를 확인합니다.' },
      },
      year: 2026,
      month: 6,
      windowWidth: 390,
      fontScale: 1,
    });

    expect(model.daysByDate.get('2026-07-01')).toMatchObject({
      hasDirectScheduleOverride: true,
      hasShiftOverride: false,
      hasTimeOverride: true,
      hasNote: true,
      note: '교대 전에 장비를 확인합니다.',
      basePatternDay: { shift: { id: 'day', startMinutes: 420 } },
      effectiveDay: {
        scheduledShift: { id: 'day', startMinutes: 480 },
        shift: { id: 'day', startMinutes: 480 },
      },
    });
    expect(
      model.dateSummaries.find((summary) => summary.dateKey === '2026-07-01'),
    ).toMatchObject({
      basePatternShift: { id: 'day', startMinutes: 420 },
      scheduledShift: { id: 'day', startMinutes: 480 },
      effectiveShift: { id: 'day', startMinutes: 480 },
      hasDirectScheduleOverride: true,
      hasTimeOverride: true,
      note: '교대 전에 장비를 확인합니다.',
    });
  });

  it('달력 투영 입력에서 알람·설정·보관소 등 무관한 저장 필드를 제외합니다', () => {
    const projection = selectCalendarProjectionData(data);

    expect(Object.keys(projection).sort()).toEqual([
      'dayExceptions',
      'notes',
      'overrides',
      'pattern',
      'payrollSettings',
      'shiftTypes',
      'timeOverrides',
    ]);
    expect(projection).not.toHaveProperty('alarmOverrides');
    expect(projection).not.toHaveProperty('patternVault');
    expect(projection).not.toHaveProperty('settings');
  });

  it('저장된 급여일과 조정 정책을 달력 표시에 반영합니다', () => {
    const model = buildCalendarMonthViewModel({
      data: {
        ...data,
        payrollSettings: { day: 31, adjustment: 'fixed-date' },
      },
      year: 2026,
      month: 6,
      windowWidth: 390,
      fontScale: 1,
    });

    expect(model.payrollSchedule.regularPaydayDateKey).toBe('2026-07-31');
    expect(model.payrollSchedule.paydayDateKey).toBe('2026-07-31');
    expect(model.payrollEntries).toHaveProperty('2026-07-31');
    expect(model.payrollEntries).not.toHaveProperty('2026-07-21');
  });

  it('다음 달 급여일이 직전 영업일로 앞당겨지면 현재 달 표식에 포함합니다', () => {
    const model = buildCalendarMonthViewModel({
      data: {
        ...data,
        payrollSettings: { day: 1, adjustment: 'previous-business-day' },
      },
      year: 2026,
      month: 6,
      windowWidth: 390,
      fontScale: 1,
    });

    expect(model.payrollEntries).toHaveProperty('2026-07-31');
    expect(model.payrollEntries['2026-07-31']).toMatchObject({
      salaryYear: 2026,
      salaryMonth: 7,
      adjusted: true,
    });
  });
});
