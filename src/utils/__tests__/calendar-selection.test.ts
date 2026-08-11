import { describe, expect, it } from 'vitest';

import {
  resolveCalendarDragSelection,
  resolveCalendarSelectionSegment,
  toggleCalendarDateSelection,
  type CalendarSelectionCell,
} from '../calendar-selection';

const row = (days: readonly number[], currentMonth = true): CalendarSelectionCell[] =>
  days.map((day) => ({
    dateKey: `2026-07-${String(day).padStart(2, '0')}`,
    inCurrentMonth: currentMonth,
  }));

describe('달력 연속 선택 표시', () => {
  const selectableDates = row([13, 14, 15, 16, 17, 18, 19, 20]).map(
    ({ dateKey }) => dateKey,
  );

  it('연속 입력을 기존 선택에 누적하고 다시 누른 날짜만 해제해요', () => {
    const first = toggleCalendarDateSelection([], '2026-07-16');
    const second = toggleCalendarDateSelection(first, '2026-07-15');
    const third = toggleCalendarDateSelection(second, '2026-07-17');

    expect(third).toEqual(['2026-07-15', '2026-07-16', '2026-07-17']);
    expect(toggleCalendarDateSelection(third, '2026-07-16')).toEqual([
      '2026-07-15',
      '2026-07-17',
    ]);
  });

  it('붙어 있는 세 날짜를 시작·중간·끝으로 연결해요', () => {
    const cells = row([12, 13, 14, 15, 16, 17, 18]);
    const selected = new Set(['2026-07-15', '2026-07-16', '2026-07-17']);

    expect(resolveCalendarSelectionSegment(cells, 3, selected)).toBe('start');
    expect(resolveCalendarSelectionSegment(cells, 4, selected)).toBe('middle');
    expect(resolveCalendarSelectionSegment(cells, 5, selected)).toBe('end');
  });

  it('일요일과 토요일 쪽 연속 선택도 바깥쪽 끝만 닫아 표시해요', () => {
    const cells = row([12, 13, 14, 15, 16, 17, 18]);
    const selected = new Set([
      '2026-07-12',
      '2026-07-13',
      '2026-07-17',
      '2026-07-18',
    ]);

    expect(resolveCalendarSelectionSegment(cells, 0, selected)).toBe('start');
    expect(resolveCalendarSelectionSegment(cells, 1, selected)).toBe('end');
    expect(resolveCalendarSelectionSegment(cells, 5, selected)).toBe('start');
    expect(resolveCalendarSelectionSegment(cells, 6, selected)).toBe('end');
  });

  it('중간 날짜가 비면 각각 독립된 선택으로 표시해요', () => {
    const cells = row([12, 13, 14, 15, 16, 17, 18]);
    const selected = new Set(['2026-07-15', '2026-07-17']);

    expect(resolveCalendarSelectionSegment(cells, 3, selected)).toBe('single');
    expect(resolveCalendarSelectionSegment(cells, 5, selected)).toBe('single');
  });

  it('주 경계를 넘어 다음 행과 연결하지 않아요', () => {
    const firstWeek = row([12, 13, 14, 15, 16, 17, 18]);
    const secondWeek = row([19, 20, 21, 22, 23, 24, 25]);
    const selected = new Set(['2026-07-18', '2026-07-19']);

    expect(resolveCalendarSelectionSegment(firstWeek, 6, selected)).toBe('single');
    expect(resolveCalendarSelectionSegment(secondWeek, 0, selected)).toBe('single');
  });

  it('현재 달이 아닌 빈 셀은 선택 연결에 포함하지 않아요', () => {
    const cells: CalendarSelectionCell[] = [
      { dateKey: '2026-06-30', inCurrentMonth: false },
      ...row([1, 2, 3, 4, 5, 6]),
    ];
    const selected = new Set(['2026-06-30', '2026-07-01']);

    expect(resolveCalendarSelectionSegment(cells, 0, selected)).toBeNull();
    expect(resolveCalendarSelectionSegment(cells, 1, selected)).toBe('single');
  });

  it('손가락이 날짜를 빠르게 건너뛰어도 사이 날짜를 모두 선택해요', () => {
    expect(
      resolveCalendarDragSelection([], selectableDates, '2026-07-15', '2026-07-19'),
    ).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
  });

  it('거꾸로 끌어도 날짜 범위를 시간순으로 선택해요', () => {
    expect(
      resolveCalendarDragSelection([], selectableDates, '2026-07-18', '2026-07-14'),
    ).toEqual([
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ]);
  });

  it('손가락을 되돌리면 이번 드래그 범위만 줄이고 기존 선택은 유지해요', () => {
    const baseSelection = ['2026-07-13', '2026-07-20'];
    const expanded = resolveCalendarDragSelection(
      baseSelection,
      selectableDates,
      '2026-07-15',
      '2026-07-19',
    );
    const contracted = resolveCalendarDragSelection(
      baseSelection,
      selectableDates,
      '2026-07-15',
      '2026-07-16',
    );

    expect(expanded).toEqual([
      '2026-07-13',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
      '2026-07-20',
    ]);
    expect(contracted).toEqual([
      '2026-07-13',
      '2026-07-15',
      '2026-07-16',
      '2026-07-20',
    ]);
  });

  it('첫 근무일 이전이나 현재 달 밖 날짜가 대상이면 선택을 바꾸지 않아요', () => {
    const baseSelection = ['2026-07-16'];

    expect(
      resolveCalendarDragSelection(
        baseSelection,
        selectableDates,
        '2026-07-15',
        '2026-07-12',
      ),
    ).toEqual(baseSelection);
    expect(
      resolveCalendarDragSelection(
        baseSelection,
        selectableDates,
        '2026-06-30',
        '2026-07-15',
      ),
    ).toEqual(baseSelection);
  });
});
