import {
  createDefaultShiftTypes,
} from '../application/app-data-defaults';
import {
  MAX_ALARM_MINUTES_BEFORE,
  type AppData,
  type DayAlarmOverride,
  type DayExceptionType,
  type ShiftType,
} from '../models/app-data';
import {
  APP_DATA_BACKUP_FORMAT,
  APP_DATA_BACKUP_FORMAT_VERSION,
} from '../infrastructure/app-data/import-envelope';
import {
  createAppDataJsonCodec,
  type AppDataJsonExportOptions,
  type AppDataJsonImportPreview,
  type AppDataJsonParseResult,
} from '../infrastructure/app-data/json-codec';
import {
  AppDataValidationError,
} from '../infrastructure/app-data/validation';
import {
  type PreviousAppDataVersion,
} from '../infrastructure/app-data/migrations';
import {
  APP_DATA_SCHEMA_PARSERS,
  DEFAULT_WIDGET_DISPLAY_OPTIONS,
} from '../infrastructure/app-data/schema-parsers';
import {
  createAppDataSchemaValidator,
  type AppDataValidationOptions,
  type ParsedAppData,
} from '../infrastructure/app-data/schema-validator';
import {
  addDays,
  dateAtMinutes,
  isValidDateKey,
  toDateKey,
} from '../utils/date';
import {
  getWorkPatternName,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
} from '../utils/work-pattern';
import {
  createDefaultWorkRoutineProfiles,
} from './work-routine-settings';
import {
  getCheckedAppDataContentsByteSize,
  getCheckedBackupContentsByteSize,
} from './backup-file-policy';
import { DEFAULT_PAYROLL_SETTINGS } from './payroll-policy';
import {
  getPatternScheduleStartDate,
  isPatternScheduleDate,
  resolveBaseShift,
  resolveEffectiveDay,
  type EffectiveDay,
  type ResolveEffectiveDay,
  type ResolveEffectiveDayOptions,
} from './pattern-engine';

export const APP_DATA_VERSION = 21 as const;
export { APP_DATA_BACKUP_FORMAT, APP_DATA_BACKUP_FORMAT_VERSION };

export { DEFAULT_WIDGET_DISPLAY_OPTIONS };

export { DEFAULT_PAYROLL_SETTINGS } from './payroll-policy';

export type { ParsedAppData };

export type AppDataParseResult =
  AppDataJsonParseResult<PreviousAppDataVersion>;

export type AppDataImportPreview =
  AppDataJsonImportPreview<PreviousAppDataVersion>;

export { AppDataValidationError };

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
    payrollSettings: { ...DEFAULT_PAYROLL_SETTINGS },
    patternVault: [],
    patternHistory: [],
    appliedPatternSource: 'legacy',
    appliedPatternId: null,
    settings: {
      notificationsEnabled: false,
      sleepReminderEnabled: false,
      scheduledNotificationCount: 0,
      lastNotificationSyncAt: null,
      setupCompleted: false,
      themeMode: 'dark',
      workRoutineProfiles: createDefaultWorkRoutineProfiles(),
      widgetDisplayOptions: { ...DEFAULT_WIDGET_DISPLAY_OPTIONS },
      dismissedUpdateVersionCode: null,
    },
  };
}

/** 반복 계산용 기준일과 별개로 실제 근무표가 시작되는 첫 날짜를 반환합니다. */
export function getScheduleStartDate(data: Pick<AppData, 'pattern'>): string {
  return getPatternScheduleStartDate(data.pattern);
}

/** 첫 근무일부터 근무·예외 일정을 적용합니다. */
export function isScheduleDate(data: Pick<AppData, 'pattern'>, dateKey: string): boolean {
  return isPatternScheduleDate(data.pattern, dateKey);
}

/** 첫 근무일 이전에 저장된 예외 일정은 화면과 알람에 적용하지 않아요. */
export function resolveDayExceptionFromAppData(
  data: AppData,
  dateKey: string,
): DayExceptionType | undefined {
  return isScheduleDate(data, dateKey) ? data.dayExceptions[dateKey] : undefined;
}

export function resolveBaseShiftFromAppData(data: AppData, dateKey: string): ShiftType | null {
  return resolveBaseShift(data, dateKey);
}

export type { EffectiveDay, ResolveEffectiveDay, ResolveEffectiveDayOptions };

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
  return resolveEffectiveDay(data, dateKey, options);
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
    throw new AppDataValidationError('직접 변경 일정을 정리할 기준 날짜가 올바르지 않습니다.');
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

const validateAppDataSchema = createAppDataSchemaValidator(
  APP_DATA_SCHEMA_PARSERS,
);

export function validateAndMigrateAppData(
  value: unknown,
  options: AppDataValidationOptions = {},
): ParsedAppData {
  return validateAppDataSchema(value, options);
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
      error instanceof Error ? error.message : '근무표 데이터가 너무 큽니다.',
    );
  }
}

function assertBackupJsonByteSize(raw: string): void {
  try {
    getCheckedBackupContentsByteSize(raw);
  } catch (error) {
    throw new AppDataValidationError(
      error instanceof Error ? error.message : '백업 파일이 너무 큽니다.',
    );
  }
}

const appDataJsonCodec = createAppDataJsonCodec<PreviousAppDataVersion>({
  assertAppDataJsonByteSize,
  assertBackupJsonByteSize,
  canonicalizeAppData,
  validateAndMigrateAppData,
});

export function parseAppDataJson(raw: string): ParsedAppData {
  return appDataJsonCodec.parseAppDataJson(raw);
}

export function tryParseAppDataJson(raw: string): AppDataParseResult {
  return appDataJsonCodec.tryParseAppDataJson(raw);
}

export function serializeAppData(data: AppData): string {
  return appDataJsonCodec.serializeAppData(data);
}

export type AppDataExportOptions = AppDataJsonExportOptions;

export function exportAppDataToJson(
  data: AppData,
  now: Date = new Date(),
  options: AppDataExportOptions = {},
): string {
  return appDataJsonCodec.exportAppDataToJson(data, now, options);
}

export function previewAppDataImport(raw: string): AppDataImportPreview {
  return appDataJsonCodec.previewAppDataImport(raw);
}

export function appDataFromImportPreview(preview: AppDataImportPreview): AppData {
  return appDataJsonCodec.appDataFromImportPreview(preview);
}
