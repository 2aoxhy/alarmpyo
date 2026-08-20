import type {
  AppData,
  DayExceptionType,
  RotationPattern,
  ShiftType,
} from '../models/app-data';
import {
  differenceInCalendarDays,
  isValidDateKey,
} from '../utils/date';
import {
  getDayExceptionLabel,
  usesDayAlarmForException,
} from '../utils/day-exception';
import {
  getWeekdayPatternPosition,
  getWorkPatternKind,
} from '../utils/work-pattern';

export type EffectiveDay = {
  dateKey: string;
  scheduleActive: boolean;
  scheduledShift: ShiftType | null;
  shift: ShiftType | null;
  dayException: DayExceptionType | undefined;
};

export type ResolveEffectiveDay = (dateKey: string) => EffectiveDay;

export type ResolveEffectiveDayOptions = {
  scheduledShift?: ShiftType | null;
  dayException?: DayExceptionType | null;
};

export type PatternAlarmPolicy =
  | 'none'
  | 'shift'
  | 'inherited-shift'
  | 'day-exception'
  | 'date-override-disabled'
  | 'date-override-wake-time';

/** 개발 진단용 결과이며 사용자 메모와 알람 시각을 포함하지 않습니다. */
export type PatternDateExplanation = {
  dateKey: string;
  scheduleActive: boolean;
  patternName: string;
  patternPosition: number | null;
  patternShiftTypeId: string | null;
  scheduledShiftTypeId: string | null;
  effectiveShiftTypeId: string | null;
  dayException: DayExceptionType | undefined;
  overrideApplied: boolean;
  timeOverrideApplied: boolean;
  alarmPolicy: PatternAlarmPolicy;
  alarmSourceShiftId: string | null;
};

export type ResolvedShiftAlarmSettings = {
  sourceShiftId: string;
  alarmEnabled: boolean;
  alarmMinutesBefore: number;
};

export function getPatternScheduleStartDate(
  pattern: Pick<RotationPattern, 'anchorDate' | 'scheduleStartDate'>,
): string {
  const startDate = pattern.scheduleStartDate;
  return startDate && isValidDateKey(startDate) ? startDate : pattern.anchorDate;
}

export function isPatternScheduleDate(
  pattern: Pick<RotationPattern, 'anchorDate' | 'scheduleStartDate'>,
  dateKey: string,
): boolean {
  return dateKey >= getPatternScheduleStartDate(pattern);
}

export function calculatePatternPosition(
  pattern: Pick<RotationPattern, 'anchorDate' | 'kind' | 'shiftTypeIds'>,
  dateKey: string,
): number | null {
  if (pattern.shiftTypeIds.length === 0) return null;
  if ((pattern.kind ?? getWorkPatternKind(pattern.shiftTypeIds)) === 'weekday') {
    return getWeekdayPatternPosition(dateKey);
  }
  const difference = differenceInCalendarDays(dateKey, pattern.anchorDate);
  return ((difference % pattern.shiftTypeIds.length) + pattern.shiftTypeIds.length) %
    pattern.shiftTypeIds.length;
}

function findShift(data: Pick<AppData, 'shiftTypes'>, shiftTypeId: string | null): ShiftType | null {
  if (shiftTypeId === null) return null;
  return data.shiftTypes.find((shift) => shift.id === shiftTypeId) ?? null;
}

/** 반복 순서와 날짜별 근무 변경을 합성합니다. */
export function applyScheduleOverrides(
  data: Pick<AppData, 'overrides' | 'pattern' | 'shiftTypes' | 'timeOverrides'>,
  dateKey: string,
  patternPosition: number | null = calculatePatternPosition(data.pattern, dateKey),
): ShiftType | null {
  if (patternPosition === null) return null;
  const hasOverride = Object.prototype.hasOwnProperty.call(data.overrides, dateKey);
  const shiftTypeId = hasOverride
    ? data.overrides[dateKey]
    : data.pattern.shiftTypeIds[patternPosition] ?? null;
  const shift = findShift(data, shiftTypeId);
  const timeOverride = data.timeOverrides[dateKey];
  if (!shift || shift.isOff || !timeOverride || timeOverride.shiftTypeId !== shift.id) {
    return shift;
  }
  return {
    ...shift,
    startMinutes: timeOverride.startMinutes,
    endMinutes: timeOverride.endMinutes,
    endsNextDay: timeOverride.endsNextDay,
  };
}

export function resolveBaseShift(
  data: Pick<AppData, 'overrides' | 'pattern' | 'shiftTypes' | 'timeOverrides'>,
  dateKey: string,
): ShiftType | null {
  if (!isPatternScheduleDate(data.pattern, dateKey)) return null;
  return applyScheduleOverrides(data, dateKey);
}

export function resolveEffectiveDay(
  data: Pick<
    AppData,
    | 'dayExceptions'
    | 'overrides'
    | 'pattern'
    | 'shiftTypes'
    | 'timeOverrides'
  >,
  dateKey: string,
  options: ResolveEffectiveDayOptions = {},
): EffectiveDay {
  const scheduleActive = isPatternScheduleDate(data.pattern, dateKey);
  if (!scheduleActive) {
    return {
      dateKey,
      scheduleActive: false,
      scheduledShift: null,
      shift: null,
      dayException: undefined,
    };
  }

  const scheduledShift = Object.prototype.hasOwnProperty.call(options, 'scheduledShift')
    ? options.scheduledShift ?? null
    : resolveBaseShift(data, dateKey);
  const dayException = Object.prototype.hasOwnProperty.call(options, 'dayException')
    ? options.dayException ?? undefined
    : data.dayExceptions[dateKey];

  if (!dayException) {
    return { dateKey, scheduleActive, scheduledShift, shift: scheduledShift, dayException };
  }
  if (usesDayAlarmForException(dayException)) {
    const dayShift = data.shiftTypes.find((shift) => shift.id === 'day');
    const shift = dayShift && !dayShift.isOff ? dayShift : null;
    return { dateKey, scheduleActive, scheduledShift, shift, dayException };
  }
  const offShift = data.shiftTypes.find((shift) => shift.isOff);
  const shift = offShift
    ? {
        ...offShift,
        id: `exception-${dayException}`,
        name: getDayExceptionLabel(dayException),
        shortName: '연',
      }
    : null;
  return { dateKey, scheduleActive, scheduledShift, shift, dayException };
}

export function explainPatternDate(
  data: Pick<
    AppData,
    | 'alarmOverrides'
    | 'dayExceptions'
    | 'overrides'
    | 'pattern'
    | 'shiftTypes'
    | 'timeOverrides'
  >,
  dateKey: string,
): PatternDateExplanation {
  const scheduleActive = isPatternScheduleDate(data.pattern, dateKey);
  const patternPosition = scheduleActive
    ? calculatePatternPosition(data.pattern, dateKey)
    : null;
  const patternShiftTypeId = patternPosition === null
    ? null
    : data.pattern.shiftTypeIds[patternPosition] ?? null;
  const effective = resolveEffectiveDay(data, dateKey);
  const alarmOverride = data.alarmOverrides[dateKey];
  const alarmSourceShiftId = effective.dayException && usesDayAlarmForException(effective.dayException)
    ? 'day'
    : effective.shift?.id === 'substitute-day'
      ? 'day'
      : effective.shift?.id === 'substitute-night'
        ? 'night'
        : effective.shift?.isOff
          ? null
          : effective.shift?.id ?? null;
  const alarmPolicy: PatternAlarmPolicy = !alarmSourceShiftId
    ? 'none'
    : alarmOverride?.mode === 'disabled'
      ? 'date-override-disabled'
      : alarmOverride?.mode === 'wake-time'
        ? 'date-override-wake-time'
        : effective.dayException && usesDayAlarmForException(effective.dayException)
          ? 'day-exception'
          : effective.shift?.id === 'substitute-day' || effective.shift?.id === 'substitute-night'
            ? 'inherited-shift'
            : 'shift';
  return {
    dateKey,
    scheduleActive: effective.scheduleActive,
    patternName: data.pattern.name,
    patternPosition,
    patternShiftTypeId,
    scheduledShiftTypeId: effective.scheduledShift?.id ?? null,
    effectiveShiftTypeId: effective.shift?.id ?? null,
    dayException: effective.dayException,
    overrideApplied: Object.prototype.hasOwnProperty.call(data.overrides, dateKey),
    timeOverrideApplied:
      effective.scheduledShift !== null &&
      data.timeOverrides[dateKey]?.shiftTypeId === effective.scheduledShift.id,
    alarmPolicy,
    alarmSourceShiftId,
  };
}

/** 주대와 야대는 각각 주간과 야간의 알람 설정을 직접 참조합니다. */
export function resolveAlarmSettingsForShift(
  shiftTypes: readonly ShiftType[],
  shift: Pick<ShiftType, 'alarmEnabled' | 'alarmMinutesBefore' | 'id'>,
): ResolvedShiftAlarmSettings {
  const sourceShiftId = shift.id === 'substitute-day'
    ? 'day'
    : shift.id === 'substitute-night'
      ? 'night'
      : shift.id;
  const inheritsBaseAlarm = sourceShiftId !== shift.id;
  const sourceShift = inheritsBaseAlarm
    ? shiftTypes.find((candidate) => candidate.id === sourceShiftId)
    : shift;
  return {
    sourceShiftId,
    alarmEnabled: sourceShift?.alarmEnabled ?? shift.alarmEnabled,
    alarmMinutesBefore: sourceShift?.alarmMinutesBefore ?? shift.alarmMinutesBefore,
  };
}

/** 화면·알람·수면·위젯이 공유하는 순수 일정 계산 진입점입니다. */
export const PatternEngine = Object.freeze({
  calculatePatternPosition,
  applyScheduleOverrides,
  resolveBaseShift,
  resolveEffectiveDay,
  explainPatternDate,
  resolveAlarmSettingsForShift,
});
