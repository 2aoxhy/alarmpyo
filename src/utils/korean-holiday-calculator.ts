import KoreanLunarCalendar from 'korean-lunar-calendar';

import { addDays, parseDateKey } from './date';

export type CalculatedHolidayPreset = Readonly<Record<string, readonly string[]>>;

export const KOREAN_HOLIDAY_CALCULATION_START_YEAR = 2026;
export const KOREAN_HOLIDAY_CALCULATION_END_YEAR = 2050;

type SubstituteRule = 'none' | 'sunday' | 'weekend';

type HolidayOccurrence = {
  dateKey: string;
  name: string;
  substituteRule: SubstituteRule;
  substituteOnOverlap: boolean;
};

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lunarDateToSolarDateKey(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
): string {
  const calendar = new KoreanLunarCalendar();
  if (!calendar.setLunarDate(lunarYear, lunarMonth, lunarDay, false)) {
    throw new RangeError(`${lunarYear}년 음력 공휴일을 계산할 수 없어요.`);
  }

  const solar = calendar.getSolarCalendar();
  return toDateKey(solar.year, solar.month, solar.day);
}

function fixedHoliday(
  year: number,
  month: number,
  day: number,
  name: string,
  substituteRule: SubstituteRule,
  substituteOnOverlap = substituteRule !== 'none',
): HolidayOccurrence {
  return {
    dateKey: toDateKey(year, month, day),
    name,
    substituteRule,
    substituteOnOverlap,
  };
}

function buildBaseHolidays(year: number): HolidayOccurrence[] {
  const lunarNewYear = lunarDateToSolarDateKey(year, 1, 1);
  const buddhasBirthday = lunarDateToSolarDateKey(year, 4, 8);
  const chuseok = lunarDateToSolarDateKey(year, 8, 15);

  return [
    fixedHoliday(year, 1, 1, '1월 1일', 'none'),
    fixedHoliday(year, 3, 1, '3ㆍ1절', 'weekend'),
    fixedHoliday(year, 5, 1, '노동절', 'weekend'),
    fixedHoliday(year, 5, 5, '어린이날', 'weekend'),
    fixedHoliday(year, 6, 6, '현충일', 'none'),
    fixedHoliday(year, 7, 17, '제헌절', 'weekend'),
    fixedHoliday(year, 8, 15, '광복절', 'weekend'),
    fixedHoliday(year, 10, 3, '개천절', 'weekend'),
    fixedHoliday(year, 10, 9, '한글날', 'weekend'),
    fixedHoliday(year, 12, 25, '기독탄신일', 'weekend'),
    {
      dateKey: addDays(lunarNewYear, -1),
      name: '설날 전날',
      substituteRule: 'sunday',
      substituteOnOverlap: true,
    },
    {
      dateKey: lunarNewYear,
      name: '설날',
      substituteRule: 'sunday',
      substituteOnOverlap: true,
    },
    {
      dateKey: addDays(lunarNewYear, 1),
      name: '설날 다음 날',
      substituteRule: 'sunday',
      substituteOnOverlap: true,
    },
    {
      dateKey: buddhasBirthday,
      name: '부처님 오신 날',
      substituteRule: 'weekend',
      substituteOnOverlap: true,
    },
    {
      dateKey: addDays(chuseok, -1),
      name: '추석 전날',
      substituteRule: 'sunday',
      substituteOnOverlap: true,
    },
    {
      dateKey: chuseok,
      name: '추석',
      substituteRule: 'sunday',
      substituteOnOverlap: true,
    },
    {
      dateKey: addDays(chuseok, 1),
      name: '추석 다음 날',
      substituteRule: 'sunday',
      substituteOnOverlap: true,
    },
  ];
}

function appendHoliday(
  holidays: Map<string, string[]>,
  dateKey: string,
  name: string,
): void {
  const names = holidays.get(dateKey);
  if (names) {
    if (!names.includes(name)) names.push(name);
    return;
  }
  holidays.set(dateKey, [name]);
}

function isWeekend(dateKey: string): boolean {
  return [0, 6].includes(parseDateKey(dateKey).getDay());
}

function needsSubstitute(
  occurrence: HolidayOccurrence,
  occurrencesOnDate: readonly HolidayOccurrence[],
): boolean {
  const weekday = parseDateKey(occurrence.dateKey).getDay();
  if (occurrence.substituteRule === 'weekend' && (weekday === 0 || weekday === 6)) {
    return true;
  }
  if (occurrence.substituteRule === 'sunday' && weekday === 0) return true;
  return occurrence.substituteOnOverlap && weekday !== 0 && weekday !== 6 && occurrencesOnDate.length > 1;
}

function findNextSubstituteDate(
  originalDateKey: string,
  holidays: ReadonlyMap<string, readonly string[]>,
): string {
  let candidate = addDays(originalDateKey, 1);
  while (holidays.has(candidate) || isWeekend(candidate)) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

/**
 * 2026년 5월 시행 규정을 기준으로, 매년 반복되는 법정공휴일을 오프라인에서 계산해요.
 * 선거일과 정부가 수시 지정하는 임시공휴일은 공식 자료가 아니면 예측하지 않아요.
 */
export function calculateKoreanHolidayPreset(year: number): CalculatedHolidayPreset {
  if (
    !Number.isInteger(year) ||
    year < KOREAN_HOLIDAY_CALCULATION_START_YEAR ||
    year > KOREAN_HOLIDAY_CALCULATION_END_YEAR
  ) {
    throw new RangeError(
      `${KOREAN_HOLIDAY_CALCULATION_START_YEAR}~${KOREAN_HOLIDAY_CALCULATION_END_YEAR}년만 계산할 수 있어요.`,
    );
  }

  const occurrences = buildBaseHolidays(year).sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey),
  );
  const occurrencesByDate = new Map<string, HolidayOccurrence[]>();
  const holidays = new Map<string, string[]>();

  for (const occurrence of occurrences) {
    const grouped = occurrencesByDate.get(occurrence.dateKey);
    if (grouped) grouped.push(occurrence);
    else occurrencesByDate.set(occurrence.dateKey, [occurrence]);
    appendHoliday(holidays, occurrence.dateKey, occurrence.name);
  }

  for (const [dateKey, occurrencesOnDate] of occurrencesByDate) {
    const substituteReasons = occurrencesOnDate.filter((occurrence) =>
      needsSubstitute(occurrence, occurrencesOnDate),
    );
    if (substituteReasons.length === 0) continue;

    const substituteDateKey = findNextSubstituteDate(dateKey, holidays);
    const reason = substituteReasons[substituteReasons.length - 1].name;
    appendHoliday(holidays, substituteDateKey, `대체공휴일(${reason})`);
  }

  return Object.freeze(
    Object.fromEntries(
      [...holidays.entries()]
        .sort(([leftDateKey], [rightDateKey]) => leftDateKey.localeCompare(rightDateKey))
        .map(([dateKey, names]) => [dateKey, Object.freeze([...names])]),
    ),
  );
}
