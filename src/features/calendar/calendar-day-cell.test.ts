import { describe, expect, it } from 'vitest';

import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import type { KoreanHolidayInfo } from '@/utils/korean-holiday';
import {
  CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL,
  buildCalendarStatusSummary,
  resolveCalendarExceptionBadgeDisplay,
  resolveCalendarStatusDisplay,
} from './calendar-day-status';

const holiday = {
  accessibilityLabel: '제헌절',
  calendarLabel: '제헌절',
  displayLabel: '제헌절',
  names: ['제헌절'],
} satisfies KoreanHolidayInfo;

const payday = {
  accessibilityLabel: '급여일',
  adjusted: false,
  calendarLabel: '급여',
  dateKey: '2026-07-17',
  displayLabel: '월급날',
  confirmed: true,
  salaryMonth: 7,
  salaryYear: 2026,
  type: 'payday',
} satisfies PayrollCalendarEntry;

describe('calendar day status display', () => {
  it('공휴일과 급여일이 겹치면 공휴일 다음에 급여일 표식을 표시합니다', () => {
    expect(resolveCalendarStatusDisplay(holiday, payday)).toEqual({
      markers: [
        { fullLabel: '제헌절', kind: 'holiday', token: '공' },
        {
          estimated: false,
          fullLabel: '급여일',
          kind: 'payday',
          token: '급',
        },
      ],
    });
    expect(CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL).toBe('공휴일과 겹친 월급날');
  });

  it('급여일만 있으면 급여일 표식만 표시합니다', () => {
    expect(resolveCalendarStatusDisplay(null, payday)).toEqual({
      markers: [
        {
          estimated: false,
          fullLabel: '급여일',
          kind: 'payday',
          token: '급',
        },
      ],
    });
  });

  it('간소화 달력에서도 같은 고정 표식과 순서를 유지합니다', () => {
    expect(resolveCalendarStatusDisplay(holiday, payday, true)).toEqual({
      markers: [
        { fullLabel: '제헌절', kind: 'holiday', token: '공' },
        {
          estimated: false,
          fullLabel: '급여일',
          kind: 'payday',
          token: '급',
        },
      ],
    });
  });

  it('예상 급여일은 별표를 붙여 확정 급여일과 구분합니다', () => {
    const estimated = { ...payday, confirmed: false };

    expect(resolveCalendarStatusDisplay(null, estimated, true)).toEqual({
      markers: [
        {
          estimated: true,
          fullLabel: '급여일',
          kind: 'payday',
          token: '급*',
        },
      ],
    });
    expect(resolveCalendarStatusDisplay(holiday, estimated, true)).toEqual({
      markers: [
        { fullLabel: '제헌절', kind: 'holiday', token: '공' },
        {
          estimated: true,
          fullLabel: '급여일',
          kind: 'payday',
          token: '급*',
        },
      ],
    });
  });

  it('좁은 칸의 예외 일정은 아이콘과 한 글자 이름을 사용해요', () => {
    expect(resolveCalendarExceptionBadgeDisplay('training', true)).toEqual({
      label: '교',
      showIcon: true,
    });
    expect(resolveCalendarExceptionBadgeDisplay('training', false)).toEqual({
      label: '교육',
      showIcon: true,
    });
  });

  it('큰 글자 달력은 공휴일과 급여일 설명을 날짜별로 모아요', () => {
    expect(
      buildCalendarStatusSummary(
        ['2026-07-16', '2026-07-17'],
        { '2026-07-17': holiday },
        { '2026-07-17': payday },
      ),
    ).toEqual([
      {
        dateKey: '2026-07-17',
        holidayLabel: '제헌절',
        payrollLabel: '월급날',
      },
    ]);
  });
});
