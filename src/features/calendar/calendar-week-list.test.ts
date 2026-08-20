// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCalendarWeekListMetadata,
  buildCalendarWeekListGroups,
  formatCalendarWeekListTime,
} from '../../utils/calendar-layout';
import { buildCalendarGrid } from '../../utils/date';
import { isCalendarDayInteractionDisabled } from './calendar-day-presentation';

const weekListSource = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-week-list.tsx'),
  'utf8',
);
const monthCardSource = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-month-card.tsx'),
  'utf8',
);
const dayCellSource = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-day-cell.tsx'),
  'utf8',
);

function rowsFor(year: number, month: number) {
  const cells = buildCalendarGrid(year, month);
  return Array.from({ length: cells.length / 7 }, (_, rowIndex) =>
    cells.slice(rowIndex * 7, rowIndex * 7 + 7),
  );
}

describe('달력 주차 목록', () => {
  it('현재 달 날짜를 원래 달력 행과 같은 주차로 묶습니다', () => {
    const groups = buildCalendarWeekListGroups(rowsFor(2026, 7));

    expect(groups.map((group) => group.label)).toEqual([
      '1주차 · 1일',
      '2주차 · 2–8일',
      '3주차 · 9–15일',
      '4주차 · 16–22일',
      '5주차 · 23–29일',
      '6주차 · 30–31일',
    ]);
    expect(groups.flatMap((group) => group.days)).toHaveLength(31);
    expect(groups[1].days.map(({ cell }) => cell.day)).toEqual([
      2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it.each([
    { dayCount: 28, label: '2026년 2월', month: 1, weekCount: 4, year: 2026 },
    { dayCount: 31, label: '2026년 7월', month: 6, weekCount: 5, year: 2026 },
    { dayCount: 31, label: '2026년 8월', month: 7, weekCount: 6, year: 2026 },
    { dayCount: 29, label: '윤년 2024년 2월', month: 1, weekCount: 5, year: 2024 },
  ])('$label은 $weekCount개 주차와 $dayCount개 날짜를 유지합니다', ({
    dayCount,
    month,
    weekCount,
    year,
  }) => {
    const groups = buildCalendarWeekListGroups(rowsFor(year, month));
    const days = groups.flatMap((group) => group.days);

    expect(groups).toHaveLength(weekCount);
    expect(days).toHaveLength(dayCount);
    expect(days[0].cell.day).toBe(1);
    expect(days.at(-1)?.cell.day).toBe(dayCount);
    expect(new Set(days.map(({ cell }) => cell.dateKey)).size).toBe(dayCount);
  });

  it('날짜 행은 최소 48dp이며 큰 글자에서 세로로 재배치하고 말줄임표를 사용하지 않습니다', () => {
    expect(weekListSource).toContain('minHeight: 48');
    expect(weekListSource).toContain('const stacked = fontScale >= 1.4');
    expect(weekListSource).toContain('primaryRowStacked: {');
    expect(weekListSource).toContain("flexDirection: 'column'");
    expect(weekListSource).not.toContain('numberOfLines');
  });

  it('각 날짜 행은 목록 전용 길게 누르기와 선택 상태를 제공하고 드래그 응답자를 사용하지 않습니다', () => {
    expect(weekListSource).toContain('longPressHandledRef.current = true');
    expect(weekListSource).toContain('if (longPressHandledRef.current)');
    expect(weekListSource).toContain('onPressDate(cell.dateKey);');
    expect(weekListSource).toContain('onBeginListSelection?.(cell.dateKey)');
    expect(weekListSource).not.toContain('onBeginSelection');
    expect(weekListSource).toContain("accessibilityRole={selectionMode ? 'checkbox' : 'button'}");
    expect(weekListSource).toContain('aria-checked={selectionMode ? selected : undefined}');
    expect(dayCellSource).toContain('aria-checked={selectionMode ? isSelected : undefined}');
    expect(weekListSource).toContain('{ checked: selected, disabled: interactionDisabled }');
    expect(weekListSource).not.toContain('accessibilityState={{ disabled: !scheduleActive, selected }}');
    expect(weekListSource).toContain('누르면 날짜 요약을 엽니다.');
    expect(weekListSource).not.toContain('onResponderMove');
    expect(weekListSource).not.toContain('onTouchStart');
    expect(monthCardSource).toContain('onBeginListSelection?: (dateKey: string) => void');
    expect(monthCardSource).toContain('onBeginListSelection={onBeginListSelection}');
    expect(monthCardSource).toContain('onBeginSelection={onBeginSelection}');
  });

  it('시작일 이전 날짜는 정상 모드에서 요약을 열고 선택 모드에서만 비활성화합니다', () => {
    expect(
      isCalendarDayInteractionDisabled(false, false),
    ).toBe(false);
    expect(
      isCalendarDayInteractionDisabled(false, true),
    ).toBe(true);
    expect(
      isCalendarDayInteractionDisabled(true, true),
    ).toBe(false);
  });

  it('실제 근무 시간을 표시하고 다음 날 종료를 구분합니다', () => {
    const dayShift = {
      startMinutes: 6 * 60 + 45,
      endMinutes: 17 * 60 + 45,
      endsNextDay: false,
      isOff: false,
    };
    const nightShift = {
      ...dayShift,
      startMinutes: 17 * 60 + 45,
      endMinutes: 6 * 60 + 45,
      endsNextDay: true,
    };

    expect(formatCalendarWeekListTime(dayShift)).toBe('06:45–17:45');
    expect(formatCalendarWeekListTime(nightShift)).toBe(
      '17:45–다음 날 06:45',
    );
    expect(formatCalendarWeekListTime({ ...dayShift, isOff: true })).toBeNull();
    expect(weekListSource).not.toContain('numberOfLines');
    expect(weekListSource).toContain(
      'const accessibilityLabel = buildCalendarDayAccessibilityLabel(',
    );
    expect(weekListSource).not.toContain('근무 시간 ${shiftTimeLabel}');
  });

  it('날짜와 실제 근무 다음에 전체 메타데이터를 정해진 순서로 표시합니다', () => {
    expect(
      buildCalendarWeekListMetadata({
        hasNote: true,
        hasOverride: true,
        holidayFullLabel: '광복절',
        payrollFullLabel: '2026년 8월 월급날',
      }),
    ).toEqual([
      { kind: 'holiday', label: '공휴일 · 광복절' },
      { kind: 'payday', label: '급여일 · 2026년 8월 월급날' },
      { kind: 'note', label: '메모 있음' },
      { kind: 'override', label: '직접 변경' },
    ]);

    const dateIndex = weekListSource.indexOf('<View style={styles.dateMetadata}>');
    const workIndex = weekListSource.indexOf('styles.workBadge,', dateIndex);
    const metadataIndex = weekListSource.indexOf(
      '<CalendarWeekMetadataList',
      workIndex,
    );
    expect(dateIndex).toBeGreaterThan(-1);
    expect(workIndex).toBeGreaterThan(dateIndex);
    expect(metadataIndex).toBeGreaterThan(workIndex);
    expect(weekListSource).not.toContain('CalendarWeekMetadataMarkers');
    expect(weekListSource).not.toContain('marker.token');
  });

  it('월간 격자에서만 월 넘김 제스처를 연결하고 가로 스크롤을 만들지 않습니다', () => {
    expect(monthCardSource).toContain("calendarLayout.presentation === 'month-grid'");
    expect(monthCardSource).toContain('<CalendarWeekList');
    expect(monthCardSource).toContain('<View {...(showMonthGrid ? swipeViewProps : {})}>');
    expect(monthCardSource).not.toContain('ScrollView');
    expect(monthCardSource).not.toContain('horizontalScrollHint');
  });

  it('월 이동 버튼은 48dp이며 경계에서 비활성 상태를 전달할 수 있습니다', () => {
    expect(monthCardSource).toMatch(/navButton:\s*\{[\s\S]*?width: 48,[\s\S]*?height: 48,/);
    expect(monthCardSource).toContain('canGoPreviousMonth?: boolean');
    expect(monthCardSource).toContain('canGoNextMonth?: boolean');
    expect(monthCardSource).toContain('accessibilityState={{ disabled: !canGoPreviousMonth }}');
    expect(monthCardSource).toContain('accessibilityState={{ disabled: !canGoNextMonth }}');
    expect(monthCardSource).toContain('${monthlyWorkdayCount}일 근무`');
    expect(monthCardSource).not.toContain('근무 예정');
  });

  it('주차 목록은 전체 메타데이터와 근무·예외 의미색을 유지합니다', () => {
    expect(weekListSource).toContain('holiday?.accessibilityLabel ?? null');
    expect(weekListSource).toContain('payrollEntry?.accessibilityLabel ?? null');
    expect(weekListSource).toContain("item.kind === 'holiday'");
    expect(weekListSource).toContain("item.kind === 'payday'");
    expect(weekListSource).toContain('getDayExceptionAppearance(dayException, palette)');
    expect(weekListSource).toContain('getShiftAppearance(shift, palette, isDark)');
  });
});
