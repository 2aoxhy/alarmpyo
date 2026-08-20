import { describe, expect, it } from 'vitest';

import {
  buildCalendarSelectionCurrentMonthLabel,
  buildCalendarSelectionCountLabel,
  buildCalendarSelectionLiveRegionLabel,
  countCalendarSelectionInCurrentMonth,
  countUniqueCalendarSelection,
  formatCalendarSelectionPanelCount,
  resolveCalendarSelectionCountViewModel,
} from './calendar-selection-presentation';

describe('달력 선택 수 표시', () => {
  it('중복 날짜를 한 번만 계산합니다', () => {
    const dates = ['2026-08-15', '2026-08-15', '2026-08-16'];

    expect(countUniqueCalendarSelection(dates)).toBe(2);
    expect(resolveCalendarSelectionCountViewModel(dates)).toEqual({
      count: 2,
      currentMonthCount: 2,
      currentMonthLabel: '현재 달 2일 선택',
      hasSelection: true,
      heading: '2일 선택',
      liveRegionLabel: '선택한 날짜는 2일입니다.',
      totalCount: 2,
    });
  });

  it('전체 선택과 현재 달 선택 수를 함께 제공합니다', () => {
    const selected = new Set(['2026-08-31', '2026-09-01', '2026-09-02']);
    const currentMonth = ['2026-09-01', '2026-09-02', '2026-09-03'];

    expect(countCalendarSelectionInCurrentMonth(selected, currentMonth)).toBe(2);
    expect(resolveCalendarSelectionCountViewModel(selected, currentMonth)).toEqual({
      count: 3,
      currentMonthCount: 2,
      currentMonthLabel: '현재 달 2일 선택',
      hasSelection: true,
      heading: '3일 선택',
      liveRegionLabel: '전체 선택은 3일이며, 현재 달은 2일입니다.',
      totalCount: 3,
    });
  });

  it('선택이 없을 때 별도 안내를 반환합니다', () => {
    expect(buildCalendarSelectionCountLabel(0)).toBe('0일 선택');
    expect(buildCalendarSelectionLiveRegionLabel(0)).toBe(
      '선택한 날짜가 없습니다.',
    );
    expect(buildCalendarSelectionCurrentMonthLabel(0)).toBe(
      '현재 달에 선택한 날짜가 없습니다.',
    );
  });

  it('좁은 화면에서도 숫자와 일 단위를 분리하지 않습니다', () => {
    expect(formatCalendarSelectionPanelCount(5, 3)).toBe(
      '전체 5\u2060일 · 이 달 3\u2060일',
    );
  });

  it('잘못된 선택 수는 거부합니다', () => {
    expect(() => buildCalendarSelectionCountLabel(-1)).toThrow(RangeError);
    expect(() => buildCalendarSelectionLiveRegionLabel(1.5)).toThrow(
      RangeError,
    );
  });
});
