import type { PayrollCalendarEntry } from '../../services/payroll-schedule';
import type { DayExceptionType } from '../../models/app-data';
import { getDayExceptionBadgeLabel } from '../../utils/day-exception-appearance';
import type { KoreanHolidayInfo } from '../../utils/korean-holiday';

export const CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL = '공휴일과 겹친 월급날';

export type CalendarStatusSummaryEntry = {
  dateKey: string;
  holidayLabel: string | null;
  payrollLabel: string | null;
};

function compactCalendarLabel(label: string): string {
  return Array.from(label).slice(0, 2).join('');
}

/** 한 칸에 문구가 겹치지 않도록 공휴일을 우선하고 급여일은 보조 점으로 남겨요. */
export function resolveCalendarStatusDisplay(
  holiday: KoreanHolidayInfo | null,
  payrollEntry: PayrollCalendarEntry | null,
  compact = false,
) {
  const primary = holiday
    ? { kind: 'holiday' as const, label: holiday.calendarLabel }
    : payrollEntry
      ? { kind: 'payday' as const, label: payrollEntry.calendarLabel }
      : null;

  return {
    primary:
      compact && primary
        ? { ...primary, label: compactCalendarLabel(primary.label) }
        : primary,
    showPaydayDot: Boolean(holiday && payrollEntry),
  };
}

/** 좁은 날짜 칸에서는 아이콘과 한 글자 이름을 사용해 의미를 유지해요. */
export function resolveCalendarExceptionBadgeDisplay(
  type: DayExceptionType,
  compact: boolean,
) {
  return {
    label: getDayExceptionBadgeLabel(type, compact) ?? '',
    showIcon: true,
  };
}

/** 큰 글자 달력에서 칸 밖에 공휴일과 급여일 설명을 모아 보여 줘요. */
export function buildCalendarStatusSummary(
  dateKeys: readonly string[],
  holidays: Readonly<Record<string, KoreanHolidayInfo>>,
  payrollEntries: Readonly<Record<string, PayrollCalendarEntry>>,
): CalendarStatusSummaryEntry[] {
  return dateKeys.flatMap((dateKey) => {
    const holiday = holidays[dateKey];
    const payroll = payrollEntries[dateKey];
    if (!holiday && !payroll) return [];

    return [
      {
        dateKey,
        holidayLabel: holiday?.displayLabel ?? null,
        payrollLabel: payroll?.displayLabel ?? null,
      },
    ];
  });
}
