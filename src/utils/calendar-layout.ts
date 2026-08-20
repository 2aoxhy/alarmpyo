import { formatCompactTime, type CalendarCell } from './date';

export type CalendarLayout = {
  badgeUsesCompactLabel: boolean;
  cellMinHeight: number;
  cellWidth: number;
  dayBadgeSize: number;
  gridWidth: number;
  monthHeaderMinHeight: number;
  needsHorizontalScroll: boolean;
  presentation: 'month-grid' | 'week-list';
  screenInset: number;
};

const MAX_CONTENT_WIDTH = 720;
const MIN_SCREEN_INSET = 4;
const MAX_SCREEN_INSET = 12;
const MIN_MONTH_GRID_WIDTH = 336;
const WEEK_LIST_FONT_SCALE = 1.4;

export type CalendarWeekListDay = {
  cell: CalendarCell;
  weekdayIndex: number;
};

export type CalendarWeekListGroup = {
  days: readonly CalendarWeekListDay[];
  label: string;
  weekNumber: number;
};

type CalendarWeekListShiftTiming = Readonly<{
  endMinutes: number | null;
  endsNextDay: boolean;
  isOff: boolean;
  startMinutes: number | null;
}>;

export type CalendarWeekListMetadataKind =
  | 'holiday'
  | 'payday'
  | 'note'
  | 'override';

export type CalendarWeekListMetadataItem = Readonly<{
  kind: CalendarWeekListMetadataKind;
  label: string;
}>;

export function buildCalendarWeekListMetadata(input: {
  hasNote: boolean;
  hasOverride: boolean;
  holidayFullLabel: string | null;
  payrollFullLabel: string | null;
}): CalendarWeekListMetadataItem[] {
  const items: CalendarWeekListMetadataItem[] = [];
  if (input.holidayFullLabel) {
    items.push({
      kind: 'holiday',
      label: `공휴일 · ${input.holidayFullLabel}`,
    });
  }
  if (input.payrollFullLabel) {
    items.push({
      kind: 'payday',
      label: `급여일 · ${input.payrollFullLabel}`,
    });
  }
  if (input.hasNote) items.push({ kind: 'note', label: '메모 있음' });
  if (input.hasOverride) {
    items.push({ kind: 'override', label: '직접 변경' });
  }
  return items;
}

export function buildCalendarWeekListGroups(
  cellRows: readonly (readonly CalendarCell[])[],
): CalendarWeekListGroup[] {
  return cellRows.flatMap((row, rowIndex) => {
    const days = row.flatMap((cell, weekdayIndex) =>
      cell.inCurrentMonth ? [{ cell, weekdayIndex }] : [],
    );
    if (days.length === 0) return [];

    const firstDay = days[0].cell.day;
    const lastDay = days[days.length - 1].cell.day;
    const range =
      firstDay === lastDay ? `${firstDay}일` : `${firstDay}–${lastDay}일`;
    const weekNumber = rowIndex + 1;
    return [{ days, label: `${weekNumber}주차 · ${range}`, weekNumber }];
  });
}

export function formatCalendarWeekListTime(
  shift: CalendarWeekListShiftTiming | null,
): string | null {
  if (
    !shift ||
    shift.isOff ||
    shift.startMinutes === null ||
    shift.endMinutes === null
  ) {
    return null;
  }
  return `${formatCompactTime(shift.startMinutes)}–${
    shift.endsNextDay ? '다음 날 ' : ''
  }${formatCompactTime(shift.endMinutes)}`;
}

/** 화면 폭이 커질수록 날짜 칸이 갑자기 좁아지지 않도록 연속적인 여백을 계산해요. */
export function resolveCalendarLayout(
  viewportWidth: number,
  fontScale: number,
  rowCount = 6,
): CalendarLayout {
  const safeViewportWidth = Number.isFinite(viewportWidth)
    ? Math.max(viewportWidth, 0)
    : 0;
  const contentWidth = Math.min(safeViewportWidth, MAX_CONTENT_WIDTH);
  const screenInset = Math.min(
    MAX_SCREEN_INSET,
    Math.max(
      MIN_SCREEN_INSET,
      MIN_SCREEN_INSET + Math.max(contentWidth - 320, 0) * 0.05,
    ),
  );
  const visibleGridWidth = Math.max(contentWidth - screenInset * 2, 0);
  const safeFontScale = Number.isFinite(fontScale)
    ? Math.min(Math.max(fontScale, 1), 2)
    : 1;
  const presentation =
    visibleGridWidth >= MIN_MONTH_GRID_WIDTH &&
    safeFontScale < WEEK_LIST_FONT_SCALE
      ? 'month-grid'
      : 'week-list';
  const gridWidth = visibleGridWidth;
  const cellWidth = gridWidth / 7;
  const effectiveCellWidth = cellWidth / safeFontScale;
  const calendarGrowth = Math.round((safeFontScale - 1) * 22);
  const normalizedRowCount = Math.min(Math.max(Math.round(rowCount), 4), 6);
  const baseCellHeight = normalizedRowCount >= 6 ? 74 : normalizedRowCount === 5 ? 78 : 82;

  return {
    // 글자를 키운 경우에도 실제로 사용할 수 있는 폭을 기준으로 짧은 표기를 선택해요.
    badgeUsesCompactLabel: effectiveCellWidth < 62,
    cellMinHeight: baseCellHeight + calendarGrowth,
    cellWidth,
    dayBadgeSize: 27 + Math.round((safeFontScale - 1) * 9),
    gridWidth,
    monthHeaderMinHeight: 82 + calendarGrowth,
    needsHorizontalScroll: false,
    presentation,
    screenInset,
  };
}
