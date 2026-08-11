import * as officialKoreanHolidayPresets from '@hyunbinseo/holidays-kr/all';

import {
  calculateKoreanHolidayPreset,
  KOREAN_HOLIDAY_CALCULATION_END_YEAR,
  KOREAN_HOLIDAY_CALCULATION_START_YEAR,
} from './korean-holiday-calculator';

type HolidayPreset = Readonly<Record<string, readonly string[]>>;

export type KoreanHolidayInfo = {
  names: readonly string[];
  displayLabel: string;
  calendarLabel: string;
  accessibilityLabel: string;
};

const HOLIDAY_EXPORT_NAME_PATTERN = /^y(\d{4})$/;

function isHolidayPreset(value: unknown): value is HolidayPreset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  return Object.entries(value).every(
    ([dateKey, names]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
      Array.isArray(names) &&
      names.length > 0 &&
      names.every((name) => typeof name === 'string' && name.length > 0),
  );
}

/**
 * 설치된 공식 월력요항 패키지가 제공하는 모든 연도를 자동으로 찾아요.
 * 새 연도 자료가 포함된 패키지로 갱신하면 이 파일을 다시 수정하지 않아도 반영돼요.
 */
const HOLIDAY_PRESET_ENTRIES: readonly (readonly [number, HolidayPreset])[] = Object.entries(
  officialKoreanHolidayPresets,
)
  .flatMap(([exportName, preset]) => {
    const match = HOLIDAY_EXPORT_NAME_PATTERN.exec(exportName);
    if (!match || !isHolidayPreset(preset)) return [];
    return [[Number(match[1]), preset] as const];
  })
  .sort(([leftYear], [rightYear]) => leftYear - rightYear);

if (HOLIDAY_PRESET_ENTRIES.length === 0) {
  throw new Error('공식 공휴일 자료를 불러오지 못했어요.');
}

const HOLIDAY_PRESETS = Object.fromEntries(
  HOLIDAY_PRESET_ENTRIES,
) as Readonly<Record<number, HolidayPreset>>;

export const KOREAN_HOLIDAY_OFFICIAL_START_YEAR = HOLIDAY_PRESET_ENTRIES[0][0];
export const KOREAN_HOLIDAY_OFFICIAL_END_YEAR =
  HOLIDAY_PRESET_ENTRIES[HOLIDAY_PRESET_ENTRIES.length - 1][0];
export const KOREAN_HOLIDAY_DATA_START_YEAR = Math.min(
  KOREAN_HOLIDAY_OFFICIAL_START_YEAR,
  KOREAN_HOLIDAY_CALCULATION_START_YEAR,
);
export const KOREAN_HOLIDAY_DATA_END_YEAR = Math.max(
  KOREAN_HOLIDAY_OFFICIAL_END_YEAR,
  KOREAN_HOLIDAY_CALCULATION_END_YEAR,
);

const CALCULATED_HOLIDAY_PRESETS = new Map<number, HolidayPreset>();

export type KoreanHolidayDataSource = 'official' | 'calculated' | 'unavailable';

export type KoreanHolidayDataStatus = {
  available: boolean;
  source: KoreanHolidayDataSource;
  officialDataAvailable: boolean;
  includesVariableHolidays: boolean;
  supportedStartYear: number;
  supportedEndYear: number;
  officialSupportedStartYear: number;
  officialSupportedEndYear: number;
  year: number;
};

const FRIENDLY_NAMES: Readonly<Record<string, string>> = {
  '1월 1일': '신정',
  '3ㆍ1절': '3·1절',
  '기독탄신일': '크리스마스',
};

const SHORT_NAMES: Readonly<Record<string, string>> = {
  '설날 전날': '설 전날',
  '설날 다음 날': '설 다음날',
  '부처님 오신 날': '부처님날',
  '추석 전날': '추석 전날',
  '추석 다음 날': '추석 다음날',
};

function friendlyHolidayName(name: string): string {
  return FRIENDLY_NAMES[name] ?? name;
}

function shortHolidayName(name: string): string {
  const friendlyName = friendlyHolidayName(name);
  if (friendlyName.startsWith('대체공휴일')) return '대체휴일';
  if (friendlyName.includes('선거')) return '선거일';
  if (friendlyName.startsWith('임시공휴일')) return '임시휴일';
  return SHORT_NAMES[friendlyName] ?? friendlyName.replaceAll(' ', '');
}

const CALENDAR_LABELS: Readonly<Record<string, string>> = {
  '설 전날': '설전',
  '설 다음날': '설 후',
  '부처님날': '부처님',
  '추석 전날': '추석전',
  '추석 다음날': '추석후',
  '크리스마스': '성탄절',
  '대체휴일': '대체',
  '임시휴일': '임시',
};

function calendarHolidayLabel(displayLabel: string, holidayCount: number): string {
  if (holidayCount > 1) return `${holidayCount}개`;
  const label = CALENDAR_LABELS[displayLabel] ?? displayLabel;
  return Array.from(label).slice(0, 3).join('');
}

function buildHolidayInfo(names: readonly string[]): KoreanHolidayInfo {
  const friendlyNames = names.map(friendlyHolidayName);
  const shortNames = names.map(shortHolidayName);
  const displayLabel =
    shortNames.length === 1
      ? shortNames[0]
      : `${shortNames[0].slice(0, 3)}+${shortNames.length - 1}`;
  return {
    names: friendlyNames,
    displayLabel,
    calendarLabel: calendarHolidayLabel(displayLabel, names.length),
    accessibilityLabel: friendlyNames.join(', '),
  };
}

function getHolidayPresetForYear(year: number): HolidayPreset | null {
  const officialPreset = HOLIDAY_PRESETS[year];
  if (officialPreset) return officialPreset;
  if (
    year < KOREAN_HOLIDAY_CALCULATION_START_YEAR ||
    year > KOREAN_HOLIDAY_CALCULATION_END_YEAR
  ) {
    return null;
  }

  const cachedPreset = CALCULATED_HOLIDAY_PRESETS.get(year);
  if (cachedPreset) return cachedPreset;

  const calculatedPreset = calculateKoreanHolidayPreset(year);
  CALCULATED_HOLIDAY_PRESETS.set(year, calculatedPreset);
  return calculatedPreset;
}

export function getKoreanHolidayDataStatus(year: number): KoreanHolidayDataStatus {
  const officialDataAvailable = Object.prototype.hasOwnProperty.call(HOLIDAY_PRESETS, year);
  const calculatedDataAvailable =
    year >= KOREAN_HOLIDAY_CALCULATION_START_YEAR &&
    year <= KOREAN_HOLIDAY_CALCULATION_END_YEAR;
  const source: KoreanHolidayDataSource = officialDataAvailable
    ? 'official'
    : calculatedDataAvailable
      ? 'calculated'
      : 'unavailable';

  return {
    available: source !== 'unavailable',
    source,
    officialDataAvailable,
    includesVariableHolidays: officialDataAvailable,
    supportedStartYear: KOREAN_HOLIDAY_DATA_START_YEAR,
    supportedEndYear: KOREAN_HOLIDAY_DATA_END_YEAR,
    officialSupportedStartYear: KOREAN_HOLIDAY_OFFICIAL_START_YEAR,
    officialSupportedEndYear: KOREAN_HOLIDAY_OFFICIAL_END_YEAR,
    year,
  };
}

export function getKoreanHoliday(dateKey: string): KoreanHolidayInfo | null {
  const year = Number(dateKey.slice(0, 4));
  const names = getHolidayPresetForYear(year)?.[dateKey];
  return names ? buildHolidayInfo(names) : null;
}

export function getKoreanHolidaysForMonth(
  year: number,
  month: number,
): Readonly<Record<string, KoreanHolidayInfo>> {
  const preset = getHolidayPresetForYear(year);
  if (!preset) return {};

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  return Object.fromEntries(
    Object.entries(preset)
      .filter(([dateKey]) => dateKey.startsWith(monthPrefix))
      .map(([dateKey, names]) => [dateKey, buildHolidayInfo(names)]),
  );
}
