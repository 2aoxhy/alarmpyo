import { y2026, y2027 } from '@hyunbinseo/holidays-kr/all';
import { describe, expect, it } from 'vitest';

import {
  calculateKoreanHolidayPreset,
  KOREAN_HOLIDAY_CALCULATION_END_YEAR,
} from '../korean-holiday-calculator';

function removeVariableHolidays(
  preset: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    Object.entries(preset).filter(([, names]) =>
      names.every((name) => !name.includes('선거') && !name.startsWith('임시공휴일')),
    ),
  );
}

describe('한국 법정공휴일 자동 계산', () => {
  it.each([
    [2026, y2026],
    [2027, y2027],
  ])('%i년 공식 월력요항의 반복 공휴일과 일치해요', (year, officialPreset) => {
    expect(calculateKoreanHolidayPreset(year)).toEqual(
      removeVariableHolidays(officialPreset),
    );
  });

  it('공식 자료가 아직 없는 연도도 고정일과 음력 공휴일을 만들어요', () => {
    const holidays = calculateKoreanHolidayPreset(2030);

    expect(holidays['2030-01-01']).toEqual(['1월 1일']);
    expect(holidays['2030-02-03']).toEqual(['설날']);
    expect(holidays['2030-05-09']).toEqual(['부처님 오신 날']);
    expect(holidays['2030-07-17']).toEqual(['제헌절']);
    expect(holidays['2030-09-12']).toEqual(['추석']);
    expect(Object.values(holidays).flat().some((name) => name.includes('선거'))).toBe(false);
  });

  it('현행 규정의 대체공휴일 대상과 제외 대상을 구분해요', () => {
    const holidays = calculateKoreanHolidayPreset(2032);

    expect(holidays['2032-05-03']).toEqual(['대체공휴일(노동절)']);
    expect(holidays['2032-06-07']).toBeUndefined();
    expect(holidays['2032-12-27']).toEqual(['대체공휴일(기독탄신일)']);
  });

  it('지원하는 마지막 연도까지 계산하고 범위 밖은 거부해요', () => {
    expect(calculateKoreanHolidayPreset(KOREAN_HOLIDAY_CALCULATION_END_YEAR)).toHaveProperty(
      `${KOREAN_HOLIDAY_CALCULATION_END_YEAR}-12-25`,
    );
    expect(() =>
      calculateKoreanHolidayPreset(KOREAN_HOLIDAY_CALCULATION_END_YEAR + 1),
    ).toThrow(RangeError);
  });
});
