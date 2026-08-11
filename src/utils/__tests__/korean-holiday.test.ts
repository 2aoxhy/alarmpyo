import { describe, expect, it } from 'vitest';

import {
  getKoreanHoliday,
  getKoreanHolidayDataStatus,
  getKoreanHolidaysForMonth,
  KOREAN_HOLIDAY_DATA_END_YEAR,
  KOREAN_HOLIDAY_OFFICIAL_END_YEAR,
} from '../korean-holiday';

describe('한국 공휴일 표시', () => {
  it.each([
    ['2026-01-01', '신정', '신정'],
    ['2026-02-16', '설 전날', '설전'],
    ['2026-02-17', '설날', '설날'],
    ['2026-02-18', '설 다음날', '설 후'],
    ['2026-03-02', '대체휴일', '대체'],
    ['2026-05-24', '부처님날', '부처님'],
    ['2026-07-17', '제헌절', '제헌절'],
    ['2026-09-24', '추석 전날', '추석전'],
    ['2026-09-25', '추석', '추석'],
    ['2026-09-26', '추석 다음날', '추석후'],
    ['2026-10-03', '개천절', '개천절'],
    ['2026-10-05', '대체휴일', '대체'],
    ['2026-12-25', '크리스마스', '성탄절'],
  ])('%s의 달력용 이름을 읽기 좋게 표시해요', (dateKey, displayLabel, calendarLabel) => {
    expect(getKoreanHoliday(dateKey)?.displayLabel).toBe(displayLabel);
    expect(getKoreanHoliday(dateKey)?.calendarLabel).toBe(calendarLabel);
  });

  it('같은 날짜의 공휴일을 하나도 잃지 않고 짧게 표시해요', () => {
    expect(getKoreanHoliday('2025-05-05')).toEqual({
      names: ['어린이날', '부처님 오신 날'],
      displayLabel: '어린이+1',
      calendarLabel: '2개',
      accessibilityLabel: '어린이날, 부처님 오신 날',
    });
  });

  it('선거일과 크리스마스 이름을 읽기 쉽게 바꿔요', () => {
    expect(getKoreanHoliday('2026-06-03')?.displayLabel).toBe('선거일');
    expect(getKoreanHoliday('2026-12-25')?.accessibilityLabel).toBe('크리스마스');
  });

  it('선택한 달의 공휴일만 반환해요', () => {
    const july = getKoreanHolidaysForMonth(2026, 6);

    expect(Object.keys(july)).toEqual(['2026-07-17']);
    expect(july['2026-07-17']?.displayLabel).toBe('제헌절');
  });

  it('달력용 휴일 이름에는 강제 줄바꿈을 넣지 않아요', () => {
    const labels = [2025, 2026, 2027, 2030].flatMap((year) =>
      Array.from({ length: 12 }, (_, month) =>
        Object.values(getKoreanHolidaysForMonth(year, month)),
      ).flat(),
    );

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((holiday) => !holiday.calendarLabel.includes('\n'))).toBe(true);
    expect(labels.every((holiday) => holiday.calendarLabel.length <= 3)).toBe(true);
  });

  it('일반 날짜는 비우고 공식 자료가 없는 연도는 반복 공휴일을 계산해요', () => {
    expect(getKoreanHoliday('2026-07-16')).toBeNull();
    expect(getKoreanHoliday('2030-10-03')?.displayLabel).toBe('개천절');
    expect(getKoreanHolidaysForMonth(2030, 9)).toHaveProperty('2030-10-03');
  });

  it('공식 자료, 자동 계산 자료, 지원 범위 밖을 구분해요', () => {
    expect(getKoreanHolidayDataStatus(2027)).toMatchObject({
      available: true,
      source: 'official',
      officialDataAvailable: true,
      includesVariableHolidays: true,
    });
    expect(getKoreanHolidayDataStatus(2028)).toMatchObject({
      available: true,
      source: 'calculated',
      officialDataAvailable: false,
      includesVariableHolidays: false,
      supportedStartYear: 2018,
      supportedEndYear: KOREAN_HOLIDAY_DATA_END_YEAR,
      officialSupportedEndYear: KOREAN_HOLIDAY_OFFICIAL_END_YEAR,
      year: 2028,
    });
    expect(getKoreanHolidayDataStatus(2051)).toMatchObject({
      available: false,
      source: 'unavailable',
      officialDataAvailable: false,
      includesVariableHolidays: false,
      year: 2051,
    });
  });
});
