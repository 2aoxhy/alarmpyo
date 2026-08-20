import type {
  CalendarDateSummaryViewModel,
  CalendarDayViewModel,
} from '../../services/calendar-month-view-model';
import type { ShiftType } from '../../models/app-data';
import { formatCompactTime, formatKoreanDate } from '../../utils/date';
import { getDayExceptionLabel } from '../../utils/day-exception';

export type CalendarDayAccessibilityOptions = Readonly<{
  isToday?: boolean;
}>;

export function isCalendarDayInteractionDisabled(
  scheduleActive: boolean,
  selectionMode: boolean,
): boolean {
  return selectionMode && !scheduleActive;
}

export function formatCalendarShiftTime(
  shift: ShiftType | null | undefined,
): string | null {
  if (
    !shift ||
    shift.isOff ||
    shift.startMinutes === null ||
    shift.endMinutes === null
  ) {
    return null;
  }
  return `${formatCompactTime(shift.startMinutes)}부터 ${
    shift.endsNextDay ? '다음 날 ' : ''
  }${formatCompactTime(shift.endMinutes)}까지`;
}

/** 날짜 셀의 시각 표식과 별개로 TalkBack이 한 번 읽을 전체 문장을 만듭니다. */
export function buildCalendarDayAccessibilityLabel(
  day: CalendarDayViewModel,
  options: CalendarDayAccessibilityOptions = {},
): string {
  const parts = [formatKoreanDate(day.dateKey, true)];
  if (options.isToday) parts.push('오늘');

  const effectiveDay = day.effectiveDay;
  if (!effectiveDay?.scheduleActive) {
    parts.push('일정 적용 시작일 이전 날짜');
  } else {
    const shiftName = effectiveDay.shift?.name ?? '일정 없음';
    const dayExceptionLabel = effectiveDay.dayException
      ? getDayExceptionLabel(effectiveDay.dayException)
      : null;

    if (dayExceptionLabel) {
      parts.push(`예외 일정 ${dayExceptionLabel}`);
    } else {
      parts.push(shiftName);
      if (effectiveDay.shift?.id.startsWith('substitute-')) parts.push('특근');
    }
    const shiftTime = formatCalendarShiftTime(effectiveDay.shift);
    if (shiftTime) parts.push(`근무 시간 ${shiftTime}`);
    parts.push(
      dayExceptionLabel
        ? '특별 일정 적용'
        : day.hasDirectScheduleOverride
          ? '직접 변경한 날'
          : '기본 근무표',
    );
  }

  if (day.holiday) parts.push(day.holiday.accessibilityLabel);
  if (day.payrollEntry) parts.push(day.payrollEntry.accessibilityLabel);
  if (day.hasNote) parts.push('메모 있음');
  return parts.join(', ');
}

export function buildCalendarDateSummaryAccessibilityLabel(
  summary: CalendarDateSummaryViewModel,
): string {
  const parts = [formatKoreanDate(summary.dateKey)];
  if (summary.holidayFullLabel) {
    parts.push(`공휴일 ${summary.holidayFullLabel}`);
  }
  if (summary.payrollFullLabel) {
    parts.push(
      `${summary.payrollEstimated ? '예상 급여일' : '급여일'} ${summary.payrollFullLabel}`,
    );
  }
  return parts.join(', ');
}
