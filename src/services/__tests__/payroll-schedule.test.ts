import { describe, expect, it } from 'vitest';

import {
  getPayrollCalendarEntriesForMonth,
  getPayrollCalendarEntry,
  getPayrollSchedule,
  resolvePayrollBusinessDay,
} from '../payroll-schedule';

describe('급여 지급일', () => {
  it('사용자가 지정한 당월 지급일을 계산합니다', () => {
    expect(getPayrollSchedule(2026, 6)).toEqual({
      salaryYear: 2026,
      salaryMonth: 6,
      regularPaydayDateKey: '2026-07-21',
      paydayDateKey: '2026-07-21',
      paydayAdjusted: false,
      paydayCalculation: 'confirmed',
      holidayDataAvailable: true,
      holidayDataSource: 'official',
    });
  });

  it('1월 지급일도 해당 연도와 월만 사용합니다', () => {
    expect(getPayrollSchedule(2026, 0)).toEqual({
      salaryYear: 2026,
      salaryMonth: 0,
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

  it('다음 달 지급일이 이번 달로 앞당겨지면 보이는 달에 표시합니다', () => {
    const entries = getPayrollCalendarEntriesForMonth(2026, 6, {
      day: 1,
      adjustment: 'previous-business-day',
    });

    expect(entries).toHaveProperty('2026-07-31');
    expect(entries['2026-07-31']).toMatchObject({
      salaryYear: 2026,
      salaryMonth: 7,
      adjusted: true,
      confirmed: true,
    });
  });

  it('지원 연도 상한의 12월은 다음 연도를 조회하지 않습니다', () => {
    expect(() => getPayrollCalendarEntriesForMonth(2200, 11)).not.toThrow();
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
    expect(() => resolvePayrollBusinessDay('날짜 없음')).toThrow(RangeError);
  });

  it('29~31일이 없는 달은 해당 월의 말일을 기준으로 사용합니다', () => {
    expect(getPayrollSchedule(2026, 1, {
      day: 31,
      adjustment: 'fixed-date',
    })).toMatchObject({
      regularPaydayDateKey: '2026-02-28',
      paydayDateKey: '2026-02-28',
      paydayAdjusted: false,
      paydayCalculation: 'confirmed',
    });
    expect(getPayrollSchedule(2028, 1, {
      day: 31,
      adjustment: 'fixed-date',
    }).paydayDateKey).toBe('2028-02-29');
  });

  it('지정일 그대로 정책은 주말과 공휴일에도 앞당기지 않습니다', () => {
    const schedule = getPayrollSchedule(2026, 1, {
      day: 21,
      adjustment: 'fixed-date',
    });
    expect(schedule.regularPaydayDateKey).toBe('2026-02-21');
    expect(schedule.paydayDateKey).toBe('2026-02-21');
    expect(schedule.paydayAdjusted).toBe(false);
    expect(getPayrollCalendarEntry(2026, 1, {
      day: 21,
      adjustment: 'fixed-date',
    }).confirmed).toBe(true);
  });

  it('사용자 지급일에도 직전 영업일 정책을 동일하게 적용합니다', () => {
    expect(getPayrollSchedule(2021, 8, {
      day: 21,
      adjustment: 'previous-business-day',
    }).paydayDateKey).toBe('2021-09-17');
  });

  it('급여 설정 범위를 벗어나면 거부합니다', () => {
    expect(() => getPayrollSchedule(2026, 6, {
      day: 0,
      adjustment: 'fixed-date',
    })).toThrow(RangeError);
  });
});
