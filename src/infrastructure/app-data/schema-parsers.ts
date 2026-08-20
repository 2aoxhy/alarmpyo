import {
  DEFAULT_ALARM_MINUTES_BEFORE,
  LEGACY_MAX_ALARM_MINUTES_BEFORE,
  MAX_ALARM_MINUTES_BEFORE,
  type AppliedPatternSource,
  type AppSettings,
  type DayAlarmOverride,
  type DayExceptionType,
  type DayTimeOverride,
  type PatternHistoryEntry,
  type PatternShiftCode,
  type PatternVaultEntry,
  type PatternVaultSource,
  type PayrollSettings,
  type RotationPattern,
  type ShiftType,
  type ThemeMode,
  type WidgetDisplayOptions,
  type WorkRoutineProfiles,
  type WorkRoutineTiming,
} from '../../models/app-data';
import { DAY_EXCEPTION_TYPES } from '../../utils/day-exception';
import {
  createDefaultWorkRoutineProfiles,
  isValidWorkRoutineTiming,
  WORK_ROUTINE_MAX_MINUTES_BEFORE,
} from '../../services/work-routine-settings';
import { DEFAULT_PAYROLL_SETTINGS } from '../../services/payroll-policy';
import { isOfficialPatternId } from '../../services/official-pattern-ids';
import { matchesOfficialPatternContract } from '../../services/official-pattern-contract';
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
} from './validation';
import type { AppDataVersion } from './migrations';
import type {
  AppDataRepairState,
  AppDataSchemaParserDependencies,
} from './schema-validator';

const MAX_PATTERN_LENGTH = 3_660;
const MAX_DATED_ITEMS = 20_000;
const MAX_PATTERN_VAULT_ITEMS = 100;
const MAX_PATTERN_HISTORY_ITEMS = 10;

export const DEFAULT_WIDGET_DISPLAY_OPTIONS: Readonly<WidgetDisplayOptions> = {
  todayShift: true,
  nextShift: true,
  nextAlarm: false,
};

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
    throw new AppDataValidationError(`${index + 1}번째 근무의 시작·종료 시간이 필요합니다.`);
  }
  if (!isOff && startMinutes === endMinutes) {
    throw new AppDataValidationError(`${index + 1}번째 근무의 시작·종료 시간은 달라야 합니다.`);
  }

  const inferredEndsNextDay =
    !isOff && startMinutes !== null && endMinutes !== null && endMinutes < startMinutes;
  if (!legacy && !isOff && storedEndsNextDay !== inferredEndsNextDay) {
    throw new AppDataValidationError(
      `${index + 1}번째 근무의 다음 날 종료 설정이 시간과 맞지 않습니다.`,
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
    throw new AppDataValidationError(`${index + 1}번째 휴무 설정이 올바르지 않습니다.`);
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
    throw new AppDataValidationError('근무 종류 목록이 올바르지 않습니다.');
  }

  const shiftTypes = value.map((item, index) =>
    parseShiftType(item, index, legacy, repairOversizedAlarmMinutes, repairState),
  );
  const ids = new Set<string>();
  for (const shift of shiftTypes) {
    if (ids.has(shift.id)) throw new AppDataValidationError('근무 종류 ID가 중복되어 있습니다.');
    ids.add(shift.id);
  }
  const day = shiftTypes.find((shift) => shift.id === 'day');
  const night = shiftTypes.find((shift) => shift.id === 'night');
  const off = shiftTypes.find((shift) => shift.id === 'off');
  if (!day || !night || !off || day.isOff || night.isOff || !off.isOff) {
    throw new AppDataValidationError('주간·야간·휴무 기본 근무 종류가 필요합니다.');
  }
  const substitute = shiftTypes.find((shift) => shift.id === 'substitute');
  if (substituteSchema === 'legacy' && (!substitute || substitute.isOff)) {
    throw new AppDataValidationError('대체근무 기본 근무 종류가 필요합니다.');
  }
  const substituteDay = shiftTypes.find((shift) => shift.id === 'substitute-day');
  const substituteNight = shiftTypes.find((shift) => shift.id === 'substitute-night');
  if (substituteSchema !== 'split' && (substituteDay || substituteNight)) {
    throw new AppDataValidationError('이 데이터 버전의 대체근무 ID가 올바르지 않습니다.');
  }
  if (
    substituteSchema === 'split' &&
    (substitute || !substituteDay || !substituteNight || substituteDay.isOff || substituteNight.isOff)
  ) {
    throw new AppDataValidationError('주간·야간 대체근무 기본 근무 종류가 필요합니다.');
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
    throw new AppDataValidationError('근무 순서가 올바르지 않습니다.');
  }

  const shiftTypeIds = item.shiftTypeIds.map((id, index) => {
    const parsedId = requiredString(id, `${index + 1}번째 근무 ID`, 100);
    if (!knownShiftIds.has(parsedId)) {
      throw new AppDataValidationError('근무 순서에 알 수 없는 근무 종류가 있습니다.');
    }
    return parsedId;
  });

  const anchorDate = dateKey(item.anchorDate, '근무 방식 기준일');
  const inferredScheduleStartDate = item.scheduleStartDate === undefined;
  const scheduleStartDate = inferredScheduleStartDate
    ? anchorDate
    : dateKey(item.scheduleStartDate, '첫 근무일');
  const kind = item.kind;
  if (kind !== undefined && kind !== 'rotation' && kind !== 'weekday') {
    throw new AppDataValidationError('근무 방식 실행 종류가 올바르지 않습니다.');
  }

  return {
    pattern: {
      name: requiredString(item.name, '근무 방식 이름', 200),
      anchorDate,
      ...(kind === undefined ? {} : { kind }),
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
    throw new AppDataValidationError('변경한 날짜가 너무 많습니다.');
  }

  const overrides: Record<string, string | null> = {};
  for (const [key, shiftId] of entries) {
    dateKey(key, '변경한 근무');
    if (shiftId !== null && (typeof shiftId !== 'string' || !knownShiftIds.has(shiftId))) {
      throw new AppDataValidationError(`${key}에 알 수 없는 근무 종류가 있습니다.`);
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
    throw new AppDataValidationError('시간을 바꾼 날짜가 너무 많습니다.');
  }

  const timeOverrides: Record<string, DayTimeOverride> = {};
  for (const [key, rawOverride] of entries) {
    dateKey(key, '시간을 바꾼 근무');
    const item = record(rawOverride, `${key} 근무 시간`);
    const shiftTypeId = requiredString(item.shiftTypeId, `${key} 근무 종류`, 100);
    if (!knownShiftIds.has(shiftTypeId)) {
      throw new AppDataValidationError(`${key}에 알 수 없는 근무 종류가 있습니다.`);
    }
    const startMinutes = integerInRange(item.startMinutes, `${key} 시작 시각`, 0, 1439);
    const endMinutes = integerInRange(item.endMinutes, `${key} 종료 시각`, 0, 1439);
    if (startMinutes === endMinutes) {
      throw new AppDataValidationError(`${key}의 시작과 종료 시각은 달라야 합니다.`);
    }
    const endsNextDay = requiredBoolean(item.endsNextDay, `${key} 익일 종료 여부`);
    if (endsNextDay !== (endMinutes < startMinutes)) {
      throw new AppDataValidationError(`${key}의 익일 종료 여부가 근무 시간과 맞지 않습니다.`);
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
    throw new AppDataValidationError('예외 일정이 너무 많습니다.');
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
      throw new AppDataValidationError(`${key}의 예외 일정 종류가 올바르지 않습니다.`);
    }
    dayExceptions[key] = rawType as DayExceptionType;
  }
  return dayExceptions;
}

function parseAlarmOverrides(value: unknown): Record<string, DayAlarmOverride> {
  const source = record(value, '날짜별 알람');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) {
    throw new AppDataValidationError('알람을 바꾼 날짜가 너무 많습니다.');
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
      throw new AppDataValidationError(`${key}의 알람 방식이 올바르지 않습니다.`);
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
      throw new AppDataValidationError(`${key}의 기상 날짜가 올바르지 않습니다.`);
    }
    alarmOverrides[key] = { mode: 'wake-time', wakeMinutes, wakeDayOffset };
  }
  return alarmOverrides;
}

function parseNotes(value: unknown, legacy: boolean): Record<string, string> {
  const source = legacy ? optionalLegacyRecord(value, '메모') : record(value, '메모');
  const entries = Object.entries(source);
  if (entries.length > MAX_DATED_ITEMS) throw new AppDataValidationError('메모가 너무 많습니다.');

  const notes: Record<string, string> = {};
  for (const [key, note] of entries) {
    dateKey(key, '메모');
    if (typeof note !== 'string' || note.length > 100_000) {
      throw new AppDataValidationError(`${key}의 메모가 올바르지 않습니다.`);
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
    throw new AppDataValidationError(`${label} 값이 올바르지 않습니다.`);
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
      `${label}은 5분 단위로 출발, 도착, 교대 완료 순서에 맞춰 설정해야 합니다.`,
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
    throw new AppDataValidationError('위젯에는 한 가지 이상의 정보를 표시해야 합니다.');
  }
  return options;
}

function parsePayrollSettings(
  value: unknown,
  sourceVersion: AppDataVersion,
): PayrollSettings {
  if (sourceVersion < 21) return { ...DEFAULT_PAYROLL_SETTINGS };
  const item = record(value, '급여일 설정');
  const day = integerInRange(item.day, '급여 지급일', 1, 31);
  if (
    item.adjustment !== 'fixed-date' &&
    item.adjustment !== 'previous-business-day'
  ) {
    throw new AppDataValidationError('급여일 조정 방식이 올바르지 않습니다.');
  }
  return { day, adjustment: item.adjustment };
}

const PATTERN_SHIFT_CODES = new Set<PatternShiftCode>([
  'DAY',
  'EVENING',
  'NIGHT',
  'OFF',
  'DAY_SUBSTITUTE',
  'NIGHT_SUBSTITUTE',
]);
const PATTERN_VAULT_SOURCES = new Set<PatternVaultSource>([
  'official',
  'user',
  'imported',
]);
const APPLIED_PATTERN_SOURCES = new Set<AppliedPatternSource>([
  'legacy',
  'official',
  'user',
  'imported',
]);

function requiredIsoDate(value: unknown, label: string): string {
  const parsed = nullableIsoDate(value, label);
  if (parsed === null) {
    throw new AppDataValidationError(`${label} 날짜가 올바르지 않습니다.`);
  }
  return parsed;
}

function nullableShortString(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === null) return null;
  return requiredString(value, label, maximumLength);
}

function parsePatternShiftCodes(value: unknown, label: string): PatternShiftCode[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 42) {
    throw new AppDataValidationError(`${label}이 올바르지 않습니다.`);
  }
  return value.map((code) => {
    if (typeof code !== 'string' || !PATTERN_SHIFT_CODES.has(code as PatternShiftCode)) {
      throw new AppDataValidationError(`${label}에 알 수 없는 근무 코드가 있습니다.`);
    }
    return code as PatternShiftCode;
  });
}

function parsePatternVault(value: unknown, sourceVersion: AppDataVersion): PatternVaultEntry[] {
  if (sourceVersion < 21) return [];
  if (!Array.isArray(value) || value.length > MAX_PATTERN_VAULT_ITEMS) {
    throw new AppDataValidationError('패턴 보관소가 올바르지 않습니다.');
  }
  const ids = new Set<string>();
  return value.map((rawEntry, index) => {
    const label = `${index + 1}번째 보관 패턴`;
    const item = record(rawEntry, label);
    const id = requiredString(item.id, `${label} ID`, 100);
    if (ids.has(id)) {
      throw new AppDataValidationError('패턴 보관소 ID가 중복되어 있습니다.');
    }
    ids.add(id);
    if (
      typeof item.source !== 'string' ||
      !PATTERN_VAULT_SOURCES.has(item.source as PatternVaultSource)
    ) {
      throw new AppDataValidationError(`${label} 출처가 올바르지 않습니다.`);
    }
    const source = item.source as PatternVaultSource;
    const reservedOfficialId = isOfficialPatternId(id);
    if ((source === 'official') !== reservedOfficialId) {
      throw new AppDataValidationError(`${label} 공식 ID와 출처가 맞지 않습니다.`);
    }
    const name = requiredString(item.name, `${label} 이름`, 80);
    const author = nullableShortString(item.author, `${label} 제작자`, 80);
    const sourceVersion = integerInRange(
      item.sourceVersion,
      `${label} 버전`,
      1,
      2_147_483_647,
    );
    const anchorDate = dateKey(item.anchorDate, `${label} 기준일`);
    const shiftCodes = parsePatternShiftCodes(item.shiftCodes, `${label} 근무 순서`);
    if (
      source === 'official' &&
      reservedOfficialId &&
      !matchesOfficialPatternContract({
        id,
        name,
        author,
        sourceVersion,
        anchorDate,
        shiftCodes,
      })
    ) {
      throw new AppDataValidationError(`${label} 공식 패턴 계약이 올바르지 않습니다.`);
    }
    return {
      id,
      source,
      name,
      author,
      sourceVersion,
      anchorDate,
      shiftCodes,
      createdAt: requiredIsoDate(item.createdAt, `${label} 생성일`),
      updatedAt: requiredIsoDate(item.updatedAt, `${label} 수정일`),
    };
  });
}

function parsePatternHistory(
  value: unknown,
  sourceVersion: AppDataVersion,
  knownShiftIds: ReadonlySet<string>,
): PatternHistoryEntry[] {
  if (sourceVersion < 21) return [];
  if (!Array.isArray(value) || value.length > MAX_PATTERN_HISTORY_ITEMS) {
    throw new AppDataValidationError('패턴 적용 이력이 올바르지 않습니다.');
  }
  const ids = new Set<string>();
  return value.map((rawEntry, index) => {
    const label = `${index + 1}번째 패턴 적용 이력`;
    const item = record(rawEntry, label);
    const id = requiredString(item.id, `${label} ID`, 100);
    if (ids.has(id)) {
      throw new AppDataValidationError('패턴 적용 이력 ID가 중복되어 있습니다.');
    }
    ids.add(id);
    if (
      typeof item.source !== 'string' ||
      !PATTERN_VAULT_SOURCES.has(item.source as PatternVaultSource)
    ) {
      throw new AppDataValidationError(`${label} 출처가 올바르지 않습니다.`);
    }
    const overrideDateKeys = item.overrideDateKeys;
    if (!Array.isArray(overrideDateKeys) || overrideDateKeys.length > MAX_DATED_ITEMS) {
      throw new AppDataValidationError(`${label} 변경 날짜가 올바르지 않습니다.`);
    }
    const previousSource = item.previousSource;
    if (
      typeof previousSource !== 'string' ||
      !APPLIED_PATTERN_SOURCES.has(previousSource as AppliedPatternSource)
    ) {
      throw new AppDataValidationError(`${label} 이전 출처가 올바르지 않습니다.`);
    }
    const clearedOverrides = parseOverrides(
      item.clearedOverrides,
      knownShiftIds,
      false,
    );
    const clearedTimeOverrides = parseTimeOverrides(
      item.clearedTimeOverrides,
      knownShiftIds,
    );
    const parsedOverrideDateKeys = overrideDateKeys.map((key) =>
      dateKey(key, `${label} 변경 날짜`),
    );
    if (new Set(parsedOverrideDateKeys).size !== parsedOverrideDateKeys.length) {
      throw new AppDataValidationError(`${label} 변경 날짜가 중복되어 있습니다.`);
    }
    const recordedDateKeys = new Set([
      ...Object.keys(clearedOverrides),
      ...Object.keys(clearedTimeOverrides),
    ]);
    if (
      recordedDateKeys.size !== parsedOverrideDateKeys.length ||
      parsedOverrideDateKeys.some((key) => !recordedDateKeys.has(key))
    ) {
      throw new AppDataValidationError(`${label} 변경 원본이 날짜 목록과 맞지 않습니다.`);
    }
    const previousPatternId = nullableShortString(
      item.previousPatternId,
      `${label} 이전 패턴 ID`,
      100,
    );
    if (
      (previousSource === 'legacy' && previousPatternId !== null) ||
      (previousSource !== 'legacy' && previousPatternId === null)
    ) {
      throw new AppDataValidationError(`${label} 이전 출처와 패턴 ID가 맞지 않습니다.`);
    }
    return {
      id,
      appliedAt: requiredIsoDate(item.appliedAt, `${label} 적용일`),
      source: item.source as PatternVaultSource,
      patternId: requiredString(item.patternId, `${label} 패턴 ID`, 100),
      previousSource: previousSource as AppliedPatternSource,
      previousPatternId,
      previousPattern: parsePattern(item.previousPattern, knownShiftIds).pattern,
      nextPattern: parsePattern(item.nextPattern, knownShiftIds).pattern,
      clearedOverrides,
      clearedTimeOverrides,
      overrideDateKeys: parsedOverrideDateKeys,
    };
  });
}

function parseAppliedPatternSource(
  value: unknown,
  sourceVersion: AppDataVersion,
): AppliedPatternSource {
  if (sourceVersion < 21) return 'legacy';
  if (typeof value !== 'string' || !APPLIED_PATTERN_SOURCES.has(value as AppliedPatternSource)) {
    throw new AppDataValidationError('적용한 패턴 출처가 올바르지 않습니다.');
  }
  return value as AppliedPatternSource;
}

function parseAppliedPatternId(
  value: unknown,
  sourceVersion: AppDataVersion,
): string | null {
  // V11의 v21 저장 계약에는 이 필드가 없었으므로 누락을 정상적인 legacy 상태로 읽습니다.
  if (sourceVersion < 21 || value === undefined || value === null) return null;
  return requiredString(value, '적용한 패턴 ID', 100);
}

function parseDismissedUpdateVersionCode(
  value: unknown,
  sourceVersion: AppDataVersion,
): number | null {
  if (sourceVersion < 21 || value === undefined || value === null) return null;
  return integerInRange(value, '닫은 업데이트 버전', 1, 2_147_483_647);
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
      dismissedUpdateVersionCode: null,
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
    dismissedUpdateVersionCode: parseDismissedUpdateVersionCode(
      item.dismissedUpdateVersionCode,
      sourceVersion,
    ),
  };
}


export const APP_DATA_SCHEMA_PARSERS = {
  parseAlarmOverrides,
  parseAppliedPatternId,
  parseAppliedPatternSource,
  parseDayExceptions,
  parseNotes,
  parseOverrides,
  parsePattern,
  parsePatternHistory,
  parsePatternVault,
  parsePayrollSettings,
  parseSettings,
  parseShiftTypes,
  parseTimeOverrides,
} satisfies AppDataSchemaParserDependencies;
