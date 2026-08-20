import { describe, expect, it } from 'vitest';

import { resolveCalendarDayViewModel } from '../../services/calendar-month-view-model';
import type { PayrollCalendarEntry } from '../../services/payroll-schedule';
import type { CalendarCell } from '../../utils/date';
import type { KoreanHolidayInfo } from '../../utils/korean-holiday';

import {
  buildCalendarDateSummaryAccessibilityLabel,
  buildCalendarDayAccessibilityLabel,
  isCalendarDayInteractionDisabled,
} from './calendar-day-presentation';

const cell: CalendarCell = {
  dateKey: '2026-08-15',
  day: 15,
  inCurrentMonth: true,
};
const shift = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#00a58c',
  softColor: '#d9f7ef',
  startMinutes: 405,
  endMinutes: 1065,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 110,
};
const holiday: KoreanHolidayInfo = {
  names: ['광복절'],
  displayLabel: '광복절',
  calendarLabel: '광복절',
  accessibilityLabel: '광복절',
};
const payrollEntry: PayrollCalendarEntry = {
  type: 'payday',
  dateKey: cell.dateKey,
  salaryYear: 2026,
  salaryMonth: 7,
  calendarLabel: '급여',
  displayLabel: '월급날',
  accessibilityLabel: '2026년 8월 월급날',
  adjusted: true,
  confirmed: false,
};

describe('달력 날짜 접근성 표시', () => {
  it('날짜 의미를 정해진 순서로 한 번만 조합합니다', () => {
    const day = resolveCalendarDayViewModel({
      cell,
      effectiveDay: {
        dateKey: cell.dateKey,
        scheduleActive: true,
        scheduledShift: shift,
        shift,
        dayException: undefined,
      },
      hasDirectScheduleOverride: true,
      hasNote: true,
      holiday,
      payrollEntry,
    });

    expect(buildCalendarDayAccessibilityLabel(day, { isToday: true })).toBe(
      '2026년 8월 15일 토요일, 오늘, 주간, 근무 시간 06:45부터 17:45까지, 직접 변경한 날, 광복절, 2026년 8월 월급날, 메모 있음',
    );
    expect(buildCalendarDayAccessibilityLabel(day)).not.toContain('선택');
  });

  it('예외 근무명과 예외 이름이 같으면 중복하지 않습니다', () => {
    const leaveShift = {
      ...shift,
      id: 'exception-leave',
      name: '연차',
      startMinutes: null,
      endMinutes: null,
      isOff: true,
    };
    const day = resolveCalendarDayViewModel({
      cell,
      effectiveDay: {
        dateKey: cell.dateKey,
        scheduleActive: true,
        scheduledShift: shift,
        shift: leaveShift,
        dayException: 'leave',
      },
    });

    expect(buildCalendarDayAccessibilityLabel(day)).toBe(
      '2026년 8월 15일 토요일, 예외 일정 연차, 특별 일정 적용',
    );
  });

  it('시작일 이전 날짜도 일반 요약은 열고 선택만 차단합니다', () => {
    expect(isCalendarDayInteractionDisabled(false, false)).toBe(false);
    expect(isCalendarDayInteractionDisabled(false, true)).toBe(true);
    expect(isCalendarDayInteractionDisabled(true, true)).toBe(false);
  });

  it('일정 시작 전 날짜는 비활성 의미를 설명합니다', () => {
    const day = resolveCalendarDayViewModel({
      cell,
      effectiveDay: {
        dateKey: cell.dateKey,
        scheduleActive: false,
        scheduledShift: null,
        shift: null,
        dayException: undefined,
      },
    });

    expect(buildCalendarDayAccessibilityLabel(day)).toContain(
      '일정 적용 시작일 이전 날짜',
    );
  });

  it('큰 글자 날짜 요약은 예상 급여일을 구분합니다', () => {
    expect(
      buildCalendarDateSummaryAccessibilityLabel({
        basePatternShift: shift,
        dateKey: cell.dateKey,
        dayException: null,
        effectiveShift: shift,
        hasDirectScheduleOverride: false,
        hasShiftOverride: false,
        hasTimeOverride: false,
        holidayFullLabel: '광복절',
        holidayLabel: '광복절',
        note: null,
        payrollAdjusted: true,
        payrollEstimated: true,
        payrollFullLabel: '2026년 8월 월급날',
        payrollLabel: '월급날',
        scheduleActive: true,
        scheduledShift: shift,
      }),
    ).toBe(
      '8월 15일 토요일, 공휴일 광복절, 예상 급여일 2026년 8월 월급날',
    );
  });
});
