import type { RotationPattern } from '@/models/app-data';

import {
  addDays,
  differenceInCalendarDays,
  isValidDateKey,
  parseDateKey,
} from './date';

export type WorkPatternKind = 'rotation' | 'weekday';

export const ROTATION_PATTERN_NAME = '3조 2교대 (주주야야휴휴)' as const;
export const WEEKDAY_PATTERN_NAME = '주간 고정' as const;

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

function matchesSequence(source: readonly string[], expected: readonly string[]): boolean {
  return source.length === expected.length && source.every((id, index) => id === expected[index]);
}

export function getWorkPatternKind(shiftTypeIds: readonly string[]): WorkPatternKind | null {
  if (matchesSequence(shiftTypeIds, ROTATION_PATTERN_SHIFT_TYPE_IDS)) return 'rotation';
  if (matchesSequence(shiftTypeIds, WEEKDAY_PATTERN_SHIFT_TYPE_IDS)) return 'weekday';
  return null;
}

export function getWorkPatternName(kind: WorkPatternKind): string {
  return kind === 'weekday' ? WEEKDAY_PATTERN_NAME : ROTATION_PATTERN_NAME;
}

/** 월요일 0부터 일요일 6까지 반환합니다. */
export function getWeekdayPatternPosition(dateKey: string): number {
  return (parseDateKey(dateKey).getDay() + 6) % 7;
}

/** 기준 날짜의 순번을 실제로 확인할 날짜의 순번으로 옮겨요. */
export function getRotationPatternPositionForDate({
  date,
  referenceDate,
  referencePosition,
}: {
  date: string;
  referenceDate: string;
  referencePosition: number;
}): number {
  if (!isValidDateKey(date) || !isValidDateKey(referenceDate)) {
    throw new RangeError('근무 순번을 계산할 날짜가 올바르지 않아요.');
  }
  if (
    !Number.isInteger(referencePosition) ||
    referencePosition < 0 ||
    referencePosition >= ROTATION_PATTERN_SHIFT_TYPE_IDS.length
  ) {
    throw new RangeError('기준 날짜의 실제 근무를 선택해 주세요.');
  }

  const offset = differenceInCalendarDays(date, referenceDate);
  const sequenceLength = ROTATION_PATTERN_SHIFT_TYPE_IDS.length;
  return (
    ((referencePosition + offset) % sequenceLength + sequenceLength) %
    sequenceLength
  );
}

/** 기준 날짜의 실제 근무 위치를 바탕으로 반복 근무표의 시작점을 계산해요. */
export function createWorkPatternFromReference({
  kind,
  position,
  referenceDate,
  scheduleStartDate = referenceDate,
}: {
  kind: WorkPatternKind;
  position?: number | null;
  referenceDate: string;
  scheduleStartDate?: string;
}): RotationPattern {
  if (!isValidDateKey(referenceDate)) {
    throw new RangeError('기준 날짜가 올바르지 않아요.');
  }
  if (!isValidDateKey(scheduleStartDate)) {
    throw new RangeError('첫 근무일이 올바르지 않아요.');
  }

  const shiftTypeIds =
    kind === 'weekday'
      ? WEEKDAY_PATTERN_SHIFT_TYPE_IDS
      : ROTATION_PATTERN_SHIFT_TYPE_IDS;
  const referencePosition =
    kind === 'weekday' ? getWeekdayPatternPosition(referenceDate) : position;
  if (
    !Number.isInteger(referencePosition) ||
    referencePosition === null ||
    referencePosition === undefined ||
    referencePosition < 0 ||
    referencePosition >= shiftTypeIds.length
  ) {
    throw new RangeError('기준 날짜의 실제 근무를 선택해 주세요.');
  }

  return {
    name: getWorkPatternName(kind),
    anchorDate: addDays(referenceDate, -referencePosition),
    scheduleStartDate,
    shiftTypeIds: [...shiftTypeIds],
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
