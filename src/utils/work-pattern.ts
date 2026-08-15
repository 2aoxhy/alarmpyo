import type { RotationPattern } from '@/models/app-data';

import {
  addDays,
  differenceInCalendarDays,
  isValidDateKey,
  parseDateKey,
} from './date';

/** 이전 호출자의 분기 계약을 유지합니다. 모든 반복 교대는 rotation으로 분류해요. */
export type WorkPatternKind = 'rotation' | 'weekday';

export type BaseWorkShiftId = 'day' | 'evening' | 'night' | 'off';

export type WorkPatternPresetId =
  | 'weekday'
  | 'two-team-two-shift'
  | 'three-team-two-shift'
  | 'three-team-three-shift'
  | 'four-team-two-shift'
  | 'four-team-three-shift'
  | 'custom';

export type WorkPatternCategoryId =
  | 'weekday'
  | 'two-shift'
  | 'three-shift'
  | 'custom';

export type WorkPatternCategory = {
  description: string;
  id: WorkPatternCategoryId;
  name: string;
  presetIds: readonly WorkPatternPresetId[];
};

export type WorkPatternPreset = {
  id: WorkPatternPresetId;
  name: string;
  shortName: string;
  description: string;
  shiftTypeIds: readonly BaseWorkShiftId[];
};

export const CUSTOM_PATTERN_MIN_DAYS = 1;
export const CUSTOM_PATTERN_MAX_DAYS = 42;

export const ROTATION_PATTERN_NAME = '3조 2교대 (주주야야휴휴)' as const;
export const WEEKDAY_PATTERN_NAME = '주간 고정' as const;
export const CUSTOM_PATTERN_NAME = '기타 교대' as const;

export const ROTATION_PATTERN_SHIFT_TYPE_IDS = [
  'day',
  'day',
  'night',
  'night',
  'off',
  'off',
] as const;

export const WEEKDAY_PATTERN_SHIFT_TYPE_IDS = [
  'day',
  'day',
  'day',
  'day',
  'day',
  'off',
  'off',
] as const;

/**
 * 조/교대 이름만으로 회사의 실제 순서를 단정할 수 없어서 가장 짧은 대표 순서를
 * 제공하고, 첫 설정과 근무 방식 편집 화면에서 순서를 직접 바꿀 수 있게 합니다.
 */
export const WORK_PATTERN_PRESETS: readonly WorkPatternPreset[] = [
  {
    id: 'weekday',
    name: WEEKDAY_PATTERN_NAME,
    shortName: '주간 고정',
    description: '월~금 주간 · 토~일 휴무',
    shiftTypeIds: WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
  },
  {
    id: 'two-team-two-shift',
    name: '2조 2교대 (주야)',
    shortName: '2조 2교대',
    description: '대표 순서 주간 · 야간',
    shiftTypeIds: ['day', 'night'],
  },
  {
    id: 'three-team-two-shift',
    name: ROTATION_PATTERN_NAME,
    shortName: '3조 2교대',
    description: '주간 2일 · 야간 2일 · 휴무 2일',
    shiftTypeIds: ROTATION_PATTERN_SHIFT_TYPE_IDS,
  },
  {
    id: 'three-team-three-shift',
    name: '3조 3교대 (주오야)',
    shortName: '3조 3교대',
    description: '대표 순서 주간 · 오후 · 야간',
    shiftTypeIds: ['day', 'evening', 'night'],
  },
  {
    id: 'four-team-two-shift',
    name: '4조 2교대 (주야휴휴)',
    shortName: '4조 2교대',
    description: '대표 순서 주간 · 야간 · 휴무 2일',
    shiftTypeIds: ['day', 'night', 'off', 'off'],
  },
  {
    id: 'four-team-three-shift',
    name: '4조 3교대 (주오야휴)',
    shortName: '4조 3교대',
    description: '대표 순서 주간 · 오후 · 야간 · 휴무',
    shiftTypeIds: ['day', 'evening', 'night', 'off'],
  },
  {
    id: 'custom',
    name: CUSTOM_PATTERN_NAME,
    shortName: '기타',
    description: '1~42일 회사 순서를 직접 만듭니다',
    shiftTypeIds: ['day', 'night', 'off'],
  },
] as const;

export const WORK_PATTERN_CATEGORIES: readonly WorkPatternCategory[] = [
  {
    id: 'weekday',
    name: '주간 고정',
    description: '평일 주간 근무',
    presetIds: ['weekday'],
  },
  {
    id: 'two-shift',
    name: '2교대',
    description: '주간·야간 교대',
    presetIds: ['two-team-two-shift', 'three-team-two-shift', 'four-team-two-shift'],
  },
  {
    id: 'three-shift',
    name: '3교대',
    description: '주간·오후·야간 교대',
    presetIds: ['three-team-three-shift', 'four-team-three-shift'],
  },
  {
    id: 'custom',
    name: '기타',
    description: '회사 순서를 직접 구성',
    presetIds: ['custom'],
  },
] as const;

const BASE_WORK_SHIFT_IDS = new Set<BaseWorkShiftId>([
  'day',
  'evening',
  'night',
  'off',
]);

function matchesSequence(source: readonly string[], expected: readonly string[]): boolean {
  return source.length === expected.length && source.every((id, index) => id === expected[index]);
}

export function isBaseWorkShiftId(value: string): value is BaseWorkShiftId {
  return BASE_WORK_SHIFT_IDS.has(value as BaseWorkShiftId);
}

export function getWorkPatternPreset(id: WorkPatternPresetId): WorkPatternPreset {
  const preset = WORK_PATTERN_PRESETS.find((item) => item.id === id);
  if (!preset) throw new RangeError('지원하지 않는 근무 방식입니다.');
  return preset;
}

export function getWorkPatternCategoryId(
  presetId: WorkPatternPresetId | null,
): WorkPatternCategoryId | null {
  if (presetId === null) return null;
  return WORK_PATTERN_CATEGORIES.find((category) => category.presetIds.includes(presetId))?.id ?? null;
}

export function getWorkPatternPresetId(
  shiftTypeIds: readonly string[],
): WorkPatternPresetId {
  const known = WORK_PATTERN_PRESETS.find(
    (preset) => preset.id !== 'custom' && matchesSequence(shiftTypeIds, preset.shiftTypeIds),
  );
  return known?.id ?? 'custom';
}

/**
 * 저장 모델에는 별도 mode가 없으므로 주간 고정과 정확히 같은 순서는 언제나
 * 요일 기준으로 계산해야 해요. 사용자가 다른 프리셋에서 같은 순서를 만들었어도
 * 저장 전 명시적으로 주간 고정으로 전환해 화면·백업·재로드 계산을 일치시킵니다.
 */
export function getEffectiveWorkPatternPresetId(
  selectedPresetId: WorkPatternPresetId | null,
  shiftTypeIds: readonly string[],
): WorkPatternPresetId | null {
  if (selectedPresetId === null) return null;
  const detectedPresetId = getWorkPatternPresetId(shiftTypeIds);
  // 프리셋 이름은 실제 저장 순서와 항상 함께 움직여 재로드·공유 표시가 달라지지 않게 해요.
  return detectedPresetId;
}

export function isValidCustomPatternSequence(
  shiftTypeIds: readonly string[],
): shiftTypeIds is readonly BaseWorkShiftId[] {
  return (
    shiftTypeIds.length >= CUSTOM_PATTERN_MIN_DAYS &&
    shiftTypeIds.length <= CUSTOM_PATTERN_MAX_DAYS &&
    shiftTypeIds.every(isBaseWorkShiftId) &&
    shiftTypeIds.some((id) => id !== 'off')
  );
}

export function validateCustomPatternSequence(
  shiftTypeIds: readonly string[],
): BaseWorkShiftId[] {
  if (!isValidCustomPatternSequence(shiftTypeIds)) {
    throw new RangeError(
      `기타 근무 순서는 ${CUSTOM_PATTERN_MIN_DAYS}~${CUSTOM_PATTERN_MAX_DAYS}일이며 근무일이 하나 이상 필요합니다.`,
    );
  }
  return [...shiftTypeIds];
}

export function getWorkPatternKind(shiftTypeIds: readonly string[]): WorkPatternKind | null {
  const presetId = getWorkPatternPresetId(shiftTypeIds);
  if (presetId === 'weekday') return 'weekday';
  return presetId === 'custom' ? null : 'rotation';
}

export function getWorkPatternName(kind: WorkPatternKind): string {
  return kind === 'weekday' ? WEEKDAY_PATTERN_NAME : ROTATION_PATTERN_NAME;
}

export function getWorkPatternDisplayName(
  shiftTypeIds: readonly string[],
  storedName?: string,
): string {
  const presetId = getWorkPatternPresetId(shiftTypeIds);
  return presetId === 'custom'
    ? storedName?.trim() || CUSTOM_PATTERN_NAME
    : getWorkPatternPreset(presetId).name;
}

/** 월요일 0부터 일요일 6까지 반환합니다. */
export function getWeekdayPatternPosition(dateKey: string): number {
  return (parseDateKey(dateKey).getDay() + 6) % 7;
}

export function getPatternPositionForDate({
  date,
  referenceDate,
  referencePosition,
  sequenceLength,
}: {
  date: string;
  referenceDate: string;
  referencePosition: number;
  sequenceLength: number;
}): number {
  if (!isValidDateKey(date) || !isValidDateKey(referenceDate)) {
    throw new RangeError('근무 순번을 계산할 날짜가 올바르지 않습니다.');
  }
  if (
    !Number.isInteger(sequenceLength) ||
    sequenceLength < 1 ||
    !Number.isInteger(referencePosition) ||
    referencePosition < 0 ||
    referencePosition >= sequenceLength
  ) {
    throw new RangeError('기준 날짜의 실제 근무를 선택해야 합니다.');
  }

  const offset = differenceInCalendarDays(date, referenceDate);
  return ((referencePosition + offset) % sequenceLength + sequenceLength) % sequenceLength;
}

/** 기존 3조 2교대 호출자의 6일 순환 계약을 유지합니다. */
export function getRotationPatternPositionForDate({
  date,
  referenceDate,
  referencePosition,
}: {
  date: string;
  referenceDate: string;
  referencePosition: number;
}): number {
  return getPatternPositionForDate({
    date,
    referenceDate,
    referencePosition,
    sequenceLength: ROTATION_PATTERN_SHIFT_TYPE_IDS.length,
  });
}

type CreateWorkPatternInput = {
  position?: number | null;
  referenceDate: string;
  scheduleStartDate?: string;
} & (
  | { kind: WorkPatternKind; presetId?: never; shiftTypeIds?: never; name?: never }
  | {
      kind?: never;
      presetId: WorkPatternPresetId;
      shiftTypeIds?: readonly BaseWorkShiftId[];
      name?: string;
    }
);

/** 기준 날짜의 실제 순번을 바탕으로 반복 근무표의 시작점을 계산해요. */
export function createWorkPatternFromReference(
  input: CreateWorkPatternInput,
): RotationPattern {
  const { position, referenceDate, scheduleStartDate = referenceDate } = input;
  if (!isValidDateKey(referenceDate)) {
    throw new RangeError('기준 날짜가 올바르지 않습니다.');
  }
  if (!isValidDateKey(scheduleStartDate)) {
    throw new RangeError('첫 근무일이 올바르지 않습니다.');
  }

  const legacyKind = 'kind' in input ? input.kind : undefined;
  const presetId: WorkPatternPresetId =
    'presetId' in input && input.presetId
      ? input.presetId
      : legacyKind === 'weekday'
        ? 'weekday'
        : 'three-team-two-shift';
  const preset = getWorkPatternPreset(presetId);
  const suppliedSequence = 'shiftTypeIds' in input ? input.shiftTypeIds : undefined;
  const shiftTypeIds = suppliedSequence
    ? validateCustomPatternSequence(suppliedSequence)
    : [...preset.shiftTypeIds];
  const effectivePresetId = getEffectiveWorkPatternPresetId(presetId, shiftTypeIds)!;
  const effectiveReferenceDate =
    effectivePresetId === 'weekday' ? scheduleStartDate : referenceDate;
  const referencePosition =
    effectivePresetId === 'weekday'
      ? getWeekdayPatternPosition(effectiveReferenceDate)
      : position;
  if (
    !Number.isInteger(referencePosition) ||
    referencePosition === null ||
    referencePosition === undefined ||
    referencePosition < 0 ||
    referencePosition >= shiftTypeIds.length
  ) {
    throw new RangeError('기준 날짜의 실제 근무를 선택해야 합니다.');
  }

  return {
    name:
      effectivePresetId === 'custom'
        ? ('name' in input ? input.name?.trim() : undefined) || CUSTOM_PATTERN_NAME
        : getWorkPatternPreset(effectivePresetId).name,
    anchorDate: addDays(effectiveReferenceDate, -referencePosition),
    scheduleStartDate,
    shiftTypeIds,
  };
}

/** 기준 날짜가 달라지면 이전 날짜에서 확인한 실제 순번을 다시 사용하지 않아요. */
export function getPositionAfterReferenceDateChange({
  currentDate,
  nextDate,
  selectedPosition,
}: {
  currentDate: string;
  nextDate: string;
  selectedPosition: number | null;
}): number | null {
  return currentDate === nextDate ? selectedPosition : null;
}
