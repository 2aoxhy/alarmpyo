import type { MonthlyWorkSummary } from '@/services/monthly-work-summary';

export function formatCalendarSummaryPeriod(summary: MonthlyWorkSummary): string {
  const formatMonthDay = (dateKey: string) =>
    `${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일`;
  return `${formatMonthDay(summary.periodStartDateKey)}~${formatMonthDay(summary.periodEndDateKey)} · ${summary.workdayCount}일 근무`;
}
