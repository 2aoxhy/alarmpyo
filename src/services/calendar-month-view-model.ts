import type {
  AppData,
  DayExceptionType,
  ShiftType,
} from '../models/app-data';
import { resolveCalendarLayout } from '../utils/calendar-layout';
import type { CalendarLayout } from '../utils/calendar-layout';
import { buildCalendarGrid, type CalendarCell } from '../utils/date';
import {
  getCalendarMonthKey,
  type CalendarMonthRef,
} from '../utils/calendar-month';
import {
  getKoreanHolidayDataStatus,
  getKoreanHolidaysForMonth,
  type KoreanHolidayDataStatus,
  type KoreanHolidayInfo,
} from '../utils/korean-holiday';
import {
  resolveEffectiveDay,
  type EffectiveDay,
  type ResolveEffectiveDay,
} from './pattern-engine';
import {
  buildMonthlyWorkSummary,
  type MonthlyWorkSummary,
} from './monthly-work-summary';
import {
  getPayrollCalendarEntriesForMonth,
  getPayrollSchedule,
  type PayrollCalendarEntry,
  type PayrollSchedule,
} from './payroll-schedule';

export type CalendarProjectionData = Pick<
  AppData,
  | 'dayExceptions'
  | 'notes'
  | 'overrides'
  | 'pattern'
  | 'payrollSettings'
  | 'shiftTypes'
  | 'timeOverrides'
>;

/** 달력 계산에 필요한 저장 데이터만 명시적으로 선택합니다. */
export function selectCalendarProjectionData(
  data: AppData,
): CalendarProjectionData {
  return {
    dayExceptions: data.dayExceptions,
    notes: data.notes,
    overrides: data.overrides,
    pattern: data.pattern,
    payrollSettings: data.payrollSettings,
    shiftTypes: data.shiftTypes,
    timeOverrides: data.timeOverrides,
  };
}

export type CalendarDayViewModel = Readonly<{
  basePatternDay: EffectiveDay | null;
  cell: CalendarCell;
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  effectiveDay: EffectiveDay | null;
  hasDirectScheduleOverride: boolean;
  hasShiftOverride: boolean;
  hasTimeOverride: boolean;
  hasNote: boolean;
  holiday: KoreanHolidayInfo | null;
  isSelectable: boolean;
  note: string | null;
  payrollEntry: PayrollCalendarEntry | null;
}>;

export type CalendarWeekSection = Readonly<{
  id: string;
  index: number;
  days: readonly CalendarDayViewModel[];
}>;

export type CalendarDateSummaryViewModel = Readonly<{
  basePatternShift: ShiftType | null;
  dateKey: string;
  dayException: DayExceptionType | null;
  effectiveShift: ShiftType | null;
  hasDirectScheduleOverride: boolean;
  hasShiftOverride: boolean;
  hasTimeOverride: boolean;
  holidayFullLabel: string | null;
  holidayLabel: string | null;
  note: string | null;
  payrollAdjusted: boolean;
  payrollEstimated: boolean;
  payrollFullLabel: string | null;
  payrollLabel: string | null;
  scheduleActive: boolean;
  scheduledShift: ShiftType | null;
}>;

export type CalendarMonthViewModel = Readonly<{
  calendarLayout: CalendarLayout;
  cellRows: readonly (readonly CalendarCell[])[];
  cells: readonly CalendarCell[];
  currentMonthDateKeys: readonly string[];
  dateSummaryByDate: ReadonlyMap<string, CalendarDateSummaryViewModel>;
  dateSummaries: readonly CalendarDateSummaryViewModel[];
  daysByDate: ReadonlyMap<string, CalendarDayViewModel>;
  effectiveDays: ReadonlyMap<string, EffectiveDay>;
  holidayDataStatus: KoreanHolidayDataStatus;
  holidays: Readonly<Record<string, KoreanHolidayInfo>>;
  month: CalendarMonthRef;
  monthKey: string;
  monthlySummary: MonthlyWorkSummary;
  payrollEntries: Readonly<Record<string, PayrollCalendarEntry>>;
  payrollSchedule: PayrollSchedule;
  resolveDay: ResolveEffectiveDay;
  selectableDateKeys: readonly string[];
  selectableDateKeySet: ReadonlySet<string>;
  weekSections: readonly CalendarWeekSection[];
}>;

export function resolveCalendarDayViewModel(input: {
  basePatternDay?: EffectiveDay | null;
  cell: CalendarCell;
  effectiveDay: EffectiveDay | null;
  hasDirectScheduleOverride?: boolean;
  hasShiftOverride?: boolean;
  hasTimeOverride?: boolean;
  hasNote?: boolean;
  holiday?: KoreanHolidayInfo | null;
  note?: string | null;
  payrollEntry?: PayrollCalendarEntry | null;
}): CalendarDayViewModel {
  const { cell, effectiveDay } = input;
  const inCurrentMonth = cell.inCurrentMonth;
  const scheduleActive = Boolean(
    inCurrentMonth && effectiveDay?.scheduleActive,
  );

  return {
    basePatternDay: inCurrentMonth ? input.basePatternDay ?? null : null,
    cell,
    dateKey: cell.dateKey,
    day: cell.day,
    inCurrentMonth,
    effectiveDay: inCurrentMonth ? effectiveDay : null,
    hasDirectScheduleOverride:
      scheduleActive && Boolean(input.hasDirectScheduleOverride),
    hasShiftOverride: scheduleActive && Boolean(input.hasShiftOverride),
    hasTimeOverride: scheduleActive && Boolean(input.hasTimeOverride),
    hasNote: inCurrentMonth && Boolean(input.hasNote),
    holiday: inCurrentMonth ? input.holiday ?? null : null,
    isSelectable: scheduleActive,
    note: inCurrentMonth ? input.note ?? null : null,
    payrollEntry: inCurrentMonth ? input.payrollEntry ?? null : null,
  };
}

export function buildCalendarWeekSections(
  cellRows: readonly (readonly CalendarCell[])[],
  daysByDate: ReadonlyMap<string, CalendarDayViewModel>,
): readonly CalendarWeekSection[] {
  return cellRows.map((row, index) => {
    const days = row.map((cell) => {
      const day = daysByDate.get(cell.dateKey);
      if (!day) {
        throw new Error(`달력 날짜 표시 모델이 없습니다: ${cell.dateKey}`);
      }
      return day;
    });
    return {
      id: row[0]?.dateKey ?? `week-${index}`,
      index,
      days,
    };
  });
}

export function buildCalendarDateSummaryViewModels(
  days: readonly CalendarDayViewModel[],
): readonly CalendarDateSummaryViewModel[] {
  return days.flatMap((day) => {
    if (!day.inCurrentMonth) return [];
    return [
      {
        basePatternShift: day.basePatternDay?.shift ?? null,
        dateKey: day.dateKey,
        dayException: day.effectiveDay?.dayException ?? null,
        effectiveShift: day.effectiveDay?.shift ?? null,
        hasDirectScheduleOverride: day.hasDirectScheduleOverride,
        hasShiftOverride: day.hasShiftOverride,
        hasTimeOverride: day.hasTimeOverride,
        holidayFullLabel: day.holiday?.accessibilityLabel ?? null,
        holidayLabel: day.holiday?.displayLabel ?? null,
        note: day.note,
        payrollAdjusted: day.payrollEntry?.adjusted ?? false,
        payrollEstimated: day.payrollEntry
          ? !day.payrollEntry.confirmed
          : false,
        payrollFullLabel: day.payrollEntry?.accessibilityLabel ?? null,
        payrollLabel: day.payrollEntry?.displayLabel ?? null,
        scheduleActive: Boolean(day.effectiveDay?.scheduleActive),
        scheduledShift: day.effectiveDay?.scheduledShift ?? null,
      },
    ];
  });
}

export function buildCalendarMonthViewModel(input: {
  data: CalendarProjectionData;
  year: number;
  month: number;
  windowWidth: number;
  fontScale: number;
}): CalendarMonthViewModel {
  const { data, year, month, windowWidth, fontScale } = input;
  const resolveDay = (dateKey: string) =>
    resolveEffectiveDay(data, dateKey);
  const patternOnlyData = {
    ...data,
    dayExceptions: {},
    overrides: {},
    timeOverrides: {},
  } satisfies CalendarProjectionData;
  const resolveBasePatternDay = (dateKey: string) =>
    resolveEffectiveDay(patternOnlyData, dateKey);
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
  const holidays = getKoreanHolidaysForMonth(year, month);
  const payrollEntries = getPayrollCalendarEntriesForMonth(
    year,
    month,
    data.payrollSettings,
  );
  const effectiveDays = new Map(
    cells
      .filter((cell) => cell.inCurrentMonth)
      .map((cell) => [cell.dateKey, resolveDay(cell.dateKey)] as const),
  );
  const calendarDays = cells.map((cell) => {
    const effectiveDay = effectiveDays.get(cell.dateKey) ?? null;
    const hasShiftOverride = Object.prototype.hasOwnProperty.call(
      data.overrides,
      cell.dateKey,
    );
    const hasTimeOverride = Object.prototype.hasOwnProperty.call(
      data.timeOverrides,
      cell.dateKey,
    );
    const storedNote = data.notes[cell.dateKey];
    const note = storedNote ? storedNote : null;
    return resolveCalendarDayViewModel({
      basePatternDay: cell.inCurrentMonth
        ? resolveBasePatternDay(cell.dateKey)
        : null,
      cell,
      effectiveDay,
      hasDirectScheduleOverride: hasShiftOverride || hasTimeOverride,
      hasShiftOverride,
      hasTimeOverride,
      hasNote: Boolean(note),
      holiday: holidays[cell.dateKey] ?? null,
      note,
      payrollEntry: payrollEntries[cell.dateKey] ?? null,
    });
  });
  const daysByDate = new Map(
    calendarDays.map((day) => [day.dateKey, day] as const),
  );
  const currentMonthDays = calendarDays.filter((day) => day.inCurrentMonth);
  const currentMonthDateKeys = currentMonthDays.map((day) => day.dateKey);
  const dateSummaries = buildCalendarDateSummaryViewModels(currentMonthDays);
  const dateSummaryByDate = new Map(
    dateSummaries.map((summary) => [summary.dateKey, summary] as const),
  );
  const selectableDateKeys = currentMonthDays
    .filter((day) => day.isSelectable)
    .map((day) => day.dateKey);

  const resolveVisibleOrStoredDay = (dateKey: string) =>
    effectiveDays.get(dateKey) ?? resolveDay(dateKey);

  const calendarMonth = { year, month };

  return {
    month: calendarMonth,
    monthKey: getCalendarMonthKey(calendarMonth),
    cells,
    cellRows,
    currentMonthDateKeys,
    dateSummaryByDate,
    daysByDate,
    weekSections: buildCalendarWeekSections(cellRows, daysByDate),
    dateSummaries,
    calendarLayout: resolveCalendarLayout(
      windowWidth,
      fontScale,
      cellRows.length,
    ),
    effectiveDays,
    selectableDateKeys,
    selectableDateKeySet: new Set(selectableDateKeys),
    holidays,
    holidayDataStatus: getKoreanHolidayDataStatus(year),
    monthlySummary: buildMonthlyWorkSummary(
      year,
      month,
      resolveVisibleOrStoredDay,
    ),
    payrollSchedule: getPayrollSchedule(year, month, data.payrollSettings),
    payrollEntries,
    resolveDay,
  };
}
