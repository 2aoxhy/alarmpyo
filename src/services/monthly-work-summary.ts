import type { DayExceptionType, ShiftType } from '../models/app-data';
import { DAY_EXCEPTION_TYPES } from '../utils/day-exception';
import { addDays, isValidDateKey, toDateKey } from '../utils/date';
import type { ResolveEffectiveDay } from './app-data-service';

export type MonthlyWorkSummary = {
  year: number;
  month: number;
  periodStartDateKey: string;
  periodEndDateKey: string;
  workdayCount: number;
  offdayCount: number;
  dayShiftCount: number;
  nightShiftCount: number;
  substituteCount: number;
  totalMinutes: number;
  dayMinutes: number;
  nightMinutes: number;
  exceptionCounts: Record<DayExceptionType, number>;
};

function assertMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new RangeError('요약할 연도가 올바르지 않아요.');
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError('요약할 월이 올바르지 않아요.');
  }
}

export function getShiftDurationMinutes(shift: ShiftType | null): number {
  if (
    !shift ||
    shift.isOff ||
    shift.startMinutes === null ||
    shift.endMinutes === null
  ) {
    return 0;
  }

  const endMinutes =
    shift.endsNextDay || shift.endMinutes < shift.startMinutes
      ? shift.endMinutes + 24 * 60
      : shift.endMinutes;
  return Math.max(0, endMinutes - shift.startMinutes);
}

function buildWorkSummary(
  year: number,
  month: number,
  periodStartDateKey: string,
  periodEndDateKey: string,
  resolveDay: ResolveEffectiveDay,
): MonthlyWorkSummary {
  assertMonth(year, month);
  if (
    !isValidDateKey(periodStartDateKey) ||
    !isValidDateKey(periodEndDateKey) ||
    periodStartDateKey > periodEndDateKey
  ) {
    throw new RangeError('요약할 기간이 올바르지 않아요.');
  }
  const summary: MonthlyWorkSummary = {
    year,
    month,
    periodStartDateKey,
    periodEndDateKey,
    workdayCount: 0,
    offdayCount: 0,
    dayShiftCount: 0,
    nightShiftCount: 0,
    substituteCount: 0,
    totalMinutes: 0,
    dayMinutes: 0,
    nightMinutes: 0,
    exceptionCounts: {
      leave: 0,
      training: 0,
      reserve: 0,
    },
  };

  for (
    let dateKey = periodStartDateKey;
    dateKey <= periodEndDateKey;
    dateKey = addDays(dateKey, 1)
  ) {
    const effectiveDay = resolveDay(dateKey);
    if (!effectiveDay.scheduleActive) continue;
    const dayException = effectiveDay.dayException;
    if (dayException && DAY_EXCEPTION_TYPES.includes(dayException)) {
      summary.exceptionCounts[dayException] += 1;
    }
    const shift = effectiveDay.shift;
    const duration = getShiftDurationMinutes(shift);
    if (!shift) continue;
    if (shift.isOff || duration === 0) {
      summary.offdayCount += 1;
      continue;
    }

    const isNight = shift.id.includes('night') || shift.endsNextDay;
    summary.workdayCount += 1;
    summary.totalMinutes += duration;
    if (shift.id.startsWith('substitute-')) summary.substituteCount += 1;
    if (isNight) {
      summary.nightShiftCount += 1;
      summary.nightMinutes += duration;
    } else {
      summary.dayShiftCount += 1;
      summary.dayMinutes += duration;
    }
  }

  return summary;
}

/** 선택한 달의 실제 근무와 날짜별 시간 변경을 기준으로 요약해요. */
export function buildMonthlyWorkSummary(
  year: number,
  month: number,
  resolveDay: ResolveEffectiveDay,
): MonthlyWorkSummary {
  assertMonth(year, month);
  return buildWorkSummary(
    year,
    month,
    toDateKey(new Date(year, month, 1, 12)),
    toDateKey(new Date(year, month + 1, 0, 12)),
    resolveDay,
  );
}
