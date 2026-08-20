import type { PayrollSettings } from '../models/app-data';
import { toDateKey } from '../utils/date';

export const DEFAULT_PAYROLL_SETTINGS: Readonly<PayrollSettings> = {
  day: 21,
  adjustment: 'previous-business-day',
};

export function assertPayrollSettings(
  settings: PayrollSettings,
): void {
  if (!Number.isInteger(settings.day) || settings.day < 1 || settings.day > 31) {
    throw new RangeError('급여 지급일은 1일부터 31일까지 설정해야 합니다.');
  }
  if (
    settings.adjustment !== 'fixed-date' &&
    settings.adjustment !== 'previous-business-day'
  ) {
    throw new RangeError('급여일 조정 방식이 올바르지 않습니다.');
  }
}

/** 해당 월에 존재하지 않는 29~31일은 그달의 마지막 날짜로 맞춥니다. */
export function getRegularPayrollDateKey(
  year: number,
  month: number,
  settings: PayrollSettings,
): string {
  assertPayrollSettings(settings);
  const lastDay = new Date(year, month + 1, 0, 12).getDate();
  return toDateKey(new Date(year, month, Math.min(settings.day, lastDay), 12));
}
