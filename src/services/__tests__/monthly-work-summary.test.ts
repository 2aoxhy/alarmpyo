import { describe, expect, it } from 'vitest';

import type { DayExceptionType, ShiftType } from '../../models/app-data';
import type { EffectiveDay } from '../app-data-service';
import {
  buildMonthlyWorkSummary,
  buildPayrollPeriodWorkSummary,
  getShiftDurationMinutes,
} from '../monthly-work-summary';

const DAY: ShiftType = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#000',
  softColor: '#fff',
  startMinutes: 7 * 60,
  endMinutes: 18 * 60,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 120,
};
const NIGHT: ShiftType = {
  ...DAY,
  id: 'night',
  name: '야간',
  shortName: '야',
  startMinutes: 18 * 60,
  endMinutes: 7 * 60,
  endsNextDay: true,
};
const SUBSTITUTE_NIGHT: ShiftType = {
  ...NIGHT,
  id: 'substitute-night',
  name: '야간 대체근무',
};
const OFF: ShiftType = {
  ...DAY,
  id: 'off',
  name: '휴무',
  shortName: '휴',
  startMinutes: null,
  endMinutes: null,
  isOff: true,
  alarmEnabled: false,
  alarmMinutesBefore: 0,
};

function effectiveDay(
  dateKey: string,
  shift: ShiftType | null,
  dayException?: DayExceptionType,
  scheduleActive = true,
): EffectiveDay {
  return {
    dateKey,
    scheduleActive,
    scheduledShift: shift,
    shift,
    dayException: scheduleActive ? dayException : undefined,
  };
}

describe('월별 근무 요약', () => {
  it('주간과 익일 종료 야간 시간을 올바르게 계산해요', () => {
    expect(getShiftDurationMinutes(DAY)).toBe(11 * 60);
    expect(getShiftDurationMinutes(NIGHT)).toBe(13 * 60);
    expect(getShiftDurationMinutes(OFF)).toBe(0);
  });

  it('선택한 달의 근무 횟수와 총 시간을 합산해요', () => {
    const summary = buildMonthlyWorkSummary(
      2026,
      6,
      (dateKey) => {
        if (dateKey === '2026-07-01') return effectiveDay(dateKey, DAY);
        if (dateKey === '2026-07-02') return effectiveDay(dateKey, NIGHT);
        if (dateKey === '2026-07-03') return effectiveDay(dateKey, DAY, 'training');
        if (dateKey === '2026-07-04') return effectiveDay(dateKey, DAY, 'reserve');
        if (dateKey === '2026-07-05') return effectiveDay(dateKey, SUBSTITUTE_NIGHT);
        return effectiveDay(dateKey, OFF);
      },
    );

    expect(summary).toMatchObject({
      workdayCount: 5,
      offdayCount: 26,
      dayShiftCount: 3,
      nightShiftCount: 2,
      substituteCount: 1,
      totalMinutes: 59 * 60,
      dayMinutes: 33 * 60,
      nightMinutes: 26 * 60,
      exceptionCounts: {
        leave: 0,
        training: 1,
        reserve: 1,
      },
    });
  });

  it('근무표 시작 전 일정 없음 날짜는 휴무 합계에 넣지 않아요', () => {
    const summary = buildMonthlyWorkSummary(
      2026,
      6,
      (dateKey) =>
        effectiveDay(dateKey, dateKey < '2026-07-15' ? null : OFF, undefined, dateKey >= '2026-07-15'),
    );

    expect(summary.workdayCount).toBe(0);
    expect(summary.offdayCount).toBe(17);
  });

  it('이달 요약은 전월 16일부터 당월 15일까지 계산해요', () => {
    const visited: string[] = [];
    const summary = buildPayrollPeriodWorkSummary(
      2026,
      7,
      (dateKey) => {
        visited.push(dateKey);
        return effectiveDay(
          dateKey,
          dateKey === '2026-07-16' || dateKey === '2026-08-15'
            ? DAY
            : OFF,
        );
      },
    );

    expect(summary).toMatchObject({
      periodStartDateKey: '2026-07-16',
      periodEndDateKey: '2026-08-15',
      workdayCount: 2,
      offdayCount: 29,
      totalMinutes: 22 * 60,
    });
    expect(visited[0]).toBe('2026-07-16');
    expect(visited.at(-1)).toBe('2026-08-15');
    expect(visited).toHaveLength(31);
  });

  it('1월 요약은 이전 해 12월 16일부터 계산해요', () => {
    const summary = buildPayrollPeriodWorkSummary(
      2027,
      0,
      (dateKey) => effectiveDay(dateKey, OFF),
    );

    expect(summary.periodStartDateKey).toBe('2026-12-16');
    expect(summary.periodEndDateKey).toBe('2027-01-15');
    expect(summary.offdayCount).toBe(31);
  });
});
