import type { CalendarCell } from '../../utils/date';

export type CalendarGridFrame = Readonly<{
  width: number;
  x: number;
  y: number;
}>;

export type CalendarRowLayout = Readonly<{
  height: number;
  y: number;
}>;

export type ResolveCalendarDateAtPointInput = Readonly<{
  cellRows: readonly (readonly CalendarCell[])[];
  gridFrame: CalendarGridFrame;
  pageX: number;
  pageY: number;
  rowLayouts: Readonly<Record<number, CalendarRowLayout>>;
  selectableDateKeySet: ReadonlySet<string>;
}>;

/** 화면 좌표를 현재 측정된 달력 콘텐츠의 선택 가능한 날짜로 변환합니다. */
export function resolveCalendarDateAtPoint(
  input: ResolveCalendarDateAtPointInput,
): string | null {
  const {
    cellRows,
    gridFrame,
    pageX,
    pageY,
    rowLayouts,
    selectableDateKeySet,
  } = input;
  if (
    !Number.isFinite(pageX) ||
    !Number.isFinite(pageY) ||
    !Number.isFinite(gridFrame.x) ||
    !Number.isFinite(gridFrame.y) ||
    !Number.isFinite(gridFrame.width) ||
    gridFrame.width <= 0
  ) {
    return null;
  }

  const locationX = pageX - gridFrame.x;
  const locationY = pageY - gridFrame.y;
  if (locationX < 0 || locationX >= gridFrame.width) return null;

  const rowIndex = cellRows.findIndex((_, index) => {
    const layout = rowLayouts[index];
    return Boolean(
      layout &&
        Number.isFinite(layout.y) &&
        Number.isFinite(layout.height) &&
        layout.height > 0 &&
        locationY >= layout.y &&
        locationY < layout.y + layout.height,
    );
  });
  if (rowIndex < 0) return null;

  const cellWidth = gridFrame.width / 7;
  const weekdayIndex = Math.min(6, Math.floor(locationX / cellWidth));
  const cell = cellRows[rowIndex]?.[weekdayIndex];
  if (
    !cell?.inCurrentMonth ||
    !selectableDateKeySet.has(cell.dateKey)
  ) {
    return null;
  }
  return cell.dateKey;
}
