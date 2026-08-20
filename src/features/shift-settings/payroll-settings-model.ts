import type { PayrollSettings } from '../../models/app-data';
import { getPayrollSchedule } from '../../services/payroll-schedule';

export type PayrollPreviewItem = {
  adjusted: boolean;
  confirmed: boolean;
  monthLabel: string;
  paydayLabel: string;
  regularPaydayLabel: string;
};

function formatMonthDay(dateKey: string): string {
  return `${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일`;
}

export function parsePayrollDay(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

export function formatPayrollSettingsSummary(settings: PayrollSettings): string {
  const adjustment =
    settings.adjustment === 'fixed-date' ? '지정일 그대로' : '직전 영업일';
  return `매월 ${settings.day}일 · ${adjustment}`;
}

export function buildPayrollPreview(
  settings: PayrollSettings,
  from = new Date(),
): PayrollPreviewItem[] {
  return Array.from({ length: 3 }, (_, offset) => {
    const month = new Date(from.getFullYear(), from.getMonth() + offset, 1, 12);
    const schedule = getPayrollSchedule(
      month.getFullYear(),
      month.getMonth(),
      settings,
    );
    return {
      adjusted: schedule.paydayAdjusted,
      confirmed: schedule.paydayCalculation === 'confirmed',
      monthLabel: `${schedule.salaryYear}년 ${schedule.salaryMonth + 1}월`,
      paydayLabel: formatMonthDay(schedule.paydayDateKey),
      regularPaydayLabel: formatMonthDay(schedule.regularPaydayDateKey),
    };
  });
}
