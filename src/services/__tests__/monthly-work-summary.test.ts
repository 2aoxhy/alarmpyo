import { describe, expect, it } from 'vitest';

import type { DayExceptionType, ShiftType } from '../../models/app-data';
import type { EffectiveDay } from '../app-data-service';
import {
  buildMonthlyWorkSummary,
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
});
