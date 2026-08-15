import { addDays, isValidDateKey, parseDateKey, toDateKey } from '../utils/date';
import {
  getKoreanHoliday,
  getKoreanHolidayDataStatus,
  type KoreanHolidayDataSource,
} from '../utils/korean-holiday';

export type PayrollSchedule = {
  salaryYear: number;
  salaryMonth: number;
  periodStartDateKey: string;
  periodEndDateKey: string;
  regularPaydayDateKey: string;
  paydayDateKey: string;
  paydayAdjusted: boolean;
  paydayCalculation: 'confirmed' | 'calculated-standard' | 'weekend-only-estimate';
  holidayDataAvailable: boolean;
  holidayDataSource: KoreanHolidayDataSource;
};

export type PayrollCalendarEntry = {
  type: 'payday';
  dateKey: string;
  salaryYear: number;
  salaryMonth: number;
  calendarLabel: '급여';
  displayLabel: '월급날';
  accessibilityLabel: string;
  adjusted: boolean;
  confirmed: boolean;
};

function assertSalaryMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new RangeError('급여 연도가 올바르지 않습니다.');
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError('급여 월이 올바르지 않습니다.');
  }
}

function isPaydayHoliday(dateKey: string): boolean {
  const date = parseDateKey(dateKey);
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6 || getKoreanHoliday(dateKey) !== null;
}

function resolvePreviousWeekday(dateKey: string): string {
  let paydayDateKey = dateKey;
  while ([0, 6].includes(parseDateKey(paydayDateKey).getDay())) {
    paydayDateKey = addDays(paydayDateKey, -1);
  }
  return paydayDateKey;
}

function formatMonthDay(dateKey: string): string {
  return `${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일`;
}

/** 기준 지급일이 휴일이면 직전 평일까지 거슬러 올라가요. */
export function resolvePayrollBusinessDay(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    throw new RangeError('급여 지급일이 올바르지 않습니다.');
  }

  let paydayDateKey = dateKey;
  while (true) {
    const year = Number(paydayDateKey.slice(0, 4));
    if (!getKoreanHolidayDataStatus(year).available) {
      throw new RangeError(`${year}년 공휴일 자료가 없어 지급일을 계산할 수 없습니다.`);
    }
    if (!isPaydayHoliday(paydayDateKey)) break;
    paydayDateKey = addDays(paydayDateKey, -1);
  }
  return paydayDateKey;
}

/** 해당 월에 지급되는 급여의 산정기간과 지급일을 계산해요. */
export function getPayrollSchedule(year: number, month: number): PayrollSchedule {
  assertSalaryMonth(year, month);

  const regularPaydayDateKey = toDateKey(new Date(year, month, 21, 12));
  const holidayDataStatus = getKoreanHolidayDataStatus(year);
  const holidayDataAvailable = holidayDataStatus.available;
  const paydayDateKey = holidayDataAvailable
    ? resolvePayrollBusinessDay(regularPaydayDateKey)
    : resolvePreviousWeekday(regularPaydayDateKey);

  return {
    salaryYear: year,
    salaryMonth: month,
    periodStartDateKey: toDateKey(new Date(year, month - 1, 16, 12)),
    periodEndDateKey: toDateKey(new Date(year, month, 15, 12)),
    regularPaydayDateKey,
    paydayDateKey,
    paydayAdjusted: paydayDateKey !== regularPaydayDateKey,
    paydayCalculation:
      holidayDataStatus.source === 'official'
        ? 'confirmed'
        : holidayDataStatus.source === 'calculated'
          ? 'calculated-standard'
          : 'weekend-only-estimate',
    holidayDataAvailable,
    holidayDataSource: holidayDataStatus.source,
  };
}

/** 근무한 날짜가 어느 달 급여에 포함되는지 계산해요. */
export function getPayrollScheduleForWorkDate(dateKey: string): PayrollSchedule {
  if (!isValidDateKey(dateKey)) {
    throw new RangeError('근무 날짜가 올바르지 않습니다.');
  }

  const workDate = parseDateKey(dateKey);
  const salaryMonth = new Date(
    workDate.getFullYear(),
    workDate.getMonth() + (workDate.getDate() >= 16 ? 1 : 0),
    1,
    12,
  );

  return getPayrollSchedule(salaryMonth.getFullYear(), salaryMonth.getMonth());
}

/** 달력 날짜 셀에서 바로 사용할 월급날 표시 정보를 만들어요. */
export function getPayrollCalendarEntry(
  year: number,
  month: number,
): PayrollCalendarEntry {
  const schedule = getPayrollSchedule(year, month);
  const adjustedCopy = schedule.paydayAdjusted
    ? `, ${formatMonthDay(schedule.regularPaydayDateKey)}이 휴일이라 앞당겨졌습니다`
    : '';
  const estimateCopy =
    schedule.paydayCalculation === 'calculated-standard'
      ? ', 반복 법정공휴일을 반영한 예상일입니다'
      : schedule.paydayCalculation === 'weekend-only-estimate'
        ? ', 공휴일 자료가 없어 주말만 반영한 예상일입니다'
        : '';

  return {
    type: 'payday',
    dateKey: schedule.paydayDateKey,
    salaryYear: schedule.salaryYear,
    salaryMonth: schedule.salaryMonth,
    calendarLabel: '급여',
    displayLabel: '월급날',
    accessibilityLabel: `${schedule.salaryYear}년 ${schedule.salaryMonth + 1}월 월급날${adjustedCopy}${estimateCopy}`,
    adjusted: schedule.paydayAdjusted,
    confirmed: schedule.paydayCalculation === 'confirmed',
  };
}

/** 선택한 달의 월급날을 날짜 키로 조회할 수 있게 반환해요. */
export function getPayrollCalendarEntriesForMonth(
  year: number,
  month: number,
): Readonly<Record<string, PayrollCalendarEntry>> {
  const entry = getPayrollCalendarEntry(year, month);
  return { [entry.dateKey]: entry };
}
