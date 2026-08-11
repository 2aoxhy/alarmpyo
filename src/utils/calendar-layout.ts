export type CalendarLayout = {
  badgeUsesCompactLabel: boolean;
  cellMinHeight: number;
  cellWidth: number;
  dayBadgeSize: number;
  gridWidth: number;
  monthHeaderMinHeight: number;
  needsHorizontalScroll: boolean;
  screenInset: number;
};

const MAX_CONTENT_WIDTH = 720;
const MIN_SCREEN_INSET = 4;
const MAX_SCREEN_INSET = 12;
const MIN_TOUCH_TARGET_SIZE = 48;
const MIN_GRID_WIDTH = MIN_TOUCH_TARGET_SIZE * 7;

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
  // 320dp 화면에서는 7개의 48dp 터치 영역이 물리적으로 들어가지 않으므로,
  // 날짜 영역에만 짧은 가로 탐색을 허용해 인접 날짜의 터치 영역이 겹치지 않게 해요.
  const gridWidth = Math.max(visibleGridWidth, MIN_GRID_WIDTH);
  const cellWidth = gridWidth / 7;
  const safeFontScale = Number.isFinite(fontScale)
    ? Math.min(Math.max(fontScale, 1), 2)
    : 1;
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
    needsHorizontalScroll: visibleGridWidth < MIN_GRID_WIDTH,
    screenInset,
  };
}
