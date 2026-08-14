import type { RotationPattern, ShiftType } from '../../models/app-data';
import type {
  SetupStep,
  SetupWorkTimeField,
} from '../../services/setup-draft-service';
import type { ScheduleSafetyResult } from '../../services/schedule-safety-service';
import { addDays, isValidDateKey } from '../../utils/date';
import {
  calculateShiftDuration,
  parseTimeInput,
  type ShiftDuration,
} from '../../utils/shift-time';
import {
  createWorkPatternFromReference,
  getEffectiveWorkPatternPresetId,
  getWeekdayPatternPosition,
  getWorkPatternPreset,
  type BaseWorkShiftId,
  type WorkPatternKind,
  type WorkPatternPresetId,
} from '../../utils/work-pattern';

export type SetupScreenStep = 1 | 2 | 3;

export type SetupSequenceOption = {
  detail: string;
  label: string;
  shortName: string;
  shiftTypeId: BaseWorkShiftId;
};

const SHIFT_LABELS: Record<BaseWorkShiftId, string> = {
  day: '주간',
  evening: '오후',
  night: '야간',
  off: '휴무',
};

export const ROTATION_SETUP_OPTIONS = createSetupSequenceOptions(
  getWorkPatternPreset('three-team-two-shift').shiftTypeIds,
);

export type SetupValidationInput = {
  presetId?: WorkPatternPresetId | null;
  sequence?: readonly BaseWorkShiftId[];
  /** v2 호출 호환용. */
  patternKind?: WorkPatternKind | null;
  position: number | null;
  referenceDate: string;
  dayStart: string;
  dayEnd: string;
  eveningStart?: string;
  eveningEnd?: string;
  nightStart: string;
  nightEnd: string;
};

export type SetupShiftValidation = {
  duration: ShiftDuration | null;
  endMinutes: number | null;
  startMinutes: number | null;
};

export type SetupValidation = {
  activePosition: number | null;
  canComplete: boolean;
  effectivePresetId: WorkPatternPresetId | null;
  normalizedToWeekday: boolean;
  activeShiftIds: Exclude<BaseWorkShiftId, 'off'>[];
  shifts: Record<Exclude<BaseWorkShiftId, 'off'>, SetupShiftValidation>;
  dayDuration: ShiftDuration | null;
  dayEndMinutes: number | null;
  dayStartMinutes: number | null;
  eveningDuration: ShiftDuration | null;
  eveningEndMinutes: number | null;
  eveningStartMinutes: number | null;
  nightDuration: ShiftDuration | null;
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

export type SetupSuggestedWorkTimes = Partial<
  Record<Exclude<BaseWorkShiftId, 'off'>, { start: string; end: string }>
>;

export type SetupWorkTimeValues = Record<SetupWorkTimeField, string>;

export function createSetupSequenceSignature(
  sequence: readonly BaseWorkShiftId[],
): string {
  return `sequence:v1:${sequence.join(',')}`;
}

export function createSetupWorkTimeSignature({
  sequence,
  values,
}: {
  sequence: readonly BaseWorkShiftId[];
  values: SetupWorkTimeValues;
}): string {
  const activeShiftIds = [...new Set(sequence)].filter(
    (id): id is Exclude<BaseWorkShiftId, 'off'> => id !== 'off',
  );
  return `times:v1:${activeShiftIds
    .map((id) => `${id}:${values[`${id}Start`]}-${values[`${id}End`]}`)
    .join('|')}`;
}

/** 사용자가 고친 필드는 보존하고 아직 손대지 않은 필드에만 대표 시간을 채워요. */
export function applySetupPresetSuggestions({
  editedFields,
  suggestedTimes,
  values,
}: {
  editedFields: readonly SetupWorkTimeField[];
  suggestedTimes: SetupSuggestedWorkTimes | null;
  values: SetupWorkTimeValues;
}): SetupWorkTimeValues {
  if (!suggestedTimes) return values;
  const edited = new Set(editedFields);
  const next = { ...values };
  for (const id of ['day', 'evening', 'night'] as const) {
    const suggestion = suggestedTimes[id];
    if (!suggestion) continue;
    const startField = `${id}Start` as SetupWorkTimeField;
    const endField = `${id}End` as SetupWorkTimeField;
    if (!edited.has(startField)) next[startField] = suggestion.start;
    if (!edited.has(endField)) next[endField] = suggestion.end;
  }
  return next;
}

/**
 * 회사별 시간이 크게 다르므로 프리셋의 첫 선택 때만 보여줄 대표 예시예요.
 * 호출 화면은 복원한 초안이나 사용자가 편집한 값을 이 제안으로 덮어쓰면 안 됩니다.
 */
export function getSuggestedWorkTimesForPreset(
  presetId: WorkPatternPresetId,
): SetupSuggestedWorkTimes | null {
  if (presetId === 'weekday') {
    return { day: { start: '07:00', end: '16:00' } };
  }
  if (
    presetId === 'two-team-two-shift' ||
    presetId === 'three-team-two-shift' ||
    presetId === 'four-team-two-shift'
  ) {
    return {
      day: { start: '07:00', end: '19:00' },
      night: { start: '19:00', end: '07:00' },
    };
  }
  if (presetId === 'three-team-three-shift' || presetId === 'four-team-three-shift') {
    return {
      day: { start: '07:00', end: '15:00' },
      evening: { start: '15:00', end: '23:00' },
      night: { start: '23:00', end: '07:00' },
    };
  }
  return null;
}

export function shouldApplySetupPresetSuggestion({
  resumedDraft,
  workTimesEdited,
}: {
  resumedDraft: boolean;
  workTimesEdited: boolean;
}): boolean {
  return !resumedDraft && !workTimesEdited;
}

export function createSetupSequenceOptions(
  sequence: readonly BaseWorkShiftId[],
): SetupSequenceOption[] {
  const totals = new Map<BaseWorkShiftId, number>();
  const seen = new Map<BaseWorkShiftId, number>();
  for (const id of sequence) totals.set(id, (totals.get(id) ?? 0) + 1);
  return sequence.map((shiftTypeId) => {
    const occurrence = (seen.get(shiftTypeId) ?? 0) + 1;
    seen.set(shiftTypeId, occurrence);
    const numbered = (totals.get(shiftTypeId) ?? 0) > 1;
    return {
      shiftTypeId,
      detail: numbered ? `${occurrence}일차` : '근무일',
      label: numbered
        ? `${SHIFT_LABELS[shiftTypeId]} ${occurrence}일차`
        : SHIFT_LABELS[shiftTypeId],
      shortName: numbered
        ? `${SHIFT_LABELS[shiftTypeId].slice(0, 1)}${occurrence}`
        : SHIFT_LABELS[shiftTypeId].slice(0, 1),
    };
  });
}

function resolvePresetAndSequence(input: Pick<SetupValidationInput, 'patternKind' | 'presetId' | 'sequence'>) {
  const presetId =
    input.presetId ??
    (input.patternKind === 'weekday'
      ? 'weekday'
      : input.patternKind === 'rotation'
        ? 'three-team-two-shift'
        : null);
  const sequence =
    input.sequence ??
    (presetId ? getWorkPatternPreset(presetId).shiftTypeIds : []);
  return {
    presetId,
    effectivePresetId: getEffectiveWorkPatternPresetId(presetId, sequence),
    sequence,
  };
}

/** 이전 2단계 초안과 새 3단계 초안을 모두 안전한 현재 단계에 맞춰요. */
export function normalizeSetupScreenStep(step: SetupStep): SetupScreenStep {
  return step;
}

function validateShiftTime(start: string, end: string): SetupShiftValidation {
  const startMinutes = parseTimeInput(start);
  const endMinutes = parseTimeInput(end);
  return {
    startMinutes,
    endMinutes,
    duration:
      startMinutes === null || endMinutes === null
        ? null
        : calculateShiftDuration(startMinutes, endMinutes),
  };
}

export function validateSetupInput(input: SetupValidationInput): SetupValidation {
  const { effectivePresetId, presetId, sequence } = resolvePresetAndSequence(input);
  const day = validateShiftTime(input.dayStart, input.dayEnd);
  const evening = validateShiftTime(input.eveningStart ?? '', input.eveningEnd ?? '');
  const night = validateShiftTime(input.nightStart, input.nightEnd);
  const shifts = { day, evening, night };
  const referenceDateValid = isValidDateKey(input.referenceDate);
  const activeShiftIds = [...new Set(sequence)]
    .filter(
      (id): id is Exclude<BaseWorkShiftId, 'off'> =>
        id === 'day' || id === 'evening' || id === 'night',
    );
  const activePosition =
    effectivePresetId === null
      ? null
      : effectivePresetId === 'weekday'
        ? referenceDateValid
          ? getWeekdayPatternPosition(input.referenceDate)
          : null
        : input.position;
  const canComplete =
    effectivePresetId !== null &&
    sequence.length >= 1 &&
    sequence.length <= 42 &&
    activeShiftIds.length > 0 &&
    activePosition !== null &&
    activePosition >= 0 &&
    activePosition < sequence.length &&
    referenceDateValid &&
    activeShiftIds.every((id) => shifts[id].duration !== null);

  return {
    activePosition,
    activeShiftIds,
    canComplete,
    effectivePresetId,
    normalizedToWeekday:
      presetId !== null && presetId !== 'weekday' && effectivePresetId === 'weekday',
    shifts,
    dayDuration: day.duration,
    dayEndMinutes: day.endMinutes,
    dayStartMinutes: day.startMinutes,
    eveningDuration: evening.duration,
    eveningEndMinutes: evening.endMinutes,
    eveningStartMinutes: evening.startMinutes,
    nightDuration: night.duration,
    nightEndMinutes: night.endMinutes,
    nightStartMinutes: night.startMinutes,
    referenceDateValid,
  };
}

export function buildSetupPreview({
  activePosition,
  patternKind,
  presetId: suppliedPresetId,
  sequence: suppliedSequence,
  referenceDate,
}: {
  activePosition: number | null;
  patternKind?: WorkPatternKind | null;
  presetId?: WorkPatternPresetId | null;
  sequence?: readonly BaseWorkShiftId[];
  referenceDate: string;
}): SetupPreviewItem[] {
  const { effectivePresetId, sequence } = resolvePresetAndSequence({
    patternKind,
    presetId: suppliedPresetId,
    sequence: suppliedSequence,
  });
  if (effectivePresetId === null || !isValidDateKey(referenceDate)) {
    return [];
  }

  const previewPosition =
    effectivePresetId === 'weekday'
      ? getWeekdayPatternPosition(referenceDate)
      : activePosition;
  if (
    previewPosition === null ||
    previewPosition < 0 ||
    previewPosition >= sequence.length
  ) return [];

  const options = createSetupSequenceOptions(sequence);
  return Array.from({ length: sequence.length }, (_, offset) => {
    const sequenceIndex = (previewPosition + offset) % sequence.length;
    return {
      dateKey: addDays(referenceDate, offset),
      shiftTypeId: sequence[sequenceIndex],
      shortName: options[sequenceIndex]?.shortName ?? sequence[sequenceIndex],
    };
  });
}

type BuildInitialSetupPayloadInput = {
  activePosition: number;
  alarmsWanted: boolean;
  presetId?: WorkPatternPresetId;
  sequence?: readonly BaseWorkShiftId[];
  patternKind?: WorkPatternKind;
  referenceDate: string;
  dayDuration: ShiftDuration | null;
  dayEndMinutes: number | null;
  dayStartMinutes: number | null;
  eveningDuration?: ShiftDuration | null;
  eveningEndMinutes?: number | null;
  eveningStartMinutes?: number | null;
  nightDuration: ShiftDuration | null;
  nightEndMinutes: number | null;
  nightStartMinutes: number | null;
  safetyResult?: ScheduleSafetyResult;
};

export function buildInitialSetupPayload(
  input: BuildInitialSetupPayloadInput,
): InitialSetupPayload {
  if (input.safetyResult && !input.safetyResult.canSave) {
    throw new RangeError('서로 겹치는 근무 시간을 먼저 수정해 주세요.');
  }
  const presetId =
    input.presetId ??
    (input.patternKind === 'weekday' ? 'weekday' : 'three-team-two-shift');
  const sequence = input.sequence ?? getWorkPatternPreset(presetId).shiftTypeIds;
  const effectivePresetId = getEffectiveWorkPatternPresetId(presetId, sequence)!;
  const activeShiftIds = new Set(sequence);
  const shiftTypePatches: Record<string, Partial<ShiftType>> = {
    ...(activeShiftIds.has('day') &&
    input.dayDuration &&
    input.dayStartMinutes !== null &&
    input.dayEndMinutes !== null
      ? {
          day: {
            startMinutes: input.dayStartMinutes,
            endMinutes: input.dayEndMinutes,
            endsNextDay: input.dayDuration.endsNextDay,
          },
        }
      : {}),
    ...(activeShiftIds.has('evening') &&
    input.eveningDuration &&
    input.eveningStartMinutes !== null &&
    input.eveningStartMinutes !== undefined &&
    input.eveningEndMinutes !== null &&
    input.eveningEndMinutes !== undefined
      ? {
          evening: {
            startMinutes: input.eveningStartMinutes,
            endMinutes: input.eveningEndMinutes,
            endsNextDay: input.eveningDuration.endsNextDay,
          },
        }
      : {}),
    ...(activeShiftIds.has('night') &&
    input.nightDuration &&
    input.nightStartMinutes !== null &&
    input.nightEndMinutes !== null
      ? {
          night: {
            startMinutes: input.nightStartMinutes,
            endMinutes: input.nightEndMinutes,
            endsNextDay: input.nightDuration.endsNextDay,
          },
        }
      : {}),
  };

  return {
    pattern: createWorkPatternFromReference({
      presetId: effectivePresetId,
      position: input.activePosition,
      referenceDate: input.referenceDate,
      shiftTypeIds: sequence,
    }),
    notificationsEnabled:
      input.alarmsWanted && (input.safetyResult?.canEnableAlarms ?? true),
    shiftTypePatches,
  };
}
