export type CalendarSelectionSegment = 'single' | 'start' | 'middle' | 'end' | null;

export type CalendarSelectionCell = {
  dateKey: string;
  inCurrentMonth: boolean;
};

/**
 * 길게 누른 날짜와 현재 손가락 위치 사이의 선택 가능한 날짜를 기존 선택에 더해요.
 * 매 이동마다 기준 선택에서 다시 계산하므로 손가락을 되돌려도 기존 선택은 유지돼요.
 */
export function resolveCalendarDragSelection(
  baseSelectedDateKeys: readonly string[],
  selectableDateKeys: readonly string[],
  anchorDateKey: string,
  currentDateKey: string,
): readonly string[] {
  const selectable = new Set(selectableDateKeys);
  if (!selectable.has(anchorDateKey) || !selectable.has(currentDateKey)) {
    return [...new Set(baseSelectedDateKeys)].sort();
  }

  const rangeStart = anchorDateKey < currentDateKey ? anchorDateKey : currentDateKey;
  const rangeEnd = anchorDateKey < currentDateKey ? currentDateKey : anchorDateKey;
  const next = new Set(baseSelectedDateKeys);

  for (const dateKey of selectableDateKeys) {
    if (dateKey >= rangeStart && dateKey <= rangeEnd) next.add(dateKey);
  }

  return [...next].sort();
}

/** 빠르게 여러 날짜를 눌러도 이전 선택을 잃지 않도록 새 배열을 반환해요. */
export function toggleCalendarDateSelection(
  selectedDateKeys: readonly string[],
  dateKey: string,
): readonly string[] {
  const next = new Set(selectedDateKeys);
  if (next.has(dateKey)) next.delete(dateKey);
  else next.add(dateKey);
  return [...next].sort();
}

/** 같은 주에서 화면상 바로 붙어 있는 선택 날짜의 연결 위치를 계산해요. */
export function resolveCalendarSelectionSegment(
  row: readonly CalendarSelectionCell[],
  index: number,
  selectedDateKeys: ReadonlySet<string>,
): CalendarSelectionSegment {
  const cell = row[index];
  if (!cell?.inCurrentMonth || !selectedDateKeys.has(cell.dateKey)) return null;

  const previous = index > 0 ? row[index - 1] : null;
  const next = index < row.length - 1 ? row[index + 1] : null;
  const joinsPrevious = Boolean(
    previous?.inCurrentMonth && selectedDateKeys.has(previous.dateKey),
  );
  const joinsNext = Boolean(next?.inCurrentMonth && selectedDateKeys.has(next.dateKey));

  if (!joinsPrevious && !joinsNext) return 'single';
  if (!joinsPrevious) return 'start';
  if (!joinsNext) return 'end';
  return 'middle';
}
