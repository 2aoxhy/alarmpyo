import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
import { buildCalendarMonthViewModel } from '../../services/calendar-month-view-model';
import {
  buildCalendarImageShareSnapshot,
  CalendarImageShareUnavailableError,
  createCalendarImageFileName,
} from './calendar-image-share-model';

function buildAugustModel() {
  const data = createDefaultAppData('2026-08-01');
  data.pattern = {
    ...data.pattern,
    name: '외부에 나오면 안 되는 패턴명',
    anchorDate: '2026-08-01',
    scheduleStartDate: '2026-08-01',
  };
  data.notes['2026-08-15'] = '외부에 나오면 안 되는 메모';
  data.alarmOverrides['2026-08-15'] = {
    mode: 'wake-time',
    wakeDayOffset: 0,
    wakeMinutes: 300,
  };
  data.payrollSettings = { adjustment: 'fixed-date', day: 15 };
  return buildCalendarMonthViewModel({
    automaticScheduleReferenceDateKey: '2026-08-24',
    data,
    fontScale: 1,
    month: 7,
    windowWidth: 390,
    year: 2026,
  });
}

describe('달력 이미지 공유 snapshot', () => {
  it('날짜·실제 근무·공휴일만 깊게 동결해 제공합니다', () => {
    const model = buildAugustModel();
    const snapshot = buildCalendarImageShareSnapshot({
      automaticScheduleVisible: model.automaticScheduleVisible,
      cellRows: model.cellRows,
      effectiveDays: model.effectiveDays,
      holidayDataStatus: model.holidayDataStatus,
      holidays: model.holidays,
      month: model.month.month,
      year: model.month.year,
    });

    expect(Object.keys(snapshot).sort()).toEqual([
      'automaticScheduleVisible',
      'holidayDataComplete',
      'month',
      'weeks',
      'year',
    ]);
    expect(snapshot.weeks).toHaveLength(6);
    expect(snapshot.weeks.every((week) => week.length === 7)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.weeks)).toBe(true);
    expect(Object.isFrozen(snapshot.weeks[0])).toBe(true);
    expect(Object.isFrozen(snapshot.weeks[0][0])).toBe(true);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('notes');
    expect(serialized).not.toContain('alarmOverrides');
    expect(serialized).not.toContain('payroll');
    expect(serialized).not.toContain('pattern');
    expect(serialized).not.toContain('외부에 나오면 안 되는');
    expect(snapshot.weeks.flat().find((day) => day.dateKey === '2026-08-15')).toMatchObject({
      holidayLabel: '광복절',
      inCurrentMonth: true,
    });
    expect(createCalendarImageFileName(snapshot)).toBe('2026-08-근무표.png');
  });

  it.each([4, 5, 6])('%i주 입력도 빈 칸을 채운 고정 6주 이미지로 만듭니다', (weekCount) => {
    const model = buildAugustModel();
    const snapshot = buildCalendarImageShareSnapshot({
      automaticScheduleVisible: model.automaticScheduleVisible,
      cellRows: model.cellRows.slice(0, weekCount),
      effectiveDays: model.effectiveDays,
      holidayDataStatus: model.holidayDataStatus,
      holidays: model.holidays,
      month: model.month.month,
      year: model.month.year,
    });

    expect(snapshot.weeks).toHaveLength(6);
    expect(snapshot.weeks.every((week) => week.length === 7)).toBe(true);
    expect(
      snapshot.weeks
        .slice(weekCount)
        .flat()
        .every((day) => !day.inCurrentMonth && day.day === 0),
    ).toBe(true);
    expect(new Set(snapshot.weeks.flat().map((day) => day.dateKey)).size).toBe(42);
  });

  it('자동 일정 범위 밖의 달은 공유하지 않습니다', () => {
    const model = buildCalendarMonthViewModel({
      automaticScheduleReferenceDateKey: '2026-08-24',
      data: createDefaultAppData('2026-08-01'),
      fontScale: 1,
      month: 11,
      windowWidth: 390,
      year: 2026,
    });

    expect(() =>
      buildCalendarImageShareSnapshot({
        automaticScheduleVisible: model.automaticScheduleVisible,
        cellRows: model.cellRows,
        effectiveDays: model.effectiveDays,
        holidayDataStatus: model.holidayDataStatus,
        holidays: model.holidays,
        month: model.month.month,
        year: model.month.year,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CalendarImageShareUnavailableError>>({
        reason: 'automatic-schedule-hidden',
      }),
    );
  });

  it('변동 공휴일까지 확인되지 않은 달은 공유하지 않습니다', () => {
    const model = buildAugustModel();

    expect(() =>
      buildCalendarImageShareSnapshot({
        automaticScheduleVisible: model.automaticScheduleVisible,
        cellRows: model.cellRows,
        effectiveDays: model.effectiveDays,
        holidayDataStatus: {
          ...model.holidayDataStatus,
          includesVariableHolidays: false,
        },
        holidays: model.holidays,
        month: model.month.month,
        year: model.month.year,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CalendarImageShareUnavailableError>>({
        reason: 'holiday-data-incomplete',
      }),
    );
  });
});
