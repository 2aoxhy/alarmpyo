export type CalendarSelectionCountViewModel = Readonly<{
  count: number;
  currentMonthCount: number;
  currentMonthLabel: string;
  hasSelection: boolean;
  heading: string;
  liveRegionLabel: string;
  totalCount: number;
}>;

function assertSelectionCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('선택한 날짜 수가 올바르지 않습니다.');
  }
}

export function countUniqueCalendarSelection(
  selectedDateKeys: readonly string[] | ReadonlySet<string>,
): number {
  return new Set(selectedDateKeys).size;
}

export function countCalendarSelectionInCurrentMonth(
  selectedDateKeys: readonly string[] | ReadonlySet<string>,
  currentMonthDateKeys: readonly string[] | ReadonlySet<string>,
): number {
  const currentMonth = new Set(currentMonthDateKeys);
  return [...new Set(selectedDateKeys)].filter((dateKey) =>
    currentMonth.has(dateKey),
  ).length;
}

export function buildCalendarSelectionCountLabel(count: number): string {
  assertSelectionCount(count);
  return `${count}일 선택`;
}

export function buildCalendarSelectionLiveRegionLabel(count: number): string {
  assertSelectionCount(count);
  return count === 0
    ? '선택한 날짜가 없습니다.'
    : `선택한 날짜는 ${count}일입니다.`;
}

export function buildCalendarSelectionCurrentMonthLabel(
  currentMonthCount: number,
): string {
  assertSelectionCount(currentMonthCount);
  return currentMonthCount === 0
    ? '현재 달에 선택한 날짜가 없습니다.'
    : `현재 달 ${currentMonthCount}일 선택`;
}

export function formatCalendarSelectionPanelCount(
  selectedCount: number,
  selectedInMonthCount: number,
): string {
  assertSelectionCount(selectedCount);
  assertSelectionCount(selectedInMonthCount);
  return `전체 ${selectedCount}\u2060일 · 이 달 ${selectedInMonthCount}\u2060일`;
}

export function resolveCalendarSelectionCountViewModel(
  selectedDateKeys: readonly string[] | ReadonlySet<string>,
  currentMonthDateKeys?: readonly string[] | ReadonlySet<string>,
): CalendarSelectionCountViewModel {
  const selected = new Set(selectedDateKeys);
  const count = selected.size;
  const currentMonthCount = currentMonthDateKeys
    ? countCalendarSelectionInCurrentMonth(selected, currentMonthDateKeys)
    : count;
  const liveRegionLabel =
    currentMonthCount === count
      ? buildCalendarSelectionLiveRegionLabel(count)
      : count === 0
        ? buildCalendarSelectionLiveRegionLabel(0)
        : `전체 선택은 ${count}일이며, 현재 달은 ${currentMonthCount}일입니다.`;
  return {
    count,
    currentMonthCount,
    currentMonthLabel:
      buildCalendarSelectionCurrentMonthLabel(currentMonthCount),
    hasSelection: count > 0,
    heading: buildCalendarSelectionCountLabel(count),
    liveRegionLabel,
    totalCount: count,
  };
}
