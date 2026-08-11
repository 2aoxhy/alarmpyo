import type { DayExceptionType } from '../models/app-data';

export const DAY_EXCEPTION_TYPES: readonly DayExceptionType[] = [
  'leave',
  'training',
  'reserve',
];

const LABELS: Record<DayExceptionType, string> = {
  leave: '연차',
  training: '교육',
  reserve: '예비군',
};

export function getDayExceptionLabel(type: DayExceptionType): string {
  return LABELS[type];
}

export function isRestDayException(type: DayExceptionType | undefined): boolean {
  return type === 'leave';
}

export function usesDayAlarmForException(
  type: DayExceptionType | null | undefined,
): type is Extract<DayExceptionType, 'training' | 'reserve'> {
  return type === 'training' || type === 'reserve';
}
