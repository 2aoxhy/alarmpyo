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

export type CalendarDateMarker =
  | { fullLabel: string; kind: 'holiday'; token: '공' }
  | {
      estimated: boolean;
      fullLabel: string;
      kind: 'payday';
      token: '급' | '급*';
    };

/** 날짜 메타데이터를 근무 배지와 분리한 고정 크기 표식으로 반환합니다. */
export function resolveCalendarStatusDisplay(
  holiday: KoreanHolidayInfo | null,
  payrollEntry: PayrollCalendarEntry | null,
  _compact = false,
) {
  const markers: CalendarDateMarker[] = [];

  if (holiday) {
    markers.push({
      fullLabel: holiday.accessibilityLabel,
      kind: 'holiday',
      token: '공',
    });
  }
  if (payrollEntry) {
    markers.push({
      estimated: !payrollEntry.confirmed,
      fullLabel: payrollEntry.accessibilityLabel,
      kind: 'payday',
      token: payrollEntry.confirmed ? '급' : '급*',
    });
  }

  return { markers };
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
