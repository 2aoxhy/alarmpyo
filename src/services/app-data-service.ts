import {
  createDefaultShiftTypes,
  createDefaultWorkShift,
} from '../application/app-data-defaults';
import {
  DAY_SHIFT_END_MINUTES,
  DAY_SHIFT_START_MINUTES,
  LEGACY_DAY_SHIFT_START_MINUTES,
  LEGACY_DAY_SHIFT_END_MINUTES,
  LEGACY_NIGHT_SHIFT_END_MINUTES,
  LEGACY_NIGHT_SHIFT_START_MINUTES,
  NIGHT_SHIFT_END_MINUTES,
} from '../constants/shift-schedule';
import {
  DEFAULT_ALARM_MINUTES_BEFORE,
  LEGACY_MAX_ALARM_MINUTES_BEFORE,
  MAX_ALARM_MINUTES_BEFORE,
  type AppData,
  type AppSettings,
  type DayAlarmOverride,
  type DayExceptionType,
  type DayTimeOverride,
  type RotationPattern,
  type ShiftType,
  type ThemeMode,
  type WidgetDisplayOptions,
  type WorkRoutineProfiles,
  type WorkRoutineTiming,
} from '../models/app-data';
import {
  APP_DATA_BACKUP_FORMAT,
  APP_DATA_BACKUP_FORMAT_VERSION,
  parseAppDataImportEnvelope,
} from '../infrastructure/app-data/import-envelope';
import {
  AppDataValidationError,
  dateKey,
  integerInRange,
  nullableIsoDate,
  nullableMinutes,
  record,
  requiredBoolean,
  requiredString,
  type UnknownRecord,
} from '../infrastructure/app-data/validation';
import {
  addDays,
  dateAtMinutes,
  differenceInCalendarDays,
  isValidDateKey,
  toDateKey,
} from '../utils/date';
import {
  DAY_EXCEPTION_TYPES,
  getDayExceptionLabel,
  usesDayAlarmForException,
} from '../utils/day-exception';
import { stripOptionalUtf8Bom } from '../utils/json';
import {
  getWeekdayPatternPosition,
  getWorkPatternKind,
  getWorkPatternDisplayName,
  getWorkPatternName,
  getWorkPatternPresetId,
  isBaseWorkShiftId,
  isValidCustomPatternSequence,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
} from '../utils/work-pattern';
import {
  createDefaultWorkRoutineProfiles,
  isValidWorkRoutineTiming,
  WORK_ROUTINE_MAX_MINUTES_BEFORE,
} from './work-routine-settings';
import {
  getCheckedAppDataContentsByteSize,
  getCheckedBackupContentsByteSize,
} from './backup-file-policy';

export const APP_DATA_VERSION = 20 as const;
export { APP_DATA_BACKUP_FORMAT, APP_DATA_BACKUP_FORMAT_VERSION };

const MAX_LEGACY_SHIFT_TYPES = 100;
// v1~v4 자료가 허용하던 100개 근무에 두 대체근무를 손실 없이 더할 수 있어야 합니다.
const MAX_PRE_V20_SHIFT_TYPES = MAX_LEGACY_SHIFT_TYPES + 2;
// v20은 유효한 이전 자료의 모든 근무에 canonical 오후 근무 하나를 더할 수 있어야 합니다.
const MAX_SHIFT_TYPES = MAX_PRE_V20_SHIFT_TYPES + 1;
const MAX_PATTERN_LENGTH = 3_660;
const MAX_DATED_ITEMS = 20_000;
const V12_DEFAULT_ALARM_MINUTES_BEFORE = 120;
const DEFAULT_ALARM_SHIFT_IDS = [
  'day',
  'night',
  'substitute-day',
  'substitute-night',
] as const;
type PreviousAppDataVersion =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19;
type AppDataVersion = PreviousAppDataVersion | typeof APP_DATA_VERSION;

export const DEFAULT_WIDGET_DISPLAY_OPTIONS: Readonly<WidgetDisplayOptions> = {
  todayShift: true,
  nextShift: true,
  nextAlarm: false,
};

export type ParsedAppData = {
  data: AppData;
  migratedFromVersion: PreviousAppDataVersion | null;
  requiresPersistence: boolean;
};

type AppDataValidationOptions = {
  repairOversizedAlarmMinutes?: boolean;
};

type AppDataRepairState = {
  oversizedAlarmMinutes: boolean;
  removedCompanyExceptions: boolean;
};

export type AppDataParseResult =
  | { ok: true; value: ParsedAppData }
  | { ok: false; error: AppDataValidationError };

export type AppDataImportPreview = {
  data: AppData;
  exportedAt: string | null;
  migratedFromVersion: PreviousAppDataVersion | null;
  source: 'backup' | 'data';
  summary: {
    patternName: string;
    anchorDate: string;
    scheduleStartDate: string;
    shiftTypeCount: number;
    changedDateCount: number;
    noteCount: number;
  };
};

export { AppDataValidationError };

type SubstituteShiftId = 'substitute-day' | 'substitute-night';

function legacySubstituteTargetId(shiftTypes: readonly ShiftType[]): SubstituteShiftId {
  const substitute = shiftTypes.find((shift) => shift.id === 'substitute');
  if (!substitute) return 'substitute-day';

  const night = shiftTypes.find((shift) => shift.id === 'night');
  const startsWithNight =
    substitute.startMinutes !== null &&
    (substitute.startMinutes === LEGACY_NIGHT_SHIFT_START_MINUTES ||
      (night !== undefined &&
        night.startMinutes !== null &&
        substitute.startMinutes === night.startMinutes));
  return substitute.endsNextDay || startsWithNight ? 'substitute-night' : 'substitute-day';
}

function migrateShiftTypes(
  shiftTypes: ShiftType[],
  sourceVersion: 1 | 2 | 3 | 4,
): ShiftType[] {
  const dayDefault = createDefaultWorkShift('day');
  const nightDefault = createDefaultWorkShift('night');
  const migrated = shiftTypes.map((shift) => {
    if (shift.id === 'day' && sourceVersion <= 2) {
      return {
        ...shift,
        startMinutes: dayDefault.startMinutes,
        endMinutes: dayDefault.endMinutes,
        endsNextDay: dayDefault.endsNextDay,
        alarmMinutesBefore:
          shift.alarmMinutesBefore === 90
            ? dayDefault.alarmMinutesBefore
            : shift.alarmMinutesBefore,
      };
    }
    if (shift.id === 'night' && sourceVersion <= 2) {
      return {
        ...shift,
        startMinutes: nightDefault.startMinutes,
        endMinutes: nightDefault.endMinutes,
        endsNextDay: nightDefault.endsNextDay,
      };
    }
    if (sourceVersion <= 3 && shift.id === 'day' && shift.alarmMinutesBefore === 90) {
      return {
        ...shift,
        alarmMinutesBefore: dayDefault.alarmMinutesBefore,
      };
    }
    return shift;
  });

  const substitute = migrated.find((shift) => shift.id === 'substitute');
  if (substitute?.isOff) {
    throw new AppDataValidationError('대체근무에는 근무 시간과 알람 설정이 필요해요.');
  }
  const substituteTargetId = legacySubstituteTargetId(migrated);
  const substituteDay =
    substitute && substituteTargetId === 'substitute-day'
      ? {
          ...substitute,
          id: 'substitute-day',
          name: '주간 대체근무',
          shortName: '대주',
        }
      : createDefaultWorkShift('substitute-day');
  const substituteNight =
    substitute && substituteTargetId === 'substitute-night'
      ? {
          ...substitute,
          id: 'substitute-night',
          name: '야간 대체근무',
          shortName: '대야',
        }
      : createDefaultWorkShift('substitute-night');
  const finalLength = migrated.length + (substitute ? 1 : 2);
  if (finalLength > MAX_SHIFT_TYPES) {
    throw new AppDataValidationError('대체근무를 추가할 공간이 부족해요.');
  }
  if (substitute) {
    return migrated.flatMap((shift) =>
      shift.id === 'substitute' ? [substituteDay, substituteNight] : [shift],
    );
  }

  const offIndex = migrated.findIndex((shift) => shift.id === 'off');
  const insertAt = offIndex < 0 ? migrated.length : offIndex;
  return [
    ...migrated.slice(0, insertAt),
    substituteDay,
    substituteNight,
    ...migrated.slice(insertAt),
  ];
}

/**
 * v20은 3교대의 오후 근무를 기본 종류로 추가합니다. 기존 근무표와 시간은
 * 건드리지 않고, 사용자가 3교대를 선택하기 전까지 패턴에 넣지 않아요.
 */
type V20EveningShiftMigration = {
  shiftTypes: ShiftType[];
  renamedLegacyEveningId: string | null;
};

const LEGACY_EVENING_SHIFT_ID = 'legacy-evening';

function isLegacyEveningCompatibilityId(id: string): boolean {
  return /^legacy-evening(?:-\d+)?$/.test(id);
}

function getAvailableLegacyEveningShiftId(shiftTypes: readonly ShiftType[]): string {
  const ids = new Set(shiftTypes.map((shift) => shift.id));
  if (!ids.has(LEGACY_EVENING_SHIFT_ID)) return LEGACY_EVENING_SHIFT_ID;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${LEGACY_EVENING_SHIFT_ID}-${suffix}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function migrateV20EveningShift(
  shiftTypes: ShiftType[],
  sourceVersion: AppDataVersion,
): V20EveningShiftMigration {
  if (sourceVersion >= 20) {
    return { shiftTypes, renamedLegacyEveningId: null };
  }
  if (shiftTypes.length >= MAX_SHIFT_TYPES) {
    throw new AppDataValidationError('오후 근무를 추가할 공간이 부족해요.');
  }

  // v19까지 `evening`은 예약 ID가 아니었으므로 사용자가 만든 근무가 이 ID를
  // 사용할 수 있었어요. 성격이나 시간과 무관하게 먼저 이름을 바꿔 기존 의미를
  // 보존하고, 새 canonical 오후 근무는 별도 항목으로 추가합니다.
  const hasLegacyEvening = shiftTypes.some((shift) => shift.id === 'evening');
  const renamedLegacyEveningId = hasLegacyEvening
    ? getAvailableLegacyEveningShiftId(shiftTypes)
    : null;
  const migratedShiftTypes = renamedLegacyEveningId
    ? shiftTypes.map((shift) =>
        shift.id === 'evening' ? { ...shift, id: renamedLegacyEveningId } : shift,
      )
    : shiftTypes;
  const evening = createDefaultWorkShift('evening');
  const nightIndex = migratedShiftTypes.findIndex((shift) => shift.id === 'night');
  const insertAt = nightIndex < 0 ? migratedShiftTypes.length : nightIndex;
  return {
    shiftTypes: [
      ...migratedShiftTypes.slice(0, insertAt),
      evening,
      ...migratedShiftTypes.slice(insertAt),
    ],
    renamedLegacyEveningId,
  };
}

function rewriteLegacyEveningReference(
  shiftTypeId: string,
  renamedLegacyEveningId: string | null,
): string {
  return shiftTypeId === 'evening' && renamedLegacyEveningId
    ? renamedLegacyEveningId
    : shiftTypeId;
}

/**
 * 예약 ID 충돌을 겪은 기존 반복 순서는 새 편집기의 base-ID 계약과 별도로
 * 읽기 호환합니다. 기존 `evening`이 휴무였더라도 일정 의미를 바꾸지 않아요.
 */
function isValidLegacyEveningCompatibilityPattern(
  shiftTypeIds: readonly string[],
): boolean {
  return (
    shiftTypeIds.length >= 1 &&
    shiftTypeIds.length <= 42 &&
    shiftTypeIds.some(isLegacyEveningCompatibilityId) &&
    shiftTypeIds.every(
      (shiftTypeId) =>
        isBaseWorkShiftId(shiftTypeId) ||
        isLegacyEveningCompatibilityId(shiftTypeId),
    )
  );
}

function migrateLegacyDefaultShiftTimes(
  shiftTypes: ShiftType[],
  sourceVersion: AppDataVersion,
): ShiftType[] {
  if (sourceVersion >= 8) return shiftTypes;

  return shiftTypes.map((shift) => {
    const legacyDay =
      (shift.id === 'day' || shift.id === 'substitute-day') &&
      shift.startMinutes === LEGACY_DAY_SHIFT_START_MINUTES &&
      shift.endMinutes === LEGACY_DAY_SHIFT_END_MINUTES &&
      !shift.endsNextDay;
    if (legacyDay) return { ...shift, endMinutes: DAY_SHIFT_END_MINUTES };

    const legacyNight =
      (shift.id === 'night' || shift.id === 'substitute-night') &&
      shift.startMinutes === LEGACY_NIGHT_SHIFT_START_MINUTES &&
      shift.endMinutes === LEGACY_NIGHT_SHIFT_END_MINUTES &&
      shift.endsNextDay;
    if (legacyNight) return { ...shift, endMinutes: NIGHT_SHIFT_END_MINUTES };

    return shift;
  });
}

/**
 * v12에는 기본 근무 네 종류의 알람이 모두 120분으로 저장됐어요.
 * 네 값이 모두 이전 기본값일 때만 새 기본값으로 옮겨, 한 종류라도 따로
 * 조정한 흔적이 있으면 사용자의 나머지 120분 값까지 그대로 보존해요.
 */
function migrateV12DefaultAlarmMinutes(
  shiftTypes: ShiftType[],
  sourceVersion: AppDataVersion,
): ShiftType[] {
  if (sourceVersion !== 12) return shiftTypes;

  const defaultAlarmShifts = DEFAULT_ALARM_SHIFT_IDS.map((id) =>
    shiftTypes.find((shift) => shift.id === id),
  );
  const usesUntouchedV12Defaults = defaultAlarmShifts.every(
    (shift) => shift?.alarmMinutesBefore === V12_DEFAULT_ALARM_MINUTES_BEFORE,
  );
  if (!usesUntouchedV12Defaults) return shiftTypes;

  const defaultAlarmShiftIds = new Set<string>(DEFAULT_ALARM_SHIFT_IDS);
  return shiftTypes.map((shift) =>
    defaultAlarmShiftIds.has(shift.id)
      ? { ...shift, alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE }
      : shift,
  );
}

export function createDefaultAppData(anchorDate = toDateKey(new Date())): AppData {
  return {
    version: APP_DATA_VERSION,
    shiftTypes: createDefaultShiftTypes(),
    pattern: {
      name: getWorkPatternName('rotation'),
      anchorDate,
      scheduleStartDate: anchorDate,
      shiftTypeIds: [...ROTATION_PATTERN_SHIFT_TYPE_IDS],
    },
    overrides: {},
    timeOverrides: {},
    dayExceptions: {},
    alarmOverrides: {},
    notes: {},
    scheduleChangeHistory: [],
    settings: {
      notificationsEnabled: false,
      sleepReminderEnabled: false,
      scheduledNotificationCount: 0,
      lastNotificationSyncAt: null,
      setupCompleted: false,
      themeMode: 'dark',
      workRoutineProfiles: createDefaultWorkRoutineProfiles(),
      widgetDisplayOptions: { ...DEFAULT_WIDGET_DISPLAY_OPTIONS },
    },
  };
}

/** 반복 계산용 기준일과 별개로 실제 근무표가 시작되는 첫 날짜를 반환해요. */
export function getScheduleStartDate(data: Pick<AppData, 'pattern'>): string {
  const startDate = data.pattern.scheduleStartDate;
  return startDate && isValidDateKey(startDate) ? startDate : data.pattern.anchorDate;
}

/** 첫 근무일부터 근무·예외 일정을 적용해요. */
export function isScheduleDate(data: Pick<AppData, 'pattern'>, dateKey: string): boolean {
  return dateKey >= getScheduleStartDate(data);
}

/** 첫 근무일 이전에 저장된 예외 일정은 화면과 알람에 적용하지 않아요. */
export function resolveDayExceptionFromAppData(
  data: AppData,
  dateKey: string,
): DayExceptionType | undefined {
  return isScheduleDate(data, dateKey) ? data.dayExceptions[dateKey] : undefined;
}

export function resolveBaseShiftFromAppData(data: AppData, dateKey: string): ShiftType | null {
  if (!isScheduleDate(data, dateKey) || data.pattern.shiftTypeIds.length === 0) return null;

  const hasOverride = Object.prototype.hasOwnProperty.call(data.overrides, dateKey);
  const patternPosition =
    getWorkPatternKind(data.pattern.shiftTypeIds) === 'weekday'
      ? getWeekdayPatternPosition(dateKey)
      : ((differenceInCalendarDays(dateKey, data.pattern.anchorDate) %
            data.pattern.shiftTypeIds.length) +
          data.pattern.shiftTypeIds.length) %
        data.pattern.shiftTypeIds.length;
  const shiftTypeId = hasOverride
    ? data.overrides[dateKey]
    : data.pattern.shiftTypeIds[patternPosition];

  if (shiftTypeId === null || shiftTypeId === undefined) return null;
  const shift = data.shiftTypes.find((item) => item.id === shiftTypeId) ?? null;
  const timeOverride = data.timeOverrides[dateKey];
  if (!shift || shift.isOff || !timeOverride || timeOverride.shiftTypeId !== shift.id) return shift;
  return {
    ...shift,
    startMinutes: timeOverride.startMinutes,
    endMinutes: timeOverride.endMinutes,
    endsNextDay: timeOverride.endsNextDay,
  };
}

export type EffectiveDay = {
  dateKey: string;
  /** 첫 근무일 이후로 근무표가 적용되는 날짜인지 나타내요. */
  scheduleActive: boolean;
  /** 날짜 예외를 적용하기 전의 반복·직접 변경 근무예요. */
  scheduledShift: ShiftType | null;
  /** 날짜 예외까지 적용한 뒤 화면·알람·내보내기에서 사용할 최종 일정이에요. */
  shift: ShiftType | null;
  dayException: DayExceptionType | undefined;
};

export type ResolveEffectiveDay = (dateKey: string) => EffectiveDay;

export type ResolveEffectiveDayOptions = {
  /** 저장 전 미리 보기에만 사용해요. 생략하면 저장된 근무를 계산해요. */
  scheduledShift?: ShiftType | null;
  /** 저장 전 미리 보기에만 사용해요. null이면 예외 일정을 해제한 상태예요. */
  dayException?: DayExceptionType | null;
};

/**
 * 한 날짜의 최종 일정 의미를 한 곳에서 계산해요.
 * 교육·예비군은 원래 순번과 날짜별 시간 변경 대신 주간 시간·알람을 사용하고,
 * 연차는 근무 시간이 없는 일정으로 계산해요.
 */
export function resolveEffectiveDayFromAppData(
  data: AppData,
  dateKey: string,
  options: ResolveEffectiveDayOptions = {},
): EffectiveDay {
  const scheduleActive = isScheduleDate(data, dateKey);
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
    : resolveBaseShiftFromAppData(data, dateKey);
  const dayException = Object.prototype.hasOwnProperty.call(options, 'dayException')
    ? options.dayException ?? undefined
    : resolveDayExceptionFromAppData(data, dateKey);

  if (!dayException) {
    return { dateKey, scheduleActive, scheduledShift, shift: scheduledShift, dayException };
  }

  if (usesDayAlarmForException(dayException)) {
    const dayShift = data.shiftTypes.find((item) => item.id === 'day');
    const shift = dayShift && !dayShift.isOff ? dayShift : null;
    return { dateKey, scheduleActive, scheduledShift, shift, dayException };
  }

  const offShift = data.shiftTypes.find((item) => item.isOff);
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

export function resolveShiftFromAppData(data: AppData, dateKey: string): ShiftType | null {
  return resolveEffectiveDayFromAppData(data, dateKey).shift;
}

export function isValidDayAlarmOverride(
  value: unknown,
): value is DayAlarmOverride {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  if (item.mode === 'disabled') return true;
  return (
    item.mode === 'wake-time' &&
    Number.isInteger(item.wakeMinutes) &&
    (item.wakeMinutes as number) >= 0 &&
    (item.wakeMinutes as number) <= 1439 &&
    (item.wakeDayOffset === -1 || item.wakeDayOffset === 0)
  );
}

/** 날짜별 기상 시각을 근무일 기준의 절대 시각으로 바꿔요. */
export function getDayAlarmOverrideWakeAt(
  dateKey: string,
  override: Extract<DayAlarmOverride, { mode: 'wake-time' }>,
): number {
  return dateAtMinutes(
    addDays(dateKey, override.wakeDayOffset),
    override.wakeMinutes,
  ).getTime();
}

/**
 * 네이티브 알람 계약은 근무 시작 전 최대 1439분을 허용해요.
 * 날짜별 고정 시각도 같은 범위 안에서만 사용할 수 있게 해요.
 */
export function getDayAlarmOverrideLeadMinutes(
  dateKey: string,
  shift: Pick<ShiftType, 'startMinutes'>,
  override: Extract<DayAlarmOverride, { mode: 'wake-time' }>,
): number | null {
  if (shift.startMinutes === null) return null;
  const workStart = dateAtMinutes(dateKey, shift.startMinutes).getTime();
  const wakeAt = getDayAlarmOverrideWakeAt(dateKey, override);
  const leadMinutes = (workStart - wakeAt) / 60_000;
  return Number.isInteger(leadMinutes) &&
    leadMinutes > 0 &&
    leadMinutes <= MAX_ALARM_MINUTES_BEFORE
    ? leadMinutes
    : null;
}

function canApplyDayAlarmOverride(
  data: AppData,
  dateKey: string,
  override: DayAlarmOverride,
  shift?: ShiftType | null,
): boolean {
  if (!isValidDateKey(dateKey) || !isScheduleDate(data, dateKey)) return false;
  const effectiveDay = resolveEffectiveDayFromAppData(data, dateKey);
  if (!effectiveDay.shift || effectiveDay.shift.isOff) return false;
  const targetShift = shift === undefined ? effectiveDay.shift : shift;
  if (!targetShift || targetShift.isOff || targetShift.startMinutes === null) return false;
  return (
    override.mode === 'disabled' ||
    getDayAlarmOverrideLeadMinutes(dateKey, targetShift, override) !== null
  );
}

/**
 * 현재 일정에서 실제로 사용할 수 있는 날짜별 알람만 반환해요.
 * 첫 근무일 전, 휴무·연차, 현재 근무보다 늦은 기상 시각은 전역 설정으로 되돌아가요.
 */
export function resolveDayAlarmOverrideFromAppData(
  data: AppData,
  dateKey: string,
  shift?: ShiftType | null,
): DayAlarmOverride | undefined {
  const override = data.alarmOverrides[dateKey];
  return override && canApplyDayAlarmOverride(data, dateKey, override, shift)
    ? override
    : undefined;
}

/** 날짜별 알람을 불변 방식으로 저장하며 적용할 수 없는 값은 거절해요. */
export function applyDayAlarmOverride(
  data: AppData,
  dateKey: string,
  override: DayAlarmOverride | null,
): AppData | null {
  if (!isValidDateKey(dateKey)) return null;
  if (override !== null && !isValidDayAlarmOverride(override)) return null;
  if (override === null) {
    if (!Object.prototype.hasOwnProperty.call(data.alarmOverrides, dateKey)) return data;
    const alarmOverrides = { ...data.alarmOverrides };
    delete alarmOverrides[dateKey];
    return { ...data, alarmOverrides };
  }
  if (!canApplyDayAlarmOverride(data, dateKey, override)) return null;
  const previous = data.alarmOverrides[dateKey];
  if (
    previous?.mode === override.mode &&
    (override.mode === 'disabled' ||
      (previous.mode === 'wake-time' &&
        previous.wakeMinutes === override.wakeMinutes &&
        previous.wakeDayOffset === override.wakeDayOffset))
  ) {
    return data;
  }
  return {
    ...data,
    alarmOverrides: {
      ...data.alarmOverrides,
      [dateKey]: { ...override },
    },
  };
}

/** 일정 변경 뒤 더 이상 적용할 수 없는 날짜별 알람을 한 번에 정리해요. */
export function pruneInvalidDayAlarmOverrides(data: AppData): AppData {
  const alarmOverrides = Object.fromEntries(
    Object.entries(data.alarmOverrides).filter(([dateKey, override]) =>
      canApplyDayAlarmOverride(data, dateKey, override),
    ),
  );
  return Object.keys(alarmOverrides).length === Object.keys(data.alarmOverrides).length
    ? data
    : { ...data, alarmOverrides };
}

/**
 * 근무 방식의 기준 일정을 다시 적용할 때 지정 날짜 이후의 직접 근무·시간·알람 변경을 정리해요.
 * 개인 메모와 연차·교육·예비군 같은 예외 일정, 지정 날짜보다 앞선 변경은 보존해요.
 */
export function clearScheduleOverridesFrom(data: AppData, dateKey: string): AppData {
  if (!isValidDateKey(dateKey)) {
    throw new AppDataValidationError('직접 변경 일정을 정리할 기준 날짜가 올바르지 않아요.');
  }

  const overrides = Object.fromEntries(
    Object.entries(data.overrides).filter(([entryDateKey]) => entryDateKey < dateKey),
  );
  const timeOverrides = Object.fromEntries(
    Object.entries(data.timeOverrides).filter(([entryDateKey]) => entryDateKey < dateKey),
  );
  const alarmOverrides = Object.fromEntries(
    Object.entries(data.alarmOverrides).filter(([entryDateKey]) => entryDateKey < dateKey),
  );
  if (
    Object.keys(overrides).length === Object.keys(data.overrides).length &&
    Object.keys(timeOverrides).length === Object.keys(data.timeOverrides).length &&
    Object.keys(alarmOverrides).length === Object.keys(data.alarmOverrides).length
  ) {
    return data;
  }
  return { ...data, overrides, timeOverrides, alarmOverrides };
}

/** 백업을 만든 휴대폰의 네이티브 예약 상태를 현재 휴대폰으로 가져오지 않아요. */
export function withoutAlarmRuntimeState(data: AppData): AppData {
  if (
    data.settings.scheduledNotificationCount === 0 &&
    data.settings.lastNotificationSyncAt === null
  ) {
    return data;
  }
  return {
    ...data,
    settings: {
      ...data.settings,
      scheduledNotificationCount: 0,
      lastNotificationSyncAt: null,
    },
  };
}

function parseShiftType(
  value: unknown,
  index: number,
  legacy: boolean,
  repairOversizedAlarmMinutes: boolean,
  repairState: AppDataRepairState,
): ShiftType {
  const item = record(value, `${index + 1}번째 근무`);
  const isOff = requiredBoolean(item.isOff, `${index + 1}번째 근무의 휴무 여부`);
  const startMinutes = nullableMinutes(item.startMinutes, `${index + 1}번째 근무의 시작 시간`);
  const endMinutes = nullableMinutes(item.endMinutes, `${index + 1}번째 근무의 종료 시간`);
  const storedEndsNextDay = requiredBoolean(
    item.endsNextDay,
    `${index + 1}번째 근무의 익일 종료 여부`,
  );
  const storedAlarmEnabled = requiredBoolean(
    item.alarmEnabled,
    `${index + 1}번째 근무의 알람 여부`,
  );
  const alarmLabel = `${index + 1}번째 근무의 알람 시간`;
  const rawAlarmMinutesBefore = item.alarmMinutesBefore;
  let storedAlarmMinutesBefore: number;
  if (
    Number.isInteger(rawAlarmMinutesBefore) &&
    (rawAlarmMinutesBefore as number) >= 0 &&
    (rawAlarmMinutesBefore as number) <= MAX_ALARM_MINUTES_BEFORE
  ) {
    storedAlarmMinutesBefore = rawAlarmMinutesBefore as number;
  } else if (
    repairOversizedAlarmMinutes &&
    Number.isInteger(rawAlarmMinutesBefore) &&
    (rawAlarmMinutesBefore as number) > MAX_ALARM_MINUTES_BEFORE &&
    (rawAlarmMinutesBefore as number) <= LEGACY_MAX_ALARM_MINUTES_BEFORE
  ) {
    storedAlarmMinutesBefore = isOff ? 0 : DEFAULT_ALARM_MINUTES_BEFORE;
    repairState.oversizedAlarmMinutes = true;
  } else {
    storedAlarmMinutesBefore = integerInRange(
      rawAlarmMinutesBefore,
      alarmLabel,
      0,
      MAX_ALARM_MINUTES_BEFORE,
    );
  }

  if (!isOff && (startMinutes === null || endMinutes === null)) {
    throw new AppDataValidationError(`${index + 1}번째 근무의 시작·종료 시간이 필요해요.`);
  }
  if (!isOff && startMinutes === endMinutes) {
    throw new AppDataValidationError(`${index + 1}번째 근무의 시작·종료 시간은 달라야 해요.`);
  }

  const inferredEndsNextDay =
    !isOff && startMinutes !== null && endMinutes !== null && endMinutes < startMinutes;
  if (!legacy && !isOff && storedEndsNextDay !== inferredEndsNextDay) {
    throw new AppDataValidationError(
      `${index + 1}번째 근무의 다음 날 종료 설정이 시간과 맞지 않아요.`,
    );
  }
  if (
    !legacy &&
    isOff &&
    (startMinutes !== null ||
      endMinutes !== null ||
      storedEndsNextDay ||
      storedAlarmEnabled ||
      storedAlarmMinutesBefore !== 0)
  ) {
    throw new AppDataValidationError(`${index + 1}번째 휴무 설정이 올바르지 않아요.`);
  }

  return {
    id: requiredString(item.id, `${index + 1}번째 근무의 ID`, 100),
    name: requiredString(item.name, `${index + 1}번째 근무 이름`, 100),
    shortName: requiredString(item.shortName, `${index + 1}번째 근무 짧은 이름`, 20),
    color: requiredString(item.color, `${index + 1}번째 근무 색상`, 100),
    softColor: requiredString(item.softColor, `${index + 1}번째 근무 배경 색상`, 100),
    startMinutes: isOff ? null : startMinutes,
    endMinutes: isOff ? null : endMinutes,
    endsNextDay: isOff ? false : inferredEndsNextDay,
    isOff,
    alarmEnabled: isOff ? false : storedAlarmEnabled,
    alarmMinutesBefore: isOff ? 0 : storedAlarmMinutesBefore,
  };
}

function parseShiftTypes(
  value: unknown,
  legacy: boolean,
  substituteSchema: 'optional' | 'legacy' | 'split',
  maximumCount: number,
  repairOversizedAlarmMinutes: boolean,
  repairState: AppDataRepairState,
): ShiftType[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumCount) {
    throw new AppDataValidationError('근무 종류 목록이 올바르지 않아요.');
  }

  const shiftTypes = value.map((item, index) =>
    parseShiftType(item, index, legacy, repairOversizedAlarmMinutes, repairState),
  );
  const ids = new Set<string>();
  for (const shift of shiftTypes) {
    if (ids.has(shift.id)) throw new AppDataValidationError('근무 종류 ID가 중복되어 있어요.');
    ids.add(shift.id);
  }
  const day = shiftTypes.find((shift) => shift.id === 'day');
  const night = shiftTypes.find((shift) => shift.id === 'night');
  const off = shiftTypes.find((shift) => shift.id === 'off');
  if (!day || !night || !off || day.isOff || night.isOff || !off.isOff) {
    throw new AppDataValidationError('주간·야간·휴무 기본 근무 종류가 필요해요.');
  }
  const substitute = shiftTypes.find((shift) => shift.id === 'substitute');
  if (substituteSchema === 'legacy' && (!substitute || substitute.isOff)) {
    throw new AppDataValidationError('대체근무 기본 근무 종류가 필요해요.');
  }
  const substituteDay = shiftTypes.find((shift) => shift.id === 'substitute-day');
  const substituteNight = shiftTypes.find((shift) => shift.id === 'substitute-night');
  if (substituteSchema !== 'split' && (substituteDay || substituteNight)) {
    throw new AppDataValidationError('이 데이터 버전의 대체근무 ID가 올바르지 않아요.');
  }
  if (
    substituteSchema === 'split' &&
    (substitute || !substituteDay || !substituteNight || substituteDay.isOff || substituteNight.isOff)
  ) {
    throw new AppDataValidationError('주간·야간 대체근무 기본 근무 종류가 필요해요.');
  }
  return shiftTypes;
}

function parsePattern(
  value: unknown,
  knownShiftIds: ReadonlySet<string>,
): { pattern: RotationPattern; inferredScheduleStartDate: boolean } {
  const item = record(value, '근무 방식');
  if (
    !Array.isArray(item.shiftTypeIds) ||
    item.shiftTypeIds.length === 0 ||
    item.shiftTypeIds.length > MAX_PATTERN_LENGTH
  ) {
    throw new AppDataValidationError('근무 순서가 올바르지 않아요.');
  }

  const shiftTypeIds = item.shiftTypeIds.map((id, index) => {
    const parsedId = requiredString(id, `${index + 1}번째 근무 ID`, 100);
    if (!knownShiftIds.has(parsedId)) {
      throw new AppDataValidationError('근무 순서에 알 수 없는 근무 종류가 있어요.');
    }
    return parsedId;
  });

  const anchorDate = dateKey(item.anchorDate, '근무 방식 기준일');
  const inferredScheduleStartDate = item.scheduleStartDate === undefined;
  const scheduleStartDate = inferredScheduleStartDate
    ? anchorDate
    : dateKey(item.scheduleStartDate, '첫 근무일');

  return {
    pattern: {
      name: requiredString(item.name, '근무 방식 이름', 200),
      anchorDate,
      scheduleStartDate,
      shiftTypeIds,
    },
    inferredScheduleStartDate,
  };
}

function optionalLegacyRecord(value: unknown, label: string): UnknownRecord {
  if (value === undefined) return {};
  return record(value, label);
}

function parseOverrides(
  value: unknown,
  knownShiftIds: ReadonlySet<string>,
  legacy: boolean,
): Record<string, string | null> {
  const source = legacy ? optionalLegacyRecord(value, '변경한 날짜') : record(value, '변경한 날짜');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) {
    throw new AppDataValidationError('변경한 날짜가 너무 많아요.');
  }

  const overrides: Record<string, string | null> = {};
  for (const [key, shiftId] of entries) {
    dateKey(key, '변경한 근무');
    if (shiftId !== null && (typeof shiftId !== 'string' || !knownShiftIds.has(shiftId))) {
      throw new AppDataValidationError(`${key}에 알 수 없는 근무 종류가 있어요.`);
    }
    overrides[key] = shiftId;
  }
  return overrides;
}

function parseTimeOverrides(
  value: unknown,
  knownShiftIds: ReadonlySet<string>,
): Record<string, DayTimeOverride> {
  const source = record(value, '날짜별 근무 시간');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) {
    throw new AppDataValidationError('시간을 바꾼 날짜가 너무 많아요.');
  }

  const timeOverrides: Record<string, DayTimeOverride> = {};
  for (const [key, rawOverride] of entries) {
    dateKey(key, '시간을 바꾼 근무');
    const item = record(rawOverride, `${key} 근무 시간`);
    const shiftTypeId = requiredString(item.shiftTypeId, `${key} 근무 종류`, 100);
    if (!knownShiftIds.has(shiftTypeId)) {
      throw new AppDataValidationError(`${key}에 알 수 없는 근무 종류가 있어요.`);
    }
    const startMinutes = integerInRange(item.startMinutes, `${key} 시작 시각`, 0, 1439);
    const endMinutes = integerInRange(item.endMinutes, `${key} 종료 시각`, 0, 1439);
    if (startMinutes === endMinutes) {
      throw new AppDataValidationError(`${key}의 시작과 종료 시각은 달라야 해요.`);
    }
    const endsNextDay = requiredBoolean(item.endsNextDay, `${key} 익일 종료 여부`);
    if (endsNextDay !== (endMinutes < startMinutes)) {
      throw new AppDataValidationError(`${key}의 익일 종료 여부가 근무 시간과 맞지 않아요.`);
    }
    timeOverrides[key] = { shiftTypeId, startMinutes, endMinutes, endsNextDay };
  }
  return timeOverrides;
}

function parseDayExceptions(
  value: unknown,
  repairState: AppDataRepairState,
): Record<string, DayExceptionType> {
  const source = record(value, '예외 일정');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) {
    throw new AppDataValidationError('예외 일정이 너무 많아요.');
  }

  const knownTypes = new Set<string>(DAY_EXCEPTION_TYPES);
  const removedCompanyTypes = new Set(['business-trip', 'overtime']);
  const dayExceptions: Record<string, DayExceptionType> = {};
  for (const [key, rawType] of entries) {
    dateKey(key, '예외 일정');
    if (
      typeof rawType === 'string' &&
      removedCompanyTypes.has(rawType)
    ) {
      repairState.removedCompanyExceptions = true;
      continue;
    }
    if (typeof rawType !== 'string' || !knownTypes.has(rawType)) {
      throw new AppDataValidationError(`${key}의 예외 일정 종류가 올바르지 않아요.`);
    }
    dayExceptions[key] = rawType as DayExceptionType;
  }
  return dayExceptions;
}

function parseAlarmOverrides(value: unknown): Record<string, DayAlarmOverride> {
  const source = record(value, '날짜별 알람');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) {
    throw new AppDataValidationError('알람을 바꾼 날짜가 너무 많아요.');
  }

  const alarmOverrides: Record<string, DayAlarmOverride> = {};
  for (const [key, rawOverride] of entries) {
    dateKey(key, '알람을 바꾼 날짜');
    const item = record(rawOverride, `${key} 알람`);
    if (item.mode === 'disabled') {
      alarmOverrides[key] = { mode: 'disabled' };
      continue;
    }
    if (item.mode !== 'wake-time') {
      throw new AppDataValidationError(`${key}의 알람 방식이 올바르지 않아요.`);
    }
    const wakeMinutes = integerInRange(
      item.wakeMinutes,
      `${key} 기상 시각`,
      0,
      1439,
    );
    const wakeDayOffset = integerInRange(
      item.wakeDayOffset,
      `${key} 기상 날짜`,
      -1,
      0,
    );
    if (wakeDayOffset !== -1 && wakeDayOffset !== 0) {
      throw new AppDataValidationError(`${key}의 기상 날짜가 올바르지 않아요.`);
    }
    alarmOverrides[key] = { mode: 'wake-time', wakeMinutes, wakeDayOffset };
  }
  return alarmOverrides;
}

function parseNotes(value: unknown, legacy: boolean): Record<string, string> {
  const source = legacy ? optionalLegacyRecord(value, '메모') : record(value, '메모');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) throw new AppDataValidationError('메모가 너무 많아요.');

  const notes: Record<string, string> = {};
  for (const [key, note] of entries) {
    dateKey(key, '메모');
    if (typeof note !== 'string' || note.length > 100_000) {
      throw new AppDataValidationError(`${key}의 메모가 올바르지 않아요.`);
    }
    notes[key] = note;
  }
  return notes;
}

function legacyBoolean(value: unknown, fallback: boolean, label: string): boolean {
  return value === undefined ? fallback : requiredBoolean(value, label);
}

function legacyCount(value: unknown, fallback: number, label: string): number {
  return value === undefined ? fallback : integerInRange(value, label, 0, 100_000);
}

function legacyIsoDate(value: unknown, fallback: null, label: string): string | null {
  return value === undefined ? fallback : nullableIsoDate(value, label);
}

function parseThemeMode(value: unknown, label: string): ThemeMode {
  if (value !== 'system' && value !== 'light' && value !== 'dark') {
    throw new AppDataValidationError(`${label} 값이 올바르지 않아요.`);
  }
  return value;
}

function parseWorkRoutineTiming(
  value: unknown,
  label: string,
): WorkRoutineTiming {
  const item = record(value, label);
  const timing: WorkRoutineTiming = {
    departMinutesBefore: integerInRange(
      item.departMinutesBefore,
      `${label} 출발 시간`,
      5,
      WORK_ROUTINE_MAX_MINUTES_BEFORE,
    ),
    arriveMinutesBefore: integerInRange(
      item.arriveMinutesBefore,
      `${label} 도착 시간`,
      5,
      WORK_ROUTINE_MAX_MINUTES_BEFORE,
    ),
    handoverMinutesBefore: integerInRange(
      item.handoverMinutesBefore,
      `${label} 교대 완료 시간`,
      5,
      WORK_ROUTINE_MAX_MINUTES_BEFORE,
    ),
  };
  if (!isValidWorkRoutineTiming(timing)) {
    throw new AppDataValidationError(
      `${label}은 5분 단위로 출발, 도착, 교대 완료 순서에 맞춰 설정해 주세요.`,
    );
  }
  return timing;
}

function parseWorkRoutineProfiles(
  value: unknown,
  sourceVersion: AppDataVersion,
): WorkRoutineProfiles {
  if (sourceVersion < 15) return createDefaultWorkRoutineProfiles();
  const item = record(value, '출근 루틴');
  const day = parseWorkRoutineTiming(item.day, '주간 출근 루틴');
  return {
    day,
    evening:
      sourceVersion < 20
        ? { ...day }
        : parseWorkRoutineTiming(item.evening, '오후 출근 루틴'),
    night: parseWorkRoutineTiming(item.night, '야간 출근 루틴'),
  };
}

function parseWidgetDisplayOptions(
  value: unknown,
  sourceVersion: AppDataVersion,
): WidgetDisplayOptions {
  if (sourceVersion < 16) return { ...DEFAULT_WIDGET_DISPLAY_OPTIONS };
  const item = record(value, '위젯 표시 정보');
  const options = {
    todayShift: requiredBoolean(item.todayShift, '오늘 근무 표시 여부'),
    nextShift: requiredBoolean(item.nextShift, '다음 근무 표시 여부'),
    nextAlarm: requiredBoolean(item.nextAlarm, '다음 알람 표시 여부'),
  };
  if (!options.todayShift && !options.nextShift && !options.nextAlarm) {
    throw new AppDataValidationError('위젯에는 한 가지 이상의 정보를 표시해 주세요.');
  }
  return options;
}

function parseSettings(value: unknown, sourceVersion: AppDataVersion): AppSettings {
  const legacy = sourceVersion === 1;
  const item = legacy ? optionalLegacyRecord(value, '설정') : record(value, '설정');
  if (legacy) {
    return {
      notificationsEnabled: legacyBoolean(item.notificationsEnabled, false, '알람 사용 여부'),
      sleepReminderEnabled: false,
      scheduledNotificationCount: legacyCount(item.scheduledNotificationCount, 0, '예약 알람 개수'),
      lastNotificationSyncAt: legacyIsoDate(item.lastNotificationSyncAt, null, '마지막 알람 동기화'),
      setupCompleted: false,
      themeMode: 'dark',
      workRoutineProfiles: createDefaultWorkRoutineProfiles(),
      widgetDisplayOptions: { ...DEFAULT_WIDGET_DISPLAY_OPTIONS },
    };
  }

  return {
    notificationsEnabled: requiredBoolean(item.notificationsEnabled, '알람 사용 여부'),
    sleepReminderEnabled:
      sourceVersion < 18
        ? false
        : requiredBoolean(item.sleepReminderEnabled, '수면 시작 알림 사용 여부'),
    scheduledNotificationCount: integerInRange(item.scheduledNotificationCount, '예약 알람 개수', 0, 100_000),
    lastNotificationSyncAt: nullableIsoDate(item.lastNotificationSyncAt, '마지막 알람 동기화'),
    setupCompleted: requiredBoolean(item.setupCompleted, '첫 설정 완료 여부'),
    themeMode:
      sourceVersion < 5 || item.themeMode === undefined
        ? 'dark'
        : parseThemeMode(item.themeMode, '테마'),
    workRoutineProfiles: parseWorkRoutineProfiles(
      item.workRoutineProfiles,
      sourceVersion,
    ),
    widgetDisplayOptions: parseWidgetDisplayOptions(
      item.widgetDisplayOptions,
      sourceVersion,
    ),
  };
}

export function validateAndMigrateAppData(
  value: unknown,
  options: AppDataValidationOptions = {},
): ParsedAppData {
  const source = record(value, '근무표 데이터');
  if (
    source.version !== 1 &&
    source.version !== 2 &&
    source.version !== 3 &&
    source.version !== 4 &&
    source.version !== 5 &&
    source.version !== 6 &&
    source.version !== 7 &&
    source.version !== 8 &&
    source.version !== 9 &&
    source.version !== 10 &&
    source.version !== 11 &&
    source.version !== 12 &&
    source.version !== 13 &&
    source.version !== 14 &&
    source.version !== 15 &&
    source.version !== 16 &&
    source.version !== 17 &&
    source.version !== 18 &&
    source.version !== 19 &&
    source.version !== APP_DATA_VERSION
  ) {
    throw new AppDataValidationError('지원하지 않는 근무표 데이터 버전이에요.');
  }

  const sourceVersion: AppDataVersion = source.version;
  const legacyV1 = sourceVersion === 1;
  const needsMigration = sourceVersion !== APP_DATA_VERSION;
  const requiresShiftTypeMigration = sourceVersion <= 4;
  const repairState: AppDataRepairState = {
    oversizedAlarmMinutes: false,
    removedCompanyExceptions: false,
  };
  const substituteSchema =
    sourceVersion >= 5 ? 'split' : sourceVersion >= 3 ? 'legacy' : 'optional';
  const parsedShiftTypes = parseShiftTypes(
    source.shiftTypes,
    legacyV1,
    substituteSchema,
    requiresShiftTypeMigration
      ? MAX_LEGACY_SHIFT_TYPES
      : sourceVersion < 20
        ? MAX_PRE_V20_SHIFT_TYPES
        : MAX_SHIFT_TYPES,
    options.repairOversizedAlarmMinutes === true,
    repairState,
  );
  if (
    sourceVersion >= 20 &&
    !parsedShiftTypes.some((shift) => shift.id === 'evening' && !shift.isOff)
  ) {
    throw new AppDataValidationError('오후 기본 근무 종류가 필요해요.');
  }
  const sourceShiftIds = new Set(parsedShiftTypes.map((shift) => shift.id));
  const parsedPatternResult = parsePattern(source.pattern, sourceShiftIds);
  const parsedPattern = parsedPatternResult.pattern;
  const parsedOverrides = parseOverrides(source.overrides, sourceShiftIds, legacyV1);
  const parsedTimeOverrides =
    sourceVersion < 6 ? {} : parseTimeOverrides(source.timeOverrides, sourceShiftIds);
  const dayExceptions =
    sourceVersion < 7
      ? {}
      : parseDayExceptions(source.dayExceptions, repairState);
  const alarmOverrides =
    sourceVersion < 19 ? {} : parseAlarmOverrides(source.alarmOverrides);
  const eveningMigration = migrateV20EveningShift(
    migrateV12DefaultAlarmMinutes(
      migrateLegacyDefaultShiftTimes(
        requiresShiftTypeMigration
          ? migrateShiftTypes(parsedShiftTypes, sourceVersion as 1 | 2 | 3 | 4)
          : parsedShiftTypes,
        sourceVersion,
      ),
      sourceVersion,
    ),
    sourceVersion,
  );
  const { shiftTypes, renamedLegacyEveningId } = eveningMigration;
  const normalizedShiftTypeIds =
    sourceVersion <= 2
      ? [...ROTATION_PATTERN_SHIFT_TYPE_IDS]
      : parsedPattern.shiftTypeIds.map((shiftTypeId) =>
          rewriteLegacyEveningReference(shiftTypeId, renamedLegacyEveningId),
        );
  const presetId = getWorkPatternPresetId(normalizedShiftTypeIds);
  const migratedLegacyEveningPattern =
    renamedLegacyEveningId !== null &&
    parsedPattern.shiftTypeIds.includes('evening') &&
    isValidLegacyEveningCompatibilityPattern(normalizedShiftTypeIds);
  if (
    sourceVersion >= 3 &&
    sourceVersion < 5 &&
    presetId !== 'three-team-two-shift' &&
    !migratedLegacyEveningPattern
  ) {
    throw new AppDataValidationError('이전 데이터 버전은 3조 2교대 근무 방식만 지원해요.');
  }
  if (
    sourceVersion >= 5 &&
    sourceVersion < 20 &&
    presetId !== 'three-team-two-shift' &&
    presetId !== 'weekday' &&
    !migratedLegacyEveningPattern
  ) {
    throw new AppDataValidationError('지원하는 근무 방식은 3조 2교대 또는 주간 고정이에요.');
  }
  if (
    sourceVersion >= 20 &&
    (presetId === 'custom'
      ? !isValidCustomPatternSequence(normalizedShiftTypeIds) &&
        !isValidLegacyEveningCompatibilityPattern(normalizedShiftTypeIds)
      : !normalizedShiftTypeIds.every(isBaseWorkShiftId))
  ) {
    throw new AppDataValidationError('기타 근무 순서는 1~42일이며 주간·오후·야간·휴무만 사용할 수 있어요.');
  }
  const patternKind = presetId === 'weekday' ? 'weekday' : 'rotation';
  const pattern: RotationPattern = {
    ...parsedPattern,
    name: getWorkPatternDisplayName(normalizedShiftTypeIds, parsedPattern.name),
    shiftTypeIds: normalizedShiftTypeIds,
  };
  const substituteOverrideTargetId = legacySubstituteTargetId(parsedShiftTypes);
  const overrides = Object.fromEntries(
    Object.entries(parsedOverrides).map(([key, shiftId]) => {
      if (shiftId === null) return [key, null];
      const migratedSubstituteId =
        requiresShiftTypeMigration && shiftId === 'substitute'
          ? substituteOverrideTargetId
          : shiftId;
      return [
        key,
        rewriteLegacyEveningReference(
          migratedSubstituteId,
          renamedLegacyEveningId,
        ),
      ];
    }),
  );
  const timeOverrides = Object.fromEntries(
    Object.entries(parsedTimeOverrides).map(([key, timeOverride]) => [
      key,
      {
        ...timeOverride,
        shiftTypeId: rewriteLegacyEveningReference(
          timeOverride.shiftTypeId,
          renamedLegacyEveningId,
        ),
      },
    ]),
  );
  const normalizedShiftTypes =
    patternKind === 'weekday' && sourceVersion < 19
      ? shiftTypes.map((shift) =>
          shift.id === 'day'
            ? {
                ...shift,
                startMinutes: DAY_SHIFT_START_MINUTES,
                endMinutes: DAY_SHIFT_END_MINUTES,
                endsNextDay: false,
              }
            : shift,
        )
      : shiftTypes;
  const parsedSettings = parseSettings(source.settings, sourceVersion);
  const normalizedLegacyTheme = parsedSettings.themeMode !== 'dark';
  const data: AppData = {
    version: APP_DATA_VERSION,
    shiftTypes: normalizedShiftTypes,
    pattern,
    overrides,
    timeOverrides,
    dayExceptions,
    alarmOverrides,
    notes: parseNotes(source.notes, legacyV1),
    scheduleChangeHistory: [],
    settings: {
      ...parsedSettings,
      // 이전 백업의 자동·라이트 값은 읽기 호환만 유지하고 현재 앱에서는 다크로 확정해요.
      themeMode: 'dark',
    },
  };

  const removedLegacyActivityData =
    Object.prototype.hasOwnProperty.call(source, 'workBreakPlans') ||
    Object.prototype.hasOwnProperty.call(source, 'activityPlans') ||
    Object.prototype.hasOwnProperty.call(source, 'datedActivityPlans') ||
    Object.prototype.hasOwnProperty.call(source, 'activityCatalog') ||
    (typeof source.settings === 'object' &&
      source.settings !== null &&
      Object.prototype.hasOwnProperty.call(
        source.settings,
        'activityHandoverNotificationsEnabled',
      ));
  const removedScheduleChangeHistory =
    !Object.prototype.hasOwnProperty.call(source, 'scheduleChangeHistory') ||
    !Array.isArray(source.scheduleChangeHistory) ||
    source.scheduleChangeHistory.length > 0;

  return {
    data,
    migratedFromVersion: needsMigration ? sourceVersion : null,
    requiresPersistence:
      needsMigration ||
      parsedPatternResult.inferredScheduleStartDate ||
      repairState.oversizedAlarmMinutes ||
      repairState.removedCompanyExceptions ||
      removedLegacyActivityData ||
      removedScheduleChangeHistory ||
      normalizedLegacyTheme,
  };
}

/** 저장·상태·알람 계획에서 함께 사용할 현재 버전의 정규화된 앱 데이터를 만들어요. */
export function canonicalizeAppData(data: AppData): AppData {
  return validateAndMigrateAppData(data).data;
}

function assertAppDataJsonByteSize(raw: string): void {
  try {
    getCheckedAppDataContentsByteSize(raw);
  } catch (error) {
    throw new AppDataValidationError(
      error instanceof Error ? error.message : '근무표 데이터가 너무 커요.',
    );
  }
}

function assertBackupJsonByteSize(raw: string): void {
  try {
    getCheckedBackupContentsByteSize(raw);
  } catch (error) {
    throw new AppDataValidationError(
      error instanceof Error ? error.message : '백업 파일이 너무 커요.',
    );
  }
}

export function parseAppDataJson(raw: string): ParsedAppData {
  assertAppDataJsonByteSize(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripOptionalUtf8Bom(raw)) as unknown;
  } catch {
    throw new AppDataValidationError('근무표 데이터의 JSON 형식이 올바르지 않아요.');
  }
  return validateAndMigrateAppData(parsed, { repairOversizedAlarmMinutes: true });
}

export function tryParseAppDataJson(raw: string): AppDataParseResult {
  try {
    return { ok: true, value: parseAppDataJson(raw) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof AppDataValidationError
          ? error
          : new AppDataValidationError('근무표 데이터를 확인하지 못했어요.'),
    };
  }
}

export function serializeAppData(data: AppData): string {
  return JSON.stringify(canonicalizeAppData(data));
}

export type AppDataExportOptions = {
  /** 사람이 직접 읽는 내보내기는 기본값인 들여쓰기를 사용하고, 내부 안전 백업은 compact를 사용해요. */
  pretty?: boolean;
};

export function exportAppDataToJson(
  data: AppData,
  now: Date = new Date(),
  options: AppDataExportOptions = {},
): string {
  const exportedAt = now.toISOString();
  const normalized = canonicalizeAppData(data);
  return JSON.stringify(
    {
      format: APP_DATA_BACKUP_FORMAT,
      formatVersion: APP_DATA_BACKUP_FORMAT_VERSION,
      exportedAt,
      data: normalized,
    },
    null,
    options.pretty === false ? undefined : 2,
  );
}

export function previewAppDataImport(raw: string): AppDataImportPreview {
  assertBackupJsonByteSize(raw);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripOptionalUtf8Bom(raw)) as unknown;
  } catch {
    throw new AppDataValidationError('백업 파일의 JSON 형식이 올바르지 않아요.');
  }

  const envelope = parseAppDataImportEnvelope(parsedJson);
  const parsed = validateAndMigrateAppData(envelope.data, {
    repairOversizedAlarmMinutes: true,
  });
  return {
    data: parsed.data,
    exportedAt: envelope.exportedAt,
    migratedFromVersion: parsed.migratedFromVersion,
    source: envelope.source,
    summary: {
      patternName: parsed.data.pattern.name,
      anchorDate: parsed.data.pattern.anchorDate,
      scheduleStartDate:
        parsed.data.pattern.scheduleStartDate ?? parsed.data.pattern.anchorDate,
      shiftTypeCount: parsed.data.shiftTypes.length,
      changedDateCount: new Set([
        ...Object.keys(parsed.data.overrides),
        ...Object.keys(parsed.data.timeOverrides),
        ...Object.keys(parsed.data.dayExceptions),
        ...Object.keys(parsed.data.alarmOverrides),
      ]).size,
      noteCount: Object.keys(parsed.data.notes).length,
    },
  };
}

export function appDataFromImportPreview(preview: AppDataImportPreview): AppData {
  return canonicalizeAppData(preview.data);
}
