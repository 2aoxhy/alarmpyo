import type { AppData } from '../models/app-data';
import { resolveCalendarLayout } from '../utils/calendar-layout';
import { buildCalendarGrid } from '../utils/date';
import {
  getKoreanHolidayDataStatus,
  getKoreanHolidaysForMonth,
} from '../utils/korean-holiday';
import { resolveEffectiveDayFromAppData } from './app-data-service';
import { buildMonthlyWorkSummary } from './monthly-work-summary';
import {
  getPayrollCalendarEntriesForMonth,
  getPayrollSchedule,
} from './payroll-schedule';

export function buildCalendarMonthViewModel(input: {
  data: AppData;
  year: number;
  month: number;
  windowWidth: number;
  fontScale: number;
}) {
  const { data, year, month, windowWidth, fontScale } = input;
  const resolveDay = (dateKey: string) =>
    resolveEffectiveDayFromAppData(data, dateKey);
  const fullGrid = buildCalendarGrid(year, month);
  let lastCurrentMonthIndex = fullGrid.length - 1;
  while (
    lastCurrentMonthIndex >= 0 &&
    !fullGrid[lastCurrentMonthIndex].inCurrentMonth
  ) {
    lastCurrentMonthIndex -= 1;
  }

  const visibleCellCount = Math.ceil((lastCurrentMonthIndex + 1) / 7) * 7;
  const cells = fullGrid.slice(0, visibleCellCount);
  const cellRows = Array.from({ length: cells.length / 7 }, (_, rowIndex) =>
    cells.slice(rowIndex * 7, rowIndex * 7 + 7),
  );
  const effectiveDays = new Map(
    cells
      .filter((cell) => cell.inCurrentMonth)
      .map((cell) => [cell.dateKey, resolveDay(cell.dateKey)] as const),
  );
  const selectableDateKeys = cells
    .filter(
      (cell) =>
        cell.inCurrentMonth &&
        Boolean(effectiveDays.get(cell.dateKey)?.scheduleActive),
    )
    .map((cell) => cell.dateKey);

  const resolveVisibleOrStoredDay = (dateKey: string) =>
    effectiveDays.get(dateKey) ?? resolveDay(dateKey);

  return {
    cells,
    cellRows,
    calendarLayout: resolveCalendarLayout(
      windowWidth,
      fontScale,
      cellRows.length,
    ),
    effectiveDays,
    selectableDateKeys,
    selectableDateKeySet: new Set(selectableDateKeys),
    holidays: getKoreanHolidaysForMonth(year, month),
    holidayDataStatus: getKoreanHolidayDataStatus(year),
    monthlySummary: buildMonthlyWorkSummary(
      year,
      month,
      resolveVisibleOrStoredDay,
    ),
    payrollSchedule: getPayrollSchedule(year, month),
    payrollEntries: getPayrollCalendarEntriesForMonth(year, month),
    resolveDay,
  };
}
