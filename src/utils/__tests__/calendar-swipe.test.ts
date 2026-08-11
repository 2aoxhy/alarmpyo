import { describe, expect, it } from 'vitest';

import {
  isCalendarHorizontalSwipe,
  resolveCalendarSwipeMonthOffset,
} from '../calendar-swipe';

describe('달력 좌우 밀기', () => {
  it('왼쪽으로 충분히 밀면 다음 달로 이동해요', () => {
    expect(resolveCalendarSwipeMonthOffset({ dx: -64, dy: 8, vx: -0.2 })).toBe(1);
  });

  it('오른쪽으로 충분히 밀면 이전 달로 이동해요', () => {
    expect(resolveCalendarSwipeMonthOffset({ dx: 58, dy: -4, vx: 0.2 })).toBe(-1);
  });

  it('짧지만 빠른 가로 밀기도 월 이동으로 처리해요', () => {
    expect(resolveCalendarSwipeMonthOffset({ dx: -24, dy: 2, vx: -0.8 })).toBe(1);
  });

  it('세로 스크롤과 짧은 움직임은 월 이동으로 처리하지 않아요', () => {
    expect(resolveCalendarSwipeMonthOffset({ dx: 22, dy: 48, vx: 0.8 })).toBe(0);
    expect(resolveCalendarSwipeMonthOffset({ dx: 20, dy: 3, vx: 0.2 })).toBe(0);
  });

  it('가로 움직임이 세로 움직임보다 뚜렷할 때만 제스처를 시작해요', () => {
    expect(isCalendarHorizontalSwipe({ dx: 18, dy: 4 })).toBe(true);
    expect(isCalendarHorizontalSwipe({ dx: 18, dy: 16 })).toBe(false);
  });
});
