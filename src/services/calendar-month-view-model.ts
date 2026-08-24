import type {
  AppData,
  DayAlarmOverride,
  DayExceptionType,
  ShiftType,
} from '../models/app-data';
import { resolveCalendarLayout } from '../utils/calendar-layout';
import type { CalendarLayout } from '../utils/calendar-layout';
import {
  buildCalendarGrid,
  parseDateKey,
  toDateKey,
  type CalendarCell,
} from '../utils/date';
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
  | 'alarmOverrides'
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
    alarmOverrides: data.alarmOverrides,
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
  alarmOverride: DayAlarmOverride | null;
  automaticScheduleHidden: boolean;
  basePatternDay: EffectiveDay | null;
  cell: CalendarCell;
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  effectiveDay: EffectiveDay | null;
  hasDirectScheduleOverride: boolean;
  hasAlarmOverride: boolean;
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
  alarmOverride: DayAlarmOverride | null;
  automaticScheduleHidden: boolean;
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
  automaticScheduleDisplayWindow: CalendarAutomaticScheduleDisplayWindow;
  automaticScheduleHiddenDateKeySet: ReadonlySet<string>;
  automaticScheduleVisible: boolean;
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
  scheduleStartDateInMonth: string | null;
  selectableDateKeys: readonly string[];
  selectableDateKeySet: ReadonlySet<string>;
  weekSections: readonly CalendarWeekSection[];
}>;

export type CalendarAutomaticScheduleDisplayWindow = Readonly<{
  startDate: string;
  endDate: string;
}>;

/** 자동 반복 근무는 오늘이 속한 달을 기준으로 앞뒤 3개월까지만 표시합니다. */
export function resolveCalendarAutomaticScheduleDisplayWindow(
  referenceDateKey: string,
): CalendarAutomaticScheduleDisplayWindow {
  const reference = parseDateKey(referenceDateKey);
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth() - 3,
    1,
    12,
  );
  const end = new Date(
    reference.getFullYear(),
    reference.getMonth() + 4,
    0,
    12,
  );
  return { startDate: toDateKey(start), endDate: toDateKey(end) };
}

export function isCalendarAutomaticScheduleVisible(
  dateKey: string,
  window: CalendarAutomaticScheduleDisplayWindow,
): boolean {
  return dateKey >= window.startDate && dateKey <= window.endDate;
}

export function resolveCalendarDayViewModel(input: {
  alarmOverride?: DayAlarmOverride | null;
  automaticScheduleHidden?: boolean;
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
    alarmOverride: inCurrentMonth ? input.alarmOverride ?? null : null,
    automaticScheduleHidden:
      inCurrentMonth && Boolean(input.automaticScheduleHidden),
    basePatternDay: inCurrentMonth ? input.basePatternDay ?? null : null,
    cell,
    dateKey: cell.dateKey,
    day: cell.day,
    inCurrentMonth,
    effectiveDay: inCurrentMonth ? effectiveDay : null,
    hasDirectScheduleOverride:
      scheduleActive && Boolean(input.hasDirectScheduleOverride),
    hasAlarmOverride:
      scheduleActive && Boolean(input.alarmOverride),
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
        alarmOverride: day.alarmOverride,
        automaticScheduleHidden: day.automaticScheduleHidden,
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
  automaticScheduleReferenceDateKey: string;
  data: CalendarProjectionData;
  year: number;
  month: number;
  windowWidth: number;
  fontScale: number;
}): CalendarMonthViewModel {
  const {
    automaticScheduleReferenceDateKey,
    data,
    year,
    month,
    windowWidth,
    fontScale,
  } = input;
  const automaticScheduleDisplayWindow =
    resolveCalendarAutomaticScheduleDisplayWindow(
      automaticScheduleReferenceDateKey,
    );
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
      .map((cell) => {
        const effectiveDay = resolveDay(cell.dateKey);
        const automaticScheduleVisible =
          isCalendarAutomaticScheduleVisible(
            cell.dateKey,
            automaticScheduleDisplayWindow,
          );
        const hasDirectSchedule =
          Object.prototype.hasOwnProperty.call(data.overrides, cell.dateKey) ||
          Object.prototype.hasOwnProperty.call(data.timeOverrides, cell.dateKey) ||
          Object.prototype.hasOwnProperty.call(data.dayExceptions, cell.dateKey);
        const displayDay =
          effectiveDay.scheduleActive &&
          !automaticScheduleVisible &&
          !hasDirectSchedule
            ? {
                ...effectiveDay,
                scheduledShift: null,
                shift: null,
                dayException: undefined,
              }
            : effectiveDay;
        return [cell.dateKey, displayDay] as const;
      }),
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
    const alarmOverride = data.alarmOverrides[cell.dateKey] ?? null;
    const automaticScheduleHidden = Boolean(
      cell.inCurrentMonth &&
      effectiveDay?.scheduleActive &&
      !isCalendarAutomaticScheduleVisible(
        cell.dateKey,
        automaticScheduleDisplayWindow,
      ) &&
      !hasShiftOverride &&
      !hasTimeOverride &&
      !Object.prototype.hasOwnProperty.call(data.dayExceptions, cell.dateKey),
    );
    const storedNote = data.notes[cell.dateKey];
    const note = storedNote ? storedNote : null;
    return resolveCalendarDayViewModel({
      alarmOverride,
      automaticScheduleHidden,
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
  const automaticScheduleHiddenDateKeySet = new Set(
    currentMonthDays
      .filter((day) => day.automaticScheduleHidden)
      .map((day) => day.dateKey),
  );
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
  const monthKey = getCalendarMonthKey(calendarMonth);
  const scheduleStartDate = data.pattern.scheduleStartDate ?? data.pattern.anchorDate;
  const scheduleStartDateInMonth = scheduleStartDate.startsWith(`${monthKey}-`)
    ? scheduleStartDate
    : null;
  const monthFirstDateKey = `${monthKey}-01`;
  const automaticScheduleVisible = isCalendarAutomaticScheduleVisible(
    monthFirstDateKey,
    automaticScheduleDisplayWindow,
  );

  return {
    automaticScheduleDisplayWindow,
    automaticScheduleHiddenDateKeySet,
    automaticScheduleVisible,
    month: calendarMonth,
    monthKey,
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
    scheduleStartDateInMonth,
  };
}
