import {
  DAY_SHIFT_END_MINUTES,
  DAY_SHIFT_START_MINUTES,
} from '../../constants/shift-schedule';
import type {
  AppData,
  AppSettings,
  AppliedPatternSource,
  DayAlarmOverride,
  DayExceptionType,
  DayTimeOverride,
  PatternHistoryEntry,
  PatternVaultEntry,
  PayrollSettings,
  RotationPattern,
  ShiftType,
} from '../../models/app-data';
import {
  getWorkPatternDisplayName,
  getWorkPatternKind,
  getWorkPatternPresetId,
  isBaseWorkShiftId,
  isValidCustomPatternSequence,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
} from '../../utils/work-pattern';
import {
  isValidLegacyEveningCompatibilityPattern,
  legacySubstituteTargetId,
  MAX_LEGACY_SHIFT_TYPES,
  MAX_PRE_V20_SHIFT_TYPES,
  MAX_SHIFT_TYPES,
  migrateLegacyDefaultShiftTimes,
  migrateShiftTypes,
  migrateV12DefaultAlarmMinutes,
  migrateV20EveningShift,
  migrateV21SubstituteLabels,
  rewriteLegacyEveningReference,
  type AppDataVersion,
  type PreviousAppDataVersion,
} from './migrations';
import {
  AppDataValidationError,
  record,
} from './validation';

const APP_DATA_VERSION = 21 as const;
const V12_PATTERN_SHIFT_TYPE_IDS = new Set([
  'day',
  'evening',
  'night',
  'off',
  'substitute-day',
  'substitute-night',
]);

export type AppDataValidationOptions = {
  repairOversizedAlarmMinutes?: boolean;
};

export type AppDataRepairState = {
  oversizedAlarmMinutes: boolean;
  removedCompanyExceptions: boolean;
};

export type ParsedAppData = {
  data: AppData;
  migratedFromVersion: PreviousAppDataVersion | null;
  requiresPersistence: boolean;
};

export type AppDataSchemaParserDependencies = {
  parseShiftTypes: (
    value: unknown,
    legacy: boolean,
    substituteSchema: 'optional' | 'legacy' | 'split',
    maximumCount: number,
    repairOversizedAlarmMinutes: boolean,
    repairState: AppDataRepairState,
  ) => ShiftType[];
  parsePattern: (
    value: unknown,
    knownShiftIds: ReadonlySet<string>,
  ) => { pattern: RotationPattern; inferredScheduleStartDate: boolean };
  parseOverrides: (
    value: unknown,
    knownShiftIds: ReadonlySet<string>,
    legacy: boolean,
  ) => Record<string, string | null>;
  parseTimeOverrides: (
    value: unknown,
    knownShiftIds: ReadonlySet<string>,
  ) => Record<string, DayTimeOverride>;
  parseDayExceptions: (
    value: unknown,
    repairState: AppDataRepairState,
  ) => Record<string, DayExceptionType>;
  parseAlarmOverrides: (value: unknown) => Record<string, DayAlarmOverride>;
  parseNotes: (value: unknown, legacy: boolean) => Record<string, string>;
  parseSettings: (value: unknown, version: AppDataVersion) => AppSettings;
  parsePayrollSettings: (
    value: unknown,
    version: AppDataVersion,
  ) => PayrollSettings;
  parsePatternVault: (
    value: unknown,
    version: AppDataVersion,
  ) => PatternVaultEntry[];
  parsePatternHistory: (
    value: unknown,
    version: AppDataVersion,
    knownShiftIds: ReadonlySet<string>,
  ) => PatternHistoryEntry[];
  parseAppliedPatternSource: (
    value: unknown,
    version: AppDataVersion,
  ) => AppliedPatternSource;
  parseAppliedPatternId: (
    value: unknown,
    version: AppDataVersion,
  ) => string | null;
};

function isSupportedVersion(version: unknown): version is AppDataVersion {
  return Number.isInteger(version) &&
    (version as number) >= 1 &&
    (version as number) <= APP_DATA_VERSION;
}

/**
 * Builds the canonical v21 schema boundary from small field parsers. Migration
 * order and persistence flags live here so the public service remains a facade.
 */
export function createAppDataSchemaValidator(
  parsers: AppDataSchemaParserDependencies,
) {
  return (
    value: unknown,
    options: AppDataValidationOptions = {},
  ): ParsedAppData => {
    const source = record(value, '근무표 데이터');
    if (!isSupportedVersion(source.version)) {
      throw new AppDataValidationError(
        '지원하지 않는 근무표 데이터 버전입니다.',
      );
    }

    const sourceVersion = source.version;
    const legacyV1 = sourceVersion === 1;
    const needsMigration = sourceVersion !== APP_DATA_VERSION;
    const requiresShiftTypeMigration = sourceVersion <= 4;
    const repairState: AppDataRepairState = {
      oversizedAlarmMinutes: false,
      removedCompanyExceptions: false,
    };
    const substituteSchema =
      sourceVersion >= 5
        ? 'split'
        : sourceVersion >= 3
          ? 'legacy'
          : 'optional';
    const parsedShiftTypes = parsers.parseShiftTypes(
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
      !parsedShiftTypes.some(
        (shift) => shift.id === 'evening' && !shift.isOff,
      )
    ) {
      throw new AppDataValidationError('오후 기본 근무 종류가 필요합니다.');
    }
    const sourceShiftIds = new Set(parsedShiftTypes.map((shift) => shift.id));
    const parsedPatternResult = parsers.parsePattern(
      source.pattern,
      sourceShiftIds,
    );
    const parsedPattern = parsedPatternResult.pattern;
    const parsedOverrides = parsers.parseOverrides(
      source.overrides,
      sourceShiftIds,
      legacyV1,
    );
    const parsedTimeOverrides =
      sourceVersion < 6
        ? {}
        : parsers.parseTimeOverrides(source.timeOverrides, sourceShiftIds);
    const dayExceptions =
      sourceVersion < 7
        ? {}
        : parsers.parseDayExceptions(source.dayExceptions, repairState);
    const alarmOverrides =
      sourceVersion < 19
        ? {}
        : parsers.parseAlarmOverrides(source.alarmOverrides);
    const eveningMigration = migrateV20EveningShift(
      migrateV12DefaultAlarmMinutes(
        migrateLegacyDefaultShiftTimes(
          requiresShiftTypeMigration
            ? migrateShiftTypes(
                parsedShiftTypes,
                sourceVersion as 1 | 2 | 3 | 4,
              )
            : parsedShiftTypes,
          sourceVersion,
        ),
        sourceVersion,
      ),
      sourceVersion,
    );
    const {
      shiftTypes: v20ShiftTypes,
      renamedLegacyEveningId,
    } = eveningMigration;
    const shiftTypes = migrateV21SubstituteLabels(
      v20ShiftTypes,
      sourceVersion,
    );
    const normalizedShiftTypeIds =
      sourceVersion <= 2
        ? [...ROTATION_PATTERN_SHIFT_TYPE_IDS]
        : parsedPattern.shiftTypeIds.map((shiftTypeId) =>
            rewriteLegacyEveningReference(
              shiftTypeId,
              renamedLegacyEveningId,
            ),
          );
    const presetId = getWorkPatternPresetId(normalizedShiftTypeIds);
    const v12VaultRotation =
      sourceVersion >= 21 &&
      parsedPattern.kind === 'rotation' &&
      source.appliedPatternSource !== 'legacy' &&
      typeof source.appliedPatternId === 'string' &&
      normalizedShiftTypeIds.length >= 1 &&
      normalizedShiftTypeIds.length <= 42 &&
      normalizedShiftTypeIds.every((id) =>
        V12_PATTERN_SHIFT_TYPE_IDS.has(id),
      );
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
      throw new AppDataValidationError(
        '이전 데이터 버전은 3조 2교대 근무 방식만 지원합니다.',
      );
    }
    if (
      sourceVersion >= 5 &&
      sourceVersion < 20 &&
      presetId !== 'three-team-two-shift' &&
      presetId !== 'weekday' &&
      !migratedLegacyEveningPattern
    ) {
      throw new AppDataValidationError(
        '지원하는 근무 방식은 3조 2교대 또는 주간 고정입니다.',
      );
    }
    if (
      sourceVersion >= 20 &&
      (presetId === 'custom'
        ? !isValidCustomPatternSequence(normalizedShiftTypeIds) &&
          !isValidLegacyEveningCompatibilityPattern(normalizedShiftTypeIds) &&
          !v12VaultRotation
        : !normalizedShiftTypeIds.every(isBaseWorkShiftId))
    ) {
      throw new AppDataValidationError(
        '기타 근무 순서는 1~42일이며 주간·오후·야간·휴무만 사용할 수 있습니다.',
      );
    }
    const patternKind =
      parsedPattern.kind ?? getWorkPatternKind(normalizedShiftTypeIds);
    const pattern: RotationPattern = {
      ...parsedPattern,
      name:
        patternKind === 'rotation' && presetId === 'weekday'
          ? parsedPattern.name
          : getWorkPatternDisplayName(
              normalizedShiftTypeIds,
              parsedPattern.name,
            ),
      shiftTypeIds: normalizedShiftTypeIds,
    };
    const substituteOverrideTargetId =
      legacySubstituteTargetId(parsedShiftTypes);
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
    const parsedSettings = parsers.parseSettings(
      source.settings,
      sourceVersion,
    );
    const normalizedLegacyTheme = parsedSettings.themeMode !== 'dark';
    const data: AppData = {
      version: APP_DATA_VERSION,
      shiftTypes: normalizedShiftTypes,
      pattern,
      overrides,
      timeOverrides,
      dayExceptions,
      alarmOverrides,
      notes: parsers.parseNotes(source.notes, legacyV1),
      scheduleChangeHistory: [],
      payrollSettings: parsers.parsePayrollSettings(
        source.payrollSettings,
        sourceVersion,
      ),
      patternVault: parsers.parsePatternVault(
        source.patternVault,
        sourceVersion,
      ),
      patternHistory: parsers.parsePatternHistory(
        source.patternHistory,
        sourceVersion,
        new Set(normalizedShiftTypes.map((shift) => shift.id)),
      ),
      appliedPatternSource: parsers.parseAppliedPatternSource(
        source.appliedPatternSource,
        sourceVersion,
      ),
      appliedPatternId: parsers.parseAppliedPatternId(
        source.appliedPatternId,
        sourceVersion,
      ),
      settings: {
        ...parsedSettings,
        themeMode: 'dark',
      },
    };

    if (
      (data.appliedPatternSource === 'legacy' &&
        data.appliedPatternId !== null) ||
      (data.appliedPatternSource !== 'legacy' &&
        data.appliedPatternId === null)
    ) {
      throw new AppDataValidationError(
        '적용한 패턴 출처와 ID가 맞지 않습니다.',
      );
    }
    if (data.appliedPatternId !== null) {
      const appliedEntry = data.patternVault.find(
        (entry) => entry.id === data.appliedPatternId,
      );
      if (!appliedEntry || appliedEntry.source !== data.appliedPatternSource) {
        throw new AppDataValidationError(
          '적용한 패턴이 보관소에 없거나 출처가 다릅니다.',
        );
      }
    }
    const patternVaultById = new Map(
      data.patternVault.map((entry) => [entry.id, entry] as const),
    );
    for (const history of data.patternHistory) {
      const nextEntry = patternVaultById.get(history.patternId);
      if (!nextEntry || nextEntry.source !== history.source) {
        throw new AppDataValidationError(
          '패턴 적용 이력이 보관소의 적용 패턴과 맞지 않습니다.',
        );
      }
      if (history.previousPatternId !== null) {
        const previousEntry = patternVaultById.get(history.previousPatternId);
        if (
          !previousEntry ||
          previousEntry.source !== history.previousSource
        ) {
          throw new AppDataValidationError(
            '패턴 적용 이력이 이전 보관 패턴과 맞지 않습니다.',
          );
        }
      }
    }

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
      !Object.prototype.hasOwnProperty.call(
        source,
        'scheduleChangeHistory',
      ) ||
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
  };
}
