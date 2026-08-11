import { describe, expect, it } from 'vitest';

import type { MonthlyWorkSummary } from '@/services/monthly-work-summary';
import { formatCalendarSummaryPeriod } from './calendar-summary-label';

const summary = {
  year: 2026,
  month: 6,
  periodStartDateKey: '2026-06-16',
  periodEndDateKey: '2026-07-15',
  workdayCount: 21,
  offdayCount: 9,
  dayShiftCount: 10,
  nightShiftCount: 11,
  substituteCount: 0,
  totalMinutes: 15_600,
  dayMinutes: 6_600,
  nightMinutes: 9_000,
  exceptionCounts: {
    leave: 0,
    training: 0,
    reserve: 0,
  },
} satisfies MonthlyWorkSummary;

describe('calendar support sections', () => {
  it('이달 요약 기간을 전월 16일부터 당월 15일까지 읽기 좋게 표시해요', () => {
    expect(formatCalendarSummaryPeriod(summary)).toBe(
      '6월 16일~7월 15일 · 21일 근무',
    );
  });
});
