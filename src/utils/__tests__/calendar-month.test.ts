import { describe, expect, it } from 'vitest';

import {
  CALENDAR_MAX_YEAR,
  CALENDAR_MIN_YEAR,
  getCalendarMonthKey,
  moveCalendarMonthWithinRange,
  resolveCalendarMonthNavigationState,
  shouldAnnounceCalendarMonthBoundary,
} from '../calendar-month';

describe('달력 월 이동 범위', () => {
  it('1월과 12월 사이에서 연도를 올바르게 넘깁니다', () => {
    expect(
      moveCalendarMonthWithinRange({ year: 2026, month: 0 }, -1),
    ).toEqual({ status: 'moved', month: { year: 2025, month: 11 } });
    expect(
      moveCalendarMonthWithinRange({ year: 2026, month: 11 }, 1),
    ).toEqual({ status: 'moved', month: { year: 2027, month: 0 } });
  });

  it('지원 범위를 벗어나면 현재 월과 경계를 반환합니다', () => {
    const minimum = { year: CALENDAR_MIN_YEAR, month: 0 };
    const maximum = { year: CALENDAR_MAX_YEAR, month: 11 };

    expect(moveCalendarMonthWithinRange(minimum, -1)).toEqual({
      status: 'boundary',
      boundary: 'minimum',
      month: minimum,
    });
    expect(moveCalendarMonthWithinRange(maximum, 1)).toEqual({
      status: 'boundary',
      boundary: 'maximum',
      month: maximum,
    });
    expect(resolveCalendarMonthNavigationState(minimum)).toEqual({
      canMovePrevious: false,
      canMoveNext: true,
    });
    expect(resolveCalendarMonthNavigationState(maximum)).toEqual({
      canMovePrevious: true,
      canMoveNext: false,
    });
  });

  it('여러 달 이동과 안정적인 월 키를 지원합니다', () => {
    expect(
      moveCalendarMonthWithinRange({ year: 2026, month: 6 }, 18),
    ).toEqual({ status: 'moved', month: { year: 2028, month: 0 } });
    expect(getCalendarMonthKey({ year: 2026, month: 6 })).toBe('2026-07');
  });

  it('같은 월 경계 안내는 연속해서 한 번만 허용합니다', () => {
    expect(shouldAnnounceCalendarMonthBoundary(null, 'minimum')).toBe(true);
    expect(shouldAnnounceCalendarMonthBoundary('minimum', 'minimum')).toBe(false);
    expect(shouldAnnounceCalendarMonthBoundary('minimum', 'maximum')).toBe(true);
  });

  it('잘못된 월이나 이동량은 거부합니다', () => {
    expect(() =>
      moveCalendarMonthWithinRange({ year: 2026, month: 12 }, 1),
    ).toThrow(RangeError);
    expect(() =>
      moveCalendarMonthWithinRange({ year: 2026, month: 6 }, 0.5),
    ).toThrow(RangeError);
  });
});
