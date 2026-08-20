import { createDefaultWorkShift } from '../../application/app-data-defaults';
import {
  DAY_SHIFT_END_MINUTES,
  LEGACY_DAY_SHIFT_END_MINUTES,
  LEGACY_DAY_SHIFT_START_MINUTES,
  LEGACY_NIGHT_SHIFT_END_MINUTES,
  LEGACY_NIGHT_SHIFT_START_MINUTES,
  NIGHT_SHIFT_END_MINUTES,
} from '../../constants/shift-schedule';
import {
  DEFAULT_ALARM_MINUTES_BEFORE,
  type ShiftType,
} from '../../models/app-data';
import { isBaseWorkShiftId } from '../../utils/work-pattern';
import { AppDataValidationError } from './validation';

export type PreviousAppDataVersion =
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
  | 19
  | 20;

export type AppDataVersion = PreviousAppDataVersion | 21;

export const MAX_LEGACY_SHIFT_TYPES = 100;
// v1~v4 자료가 허용하던 100개 근무에 두 대체근무를 손실 없이 더할 수 있어야 합니다.
export const MAX_PRE_V20_SHIFT_TYPES = MAX_LEGACY_SHIFT_TYPES + 2;
// v20은 유효한 이전 자료의 모든 근무에 canonical 오후 근무 하나를 더할 수 있어야 합니다.
export const MAX_SHIFT_TYPES = MAX_PRE_V20_SHIFT_TYPES + 1;

const V12_DEFAULT_ALARM_MINUTES_BEFORE = 120;
const DEFAULT_ALARM_SHIFT_IDS = [
  'day',
  'night',
  'substitute-day',
  'substitute-night',
] as const;

type SubstituteShiftId = 'substitute-day' | 'substitute-night';

export function legacySubstituteTargetId(
  shiftTypes: readonly ShiftType[],
): SubstituteShiftId {
  const substitute = shiftTypes.find((shift) => shift.id === 'substitute');
  if (!substitute) return 'substitute-day';

  const night = shiftTypes.find((shift) => shift.id === 'night');
  const startsWithNight =
    substitute.startMinutes !== null &&
    (substitute.startMinutes === LEGACY_NIGHT_SHIFT_START_MINUTES ||
      (night !== undefined &&
        night.startMinutes !== null &&
        substitute.startMinutes === night.startMinutes));
  return substitute.endsNextDay || startsWithNight
    ? 'substitute-night'
    : 'substitute-day';
}

export function migrateShiftTypes(
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
    if (
      sourceVersion <= 3 &&
      shift.id === 'day' &&
      shift.alarmMinutesBefore === 90
    ) {
      return {
        ...shift,
        alarmMinutesBefore: dayDefault.alarmMinutesBefore,
      };
    }
    return shift;
  });

  const substitute = migrated.find((shift) => shift.id === 'substitute');
  if (substitute?.isOff) {
    throw new AppDataValidationError(
      '대체근무에는 근무 시간과 알람 설정이 필요합니다.',
    );
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
    throw new AppDataValidationError('대체근무를 추가할 공간이 부족합니다.');
  }
  if (substitute) {
    return migrated.flatMap((shift) =>
      shift.id === 'substitute'
        ? [substituteDay, substituteNight]
        : [shift],
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

export type V20EveningShiftMigration = {
  shiftTypes: ShiftType[];
  renamedLegacyEveningId: string | null;
};

const LEGACY_EVENING_SHIFT_ID = 'legacy-evening';

function isLegacyEveningCompatibilityId(id: string): boolean {
  return /^legacy-evening(?:-\d+)?$/.test(id);
}

function getAvailableLegacyEveningShiftId(
  shiftTypes: readonly ShiftType[],
): string {
  const ids = new Set(shiftTypes.map((shift) => shift.id));
  if (!ids.has(LEGACY_EVENING_SHIFT_ID)) return LEGACY_EVENING_SHIFT_ID;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${LEGACY_EVENING_SHIFT_ID}-${suffix}`;
    if (!ids.has(candidate)) return candidate;
  }
}

/** v20 adds the canonical evening shift without changing the active pattern. */
export function migrateV20EveningShift(
  shiftTypes: ShiftType[],
  sourceVersion: AppDataVersion,
): V20EveningShiftMigration {
  if (sourceVersion >= 20) {
    return { shiftTypes, renamedLegacyEveningId: null };
  }
  if (shiftTypes.length >= MAX_SHIFT_TYPES) {
    throw new AppDataValidationError('오후 근무를 추가할 공간이 부족합니다.');
  }

  const hasLegacyEvening = shiftTypes.some((shift) => shift.id === 'evening');
  const renamedLegacyEveningId = hasLegacyEvening
    ? getAvailableLegacyEveningShiftId(shiftTypes)
    : null;
  const migratedShiftTypes = renamedLegacyEveningId
    ? shiftTypes.map((shift) =>
        shift.id === 'evening'
          ? { ...shift, id: renamedLegacyEveningId }
          : shift,
      )
    : shiftTypes;
  const evening = createDefaultWorkShift('evening');
  const nightIndex = migratedShiftTypes.findIndex(
    (shift) => shift.id === 'night',
  );
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

const V20_DEFAULT_SUBSTITUTE_DAY_NAME = '주간 대체근무';
const V20_DEFAULT_SUBSTITUTE_NIGHT_NAME = '야간 대체근무';

export function migrateV21SubstituteLabels(
  shiftTypes: ShiftType[],
  sourceVersion: AppDataVersion,
): ShiftType[] {
  if (sourceVersion >= 21) return shiftTypes;
  return shiftTypes.map((shift) => {
    if (
      shift.id === 'substitute-day' &&
      shift.name === V20_DEFAULT_SUBSTITUTE_DAY_NAME &&
      shift.shortName === '대주'
    ) {
      return { ...shift, shortName: '주대' };
    }
    if (
      shift.id === 'substitute-night' &&
      shift.name === V20_DEFAULT_SUBSTITUTE_NIGHT_NAME &&
      shift.shortName === '대야'
    ) {
      return { ...shift, shortName: '야대' };
    }
    return shift;
  });
}

export function rewriteLegacyEveningReference(
  shiftTypeId: string,
  renamedLegacyEveningId: string | null,
): string {
  return shiftTypeId === 'evening' && renamedLegacyEveningId
    ? renamedLegacyEveningId
    : shiftTypeId;
}

export function isValidLegacyEveningCompatibilityPattern(
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

export function migrateLegacyDefaultShiftTimes(
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

export function migrateV12DefaultAlarmMinutes(
  shiftTypes: ShiftType[],
  sourceVersion: AppDataVersion,
): ShiftType[] {
  if (sourceVersion !== 12) return shiftTypes;

  const defaultAlarmShifts = DEFAULT_ALARM_SHIFT_IDS.map((id) =>
    shiftTypes.find((shift) => shift.id === id),
  );
  const usesUntouchedV12Defaults = defaultAlarmShifts.every(
    (shift) =>
      shift?.alarmMinutesBefore === V12_DEFAULT_ALARM_MINUTES_BEFORE,
  );
  if (!usesUntouchedV12Defaults) return shiftTypes;

  const defaultAlarmShiftIds = new Set<string>(DEFAULT_ALARM_SHIFT_IDS);
  return shiftTypes.map((shift) =>
    defaultAlarmShiftIds.has(shift.id)
      ? { ...shift, alarmMinutesBefore: DEFAULT_ALARM_MINUTES_BEFORE }
      : shift,
  );
}
