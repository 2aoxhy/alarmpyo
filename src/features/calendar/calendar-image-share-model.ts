import {
  resolveShiftVisualRole,
  type ShiftVisualRole,
} from '../../design-system/shift-visual-theme';
import type { EffectiveDay } from '../../services/pattern-engine';
import { getDayExceptionLabel } from '../../utils/day-exception';
import type { CalendarCell } from '../../utils/date';
import type {
  KoreanHolidayDataStatus,
  KoreanHolidayInfo,
} from '../../utils/korean-holiday';

export const CALENDAR_IMAGE_LOGICAL_WIDTH = 360;
export const CALENDAR_IMAGE_LOGICAL_HEIGHT = 450;
export const CALENDAR_IMAGE_PIXEL_WIDTH = 1080;
export const CALENDAR_IMAGE_PIXEL_HEIGHT = 1350;
export const CALENDAR_IMAGE_WEEK_COUNT = 6;
const CALENDAR_IMAGE_WEEKDAY_COUNT = 7;

export type CalendarImageShareDay = Readonly<{
  dateKey: string;
  day: number;
  holidayLabel: string | null;
  inCurrentMonth: boolean;
  shiftLabel: string | null;
  shiftRole: ShiftVisualRole | null;
}>;

/**
 * 공유 전용 최소 계약입니다. 앱 저장 데이터나 화면 ViewModel을 넘기지 않아
 * 개인 일정 부가 정보가 캡처 계층으로 들어갈 수 없게 합니다.
 */
export type CalendarImageShareSnapshot = Readonly<{
  automaticScheduleVisible: true;
  holidayDataComplete: true;
  month: number;
  weeks: readonly (readonly CalendarImageShareDay[])[];
  year: number;
}>;

export type CalendarImageShareUnavailableReason =
  | 'automatic-schedule-hidden'
  | 'holiday-data-incomplete';

export class CalendarImageShareUnavailableError extends Error {
  constructor(
    readonly reason: CalendarImageShareUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = 'CalendarImageShareUnavailableError';
  }
}

export type CalendarImageShareSource = Readonly<{
  automaticScheduleVisible: boolean;
  cellRows: readonly (readonly CalendarCell[])[];
  effectiveDays: ReadonlyMap<string, EffectiveDay>;
  holidayDataStatus: KoreanHolidayDataStatus;
  holidays: Readonly<Record<string, KoreanHolidayInfo>>;
  month: number;
  year: number;
}>;

function freezeDay(day: CalendarImageShareDay): CalendarImageShareDay {
  return Object.freeze(day);
}

function createEmptyShareDay(
  year: number,
  month: number,
  weekIndex: number,
  weekdayIndex: number,
): CalendarImageShareDay {
  return freezeDay({
    dateKey: `empty:${year}-${month + 1}:${weekIndex}:${weekdayIndex}`,
    day: 0,
    holidayLabel: null,
    inCurrentMonth: false,
    shiftLabel: null,
    shiftRole: null,
  });
}

/** 탭 순간의 월 표시만 깊게 동결하여 이후 월 이동이나 저장 변경의 영향을 받지 않습니다. */
export function buildCalendarImageShareSnapshot(
  source: CalendarImageShareSource,
): CalendarImageShareSnapshot {
  if (!source.automaticScheduleVisible) {
    throw new CalendarImageShareUnavailableError(
      'automatic-schedule-hidden',
      '자동 근무가 표시되는 달만 이미지로 공유할 수 있습니다.',
    );
  }
  if (!source.holidayDataStatus.includesVariableHolidays) {
    throw new CalendarImageShareUnavailableError(
      'holiday-data-incomplete',
      '공휴일 자료가 모두 확인된 달만 이미지로 공유할 수 있습니다.',
    );
  }

  const weeks = Array.from({ length: CALENDAR_IMAGE_WEEK_COUNT }, (_, weekIndex) =>
    Object.freeze(
      Array.from({ length: CALENDAR_IMAGE_WEEKDAY_COUNT }, (_, weekdayIndex) => {
        const cell = source.cellRows[weekIndex]?.[weekdayIndex];
        if (!cell) {
          return createEmptyShareDay(
            source.year,
            source.month,
            weekIndex,
            weekdayIndex,
          );
        }
        if (!cell.inCurrentMonth) {
          return freezeDay({
            dateKey: cell.dateKey,
            day: cell.day,
            holidayLabel: null,
            inCurrentMonth: false,
            shiftLabel: null,
            shiftRole: null,
          });
        }

        const effectiveDay = source.effectiveDays.get(cell.dateKey) ?? null;
        const shift = effectiveDay?.shift ?? null;
        const specialSchedule = Boolean(effectiveDay?.dayException);
        const shiftLabel = effectiveDay?.dayException
          ? getDayExceptionLabel(effectiveDay.dayException)
          : shift?.shortName.trim() || shift?.name.trim() || null;

        return freezeDay({
          dateKey: cell.dateKey,
          day: cell.day,
          holidayLabel: source.holidays[cell.dateKey]?.calendarLabel ?? null,
          inCurrentMonth: true,
          shiftLabel,
          shiftRole:
            effectiveDay?.scheduleActive && (shift || specialSchedule)
              ? resolveShiftVisualRole(shift, specialSchedule)
              : null,
        });
      }),
    ),
  );

  return Object.freeze({
    automaticScheduleVisible: true,
    holidayDataComplete: true,
    month: source.month,
    weeks: Object.freeze(weeks),
    year: source.year,
  });
}

export function createCalendarImageFileName(
  snapshot: Pick<CalendarImageShareSnapshot, 'month' | 'year'>,
): string {
  return `${snapshot.year}-${String(snapshot.month + 1).padStart(2, '0')}-근무표.png`;
}
