import { describe, expect, it } from 'vitest';

import {
  getPayrollCalendarEntriesForMonth,
  getPayrollCalendarEntry,
  getPayrollSchedule,
  getPayrollScheduleForWorkDate,
  resolvePayrollBusinessDay,
} from '../payroll-schedule';

describe('급여 산정기간', () => {
  it('전월 16일부터 당월 15일까지 산정하고 당월 21일에 지급해요', () => {
    expect(getPayrollSchedule(2026, 6)).toEqual({
      salaryYear: 2026,
      salaryMonth: 6,
      periodStartDateKey: '2026-06-16',
      periodEndDateKey: '2026-07-15',
      regularPaydayDateKey: '2026-07-21',
      paydayDateKey: '2026-07-21',
      paydayAdjusted: false,
      paydayCalculation: 'confirmed',
      holidayDataAvailable: true,
      holidayDataSource: 'official',
    });
  });

  it('1월 급여는 전년도 12월 16일부터 계산해요', () => {
    expect(getPayrollSchedule(2026, 0)).toEqual({
      salaryYear: 2026,
      salaryMonth: 0,
      periodStartDateKey: '2025-12-16',
      periodEndDateKey: '2026-01-15',
      regularPaydayDateKey: '2026-01-21',
      paydayDateKey: '2026-01-21',
      paydayAdjusted: false,
      paydayCalculation: 'confirmed',
      holidayDataAvailable: true,
      holidayDataSource: 'official',
    });
  });

  it('21일이 주말이면 직전 평일에 지급해요', () => {
    expect(getPayrollSchedule(2026, 1)).toMatchObject({
      regularPaydayDateKey: '2026-02-21',
      paydayDateKey: '2026-02-20',
      paydayAdjusted: true,
    });
  });

  it('연휴와 주말이 이어지면 모두 건너뛰고 직전 평일에 지급해요', () => {
    expect(resolvePayrollBusinessDay('2021-09-21')).toBe('2021-09-17');
    expect(getPayrollSchedule(2021, 8)).toMatchObject({
      regularPaydayDateKey: '2021-09-21',
      paydayDateKey: '2021-09-17',
      paydayAdjusted: true,
    });
  });

  it('달력에서 실제 월급날을 날짜 키로 바로 조회해요', () => {
    expect(getPayrollCalendarEntriesForMonth(2026, 6)).toEqual({
      '2026-07-21': {
        type: 'payday',
        dateKey: '2026-07-21',
        salaryYear: 2026,
        salaryMonth: 6,
        calendarLabel: '급여',
        displayLabel: '월급날',
        accessibilityLabel: '2026년 7월 월급날',
        adjusted: false,
        confirmed: true,
      },
    });
  });

  it('달력에는 휴일 조정 전 21일이 아닌 실제 지급일만 표시해요', () => {
    const weekend = getPayrollCalendarEntry(2026, 1);
    expect(weekend).toMatchObject({
      dateKey: '2026-02-20',
      adjusted: true,
      confirmed: true,
    });
    expect(weekend.accessibilityLabel).toContain('2월 21일이 휴일이라 앞당겨졌습니다');

    const holiday = getPayrollCalendarEntriesForMonth(2021, 8);
    expect(Object.keys(holiday)).toEqual(['2021-09-17']);
    expect(holiday['2021-09-17']).toMatchObject({
      displayLabel: '월급날',
      adjusted: true,
      confirmed: true,
    });
  });

  it('공식 자료가 없는 연도의 달력 표시는 자동 계산한 예상일임을 알려요', () => {
    expect(getPayrollCalendarEntry(2028, 4)).toMatchObject({
      dateKey: '2028-05-19',
      adjusted: true,
      confirmed: false,
      accessibilityLabel:
        '2028년 5월 월급날, 5월 21일이 휴일이라 앞당겨졌습니다, 반복 법정공휴일을 반영한 예상일입니다',
    });
  });

  it('15일과 16일의 근무는 서로 다른 달 급여에 포함해요', () => {
    expect(getPayrollScheduleForWorkDate('2026-07-15').paydayDateKey).toBe('2026-07-21');
    expect(getPayrollScheduleForWorkDate('2026-07-16').paydayDateKey).toBe('2026-08-21');
    expect(getPayrollScheduleForWorkDate('2026-12-16').paydayDateKey).toBe('2027-01-21');
  });

  it('공식 자료가 없는 연도는 반복 법정공휴일을 반영한 예상일로 구분해요', () => {
    expect(getPayrollSchedule(2028, 4)).toMatchObject({
      regularPaydayDateKey: '2028-05-21',
      paydayDateKey: '2028-05-19',
      paydayAdjusted: true,
      paydayCalculation: 'calculated-standard',
      holidayDataAvailable: true,
      holidayDataSource: 'calculated',
    });
    expect(resolvePayrollBusinessDay('2028-05-21')).toBe('2028-05-19');
    expect(() => resolvePayrollBusinessDay('2018-01-01')).toThrow(
      '2017년 공휴일 자료가 없어 지급일을 계산할 수 없습니다.',
    );
  });

  it('올바르지 않은 날짜와 월은 거부해요', () => {
    expect(() => getPayrollSchedule(2026, 12)).toThrow(RangeError);
    expect(() => getPayrollScheduleForWorkDate('2026-02-30')).toThrow(RangeError);
    expect(() => resolvePayrollBusinessDay('날짜 없음')).toThrow(RangeError);
  });
});
