import type { RotationPattern, ShiftType } from '../../models/app-data';
import type { SetupStep } from '../../services/setup-draft-service';
import { addDays, isValidDateKey } from '../../utils/date';
import {
  calculateShiftDuration,
  parseTimeInput,
} from '../../utils/shift-time';
import {
  createWorkPatternFromReference,
  getWeekdayPatternPosition,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
  WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
  type WorkPatternKind,
} from '../../utils/work-pattern';

export type SetupScreenStep = 1 | 2;

export const ROTATION_SETUP_OPTIONS = [
  { detail: '첫째 날', label: '주간 첫째 날', shortName: '주1', shiftTypeId: 'day' },
  { detail: '둘째 날', label: '주간 둘째 날', shortName: '주2', shiftTypeId: 'day' },
  { detail: '첫째 날', label: '야간 첫째 날', shortName: '야1', shiftTypeId: 'night' },
  { detail: '둘째 날', label: '야간 둘째 날', shortName: '야2', shiftTypeId: 'night' },
  { detail: '첫째 날', label: '휴무 첫째 날', shortName: '휴1', shiftTypeId: 'off' },
  { detail: '둘째 날', label: '휴무 둘째 날', shortName: '휴2', shiftTypeId: 'off' },
] as const;

export type SetupValidationInput = {
  patternKind: WorkPatternKind | null;
  position: number | null;
  referenceDate: string;
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
};

export type SetupValidation = {
  activePosition: number | null;
  canComplete: boolean;
  dayDuration: ReturnType<typeof calculateShiftDuration>;
  dayEndMinutes: number | null;
  dayStartMinutes: number | null;
  nightDuration: ReturnType<typeof calculateShiftDuration>;
  nightEndMinutes: number | null;
  nightStartMinutes: number | null;
  referenceDateValid: boolean;
};

export type SetupPreviewItem = {
  dateKey: string;
  shiftTypeId: string;
  shortName: string;
};

export type InitialSetupPayload = {
  pattern: RotationPattern;
  notificationsEnabled: boolean;
  shiftTypePatches: Record<string, Partial<ShiftType>>;
};

/** 기존 3단계 초안도 새 2단계 화면에서 이어서 입력할 수 있게 해요. */
export function normalizeSetupScreenStep(step: SetupStep): SetupScreenStep {
  return step === 1 ? 1 : 2;
}

export function validateSetupInput(input: SetupValidationInput): SetupValidation {
  const dayStartMinutes = parseTimeInput(input.dayStart);
  const dayEndMinutes = parseTimeInput(input.dayEnd);
  const nightStartMinutes = parseTimeInput(input.nightStart);
  const nightEndMinutes = parseTimeInput(input.nightEnd);
  const dayDuration =
    dayStartMinutes === null || dayEndMinutes === null
      ? null
      : calculateShiftDuration(dayStartMinutes, dayEndMinutes);
  const nightDuration =
    nightStartMinutes === null || nightEndMinutes === null
      ? null
      : calculateShiftDuration(nightStartMinutes, nightEndMinutes);
  const referenceDateValid = isValidDateKey(input.referenceDate);
  const activePosition =
    input.patternKind === null
      ? null
      : input.patternKind === 'weekday'
        ? referenceDateValid
          ? getWeekdayPatternPosition(input.referenceDate)
          : null
        : input.position;
  const canComplete =
    input.patternKind !== null &&
    activePosition !== null &&
    referenceDateValid &&
    dayDuration !== null &&
    (input.patternKind === 'weekday' || nightDuration !== null);

  return {
    activePosition,
    canComplete,
    dayDuration,
    dayEndMinutes,
    dayStartMinutes,
    nightDuration,
    nightEndMinutes,
    nightStartMinutes,
    referenceDateValid,
  };
}

export function buildSetupPreview({
  activePosition,
  patternKind,
  referenceDate,
}: {
  activePosition: number | null;
  patternKind: WorkPatternKind | null;
  referenceDate: string;
}): SetupPreviewItem[] {
  if (
    patternKind === null ||
    activePosition === null ||
    !isValidDateKey(referenceDate)
  ) {
    return [];
  }

  const sequence =
    patternKind === 'weekday'
      ? WEEKDAY_PATTERN_SHIFT_TYPE_IDS
      : ROTATION_PATTERN_SHIFT_TYPE_IDS;

  return Array.from({ length: sequence.length }, (_, offset) => {
    const sequenceIndex = (activePosition + offset) % sequence.length;
    const shiftTypeId = sequence[sequenceIndex];
    return {
      dateKey: addDays(referenceDate, offset),
      shiftTypeId,
      shortName:
        patternKind === 'weekday'
          ? shiftTypeId === 'day'
            ? '주간'
            : '휴무'
          : (ROTATION_SETUP_OPTIONS[sequenceIndex]?.shortName ?? shiftTypeId),
    };
  });
}

export function buildInitialSetupPayload({
  activePosition,
  alarmsWanted,
  dayDuration,
  dayEndMinutes,
  dayStartMinutes,
  nightDuration,
  nightEndMinutes,
  nightStartMinutes,
  patternKind,
  referenceDate,
}: {
  activePosition: number;
  alarmsWanted: boolean;
  dayDuration: NonNullable<ReturnType<typeof calculateShiftDuration>>;
  dayEndMinutes: number;
  dayStartMinutes: number;
  nightDuration: ReturnType<typeof calculateShiftDuration>;
  nightEndMinutes: number | null;
  nightStartMinutes: number | null;
  patternKind: WorkPatternKind;
  referenceDate: string;
}): InitialSetupPayload {
  return {
    pattern: createWorkPatternFromReference({
      kind: patternKind,
      position: activePosition,
      referenceDate,
    }),
    notificationsEnabled: alarmsWanted,
    shiftTypePatches: {
      day: {
        startMinutes: dayStartMinutes,
        endMinutes: dayEndMinutes,
        endsNextDay: dayDuration.endsNextDay,
      },
      ...(patternKind === 'rotation' &&
      nightDuration &&
      nightStartMinutes !== null &&
      nightEndMinutes !== null
        ? {
            night: {
              startMinutes: nightStartMinutes,
              endMinutes: nightEndMinutes,
              endsNextDay: nightDuration.endsNextDay,
            },
          }
        : {}),
    },
  };
}
