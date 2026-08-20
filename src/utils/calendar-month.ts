export const CALENDAR_MIN_YEAR = 1900;
export const CALENDAR_MAX_YEAR = 2200;

export type CalendarMonthRef = Readonly<{
  year: number;
  month: number;
}>;

export type CalendarMonthBoundary = 'minimum' | 'maximum';

export type CalendarMonthMoveResult =
  | Readonly<{ status: 'moved'; month: CalendarMonthRef }>
  | Readonly<{
      status: 'boundary';
      boundary: CalendarMonthBoundary;
      month: CalendarMonthRef;
    }>;

export type CalendarMonthNavigationState = Readonly<{
  canMoveNext: boolean;
  canMovePrevious: boolean;
}>;

export function shouldAnnounceCalendarMonthBoundary(
  lastAnnounced: CalendarMonthBoundary | null,
  nextBoundary: CalendarMonthBoundary,
): boolean {
  return lastAnnounced !== nextBoundary;
}

function assertCalendarMonth(month: CalendarMonthRef): void {
  if (
    !Number.isInteger(month.year) ||
    month.year < CALENDAR_MIN_YEAR ||
    month.year > CALENDAR_MAX_YEAR
  ) {
    throw new RangeError('달력 연도가 올바르지 않습니다.');
  }
  if (!Number.isInteger(month.month) || month.month < 0 || month.month > 11) {
    throw new RangeError('달력 월이 올바르지 않습니다.');
  }
}

export function getCalendarMonthKey(month: CalendarMonthRef): string {
  assertCalendarMonth(month);
  return `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
}

/** 지원 연도를 벗어나지 않도록 월 이동 결과와 경계를 구분합니다. */
export function moveCalendarMonthWithinRange(
  current: CalendarMonthRef,
  amount: number,
): CalendarMonthMoveResult {
  assertCalendarMonth(current);
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError('달력 이동 범위가 올바르지 않습니다.');
  }
  if (amount === 0) return { status: 'moved', month: current };

  const currentIndex = current.year * 12 + current.month;
  const nextIndex = currentIndex + amount;
  const minimumIndex = CALENDAR_MIN_YEAR * 12;
  const maximumIndex = CALENDAR_MAX_YEAR * 12 + 11;

  if (nextIndex < minimumIndex) {
    return { status: 'boundary', boundary: 'minimum', month: current };
  }
  if (nextIndex > maximumIndex) {
    return { status: 'boundary', boundary: 'maximum', month: current };
  }

  return {
    status: 'moved',
    month: {
      year: Math.floor(nextIndex / 12),
      month: nextIndex % 12,
    },
  };
}

export function resolveCalendarMonthNavigationState(
  month: CalendarMonthRef,
): CalendarMonthNavigationState {
  assertCalendarMonth(month);
  return {
    canMovePrevious:
      month.year > CALENDAR_MIN_YEAR || month.month > 0,
    canMoveNext:
      month.year < CALENDAR_MAX_YEAR || month.month < 11,
  };
}
