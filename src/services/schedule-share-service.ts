import type { ShiftType } from '../models/app-data';
import type { EffectiveDay } from './app-data-service';
import {
  differenceInCalendarDays,
  formatCompactTime,
  isValidDateKey,
  parseDateKey,
} from '../utils/date';
import { getDayExceptionLabel } from '../utils/day-exception';

export type ShareableScheduleDay = Pick<
  EffectiveDay,
  'dateKey' | 'scheduleActive' | 'shift' | 'dayException'
>;

export type ScheduleShareTextOptions = {
  /** 공유 앱에서 문맥을 바로 알 수 있도록 첫 줄에 제목을 붙여요. */
  includeHeading?: boolean;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function normalizeSelectedDays(
  days: readonly ShareableScheduleDay[],
): ShareableScheduleDay[] {
  const daysByDate = new Map<string, ShareableScheduleDay>();

  for (const day of days) {
    if (!isValidDateKey(day.dateKey)) {
      throw new TypeError('공유할 일정에 올바르지 않은 날짜가 있습니다.');
    }
    // 같은 날짜가 다시 들어오면 가장 최근에 계산한 일정으로 교체해요.
    daysByDate.set(day.dateKey, day);
  }

  return [...daysByDate.values()].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey),
  );
}

function formatSelectedDate(
  dateKey: string,
  includeYear: boolean,
  includeMonth: boolean,
): string {
  const date = parseDateKey(dateKey);
  const weekday = WEEKDAYS[date.getDay()];
  const year = includeYear ? `${date.getFullYear()}년 ` : '';
  const month = includeMonth ? `${date.getMonth() + 1}월 ` : '';
  return `${year}${month}${date.getDate()}일(${weekday})`;
}

function splitConsecutiveDates(dateKeys: readonly string[]): string[][] {
  const ranges: string[][] = [];
  for (const dateKey of dateKeys) {
    const current = ranges.at(-1);
    if (
      current &&
      differenceInCalendarDays(dateKey, current[current.length - 1]) === 1
    ) {
      current.push(dateKey);
    } else {
      ranges.push([dateKey]);
    }
  }
  return ranges;
}

function formatSelectedDateGroup(
  dateKeys: readonly string[],
  includeYear: boolean,
): string {
  let previousYearMonth: string | null = null;
  return splitConsecutiveDates(dateKeys)
    .map((range, index) => {
      const start = range[0];
      const end = range[range.length - 1];
      const startYearMonth = start.slice(0, 7);
      const endYearMonth = end.slice(0, 7);
      const startLabel = formatSelectedDate(
        start,
        includeYear,
        includeYear || index === 0 || startYearMonth !== previousYearMonth,
      );
      const endLabel =
        range.length > 1
          ? formatSelectedDate(
              end,
              includeYear,
              includeYear || endYearMonth !== startYearMonth,
            )
          : null;
      previousYearMonth = endYearMonth;
      return endLabel ? `${startLabel}~${endLabel}` : startLabel;
    })
    .join(', ');
}

function formatShiftTime(shift: ShiftType): string | null {
  if (shift.isOff || shift.startMinutes === null || shift.endMinutes === null) return null;

  const start = formatCompactTime(shift.startMinutes);
  const end = formatCompactTime(shift.endMinutes);
  return shift.endsNextDay ? `${start}~다음 날 ${end}` : `${start}~${end}`;
}

function resolveScheduleName(day: ShareableScheduleDay): string {
  const exceptionName = day.dayException
    ? getDayExceptionLabel(day.dayException)
    : null;
  return exceptionName ?? day.shift?.name ?? '휴무';
}

function formatScheduleDetail(day: ShareableScheduleDay): string {
  if (!day.scheduleActive) return '첫 근무일 이전';

  const name = resolveScheduleName(day);
  const time = day.shift ? formatShiftTime(day.shift) : null;
  return time ? `${name}(${time})` : name;
}

/**
 * 달력에서 선택한 날짜를 공유하기 좋은 한국어 문장으로 만들어요.
 * 날짜는 오름차순으로 정리하고 중복 날짜는 가장 최근 항목 하나만 사용해요.
 */
export function buildScheduleShareText(
  days: readonly ShareableScheduleDay[],
  options: ScheduleShareTextOptions = {},
): string {
  const selectedDays = normalizeSelectedDays(days);
  if (selectedDays.length === 0) {
    throw new RangeError('공유할 일정을 한 개 이상 선택해야 합니다.');
  }

  const years = new Set(selectedDays.map((day) => day.dateKey.slice(0, 4)));
  const includeYear = years.size > 1;
  const grouped = new Map<string, string[]>();
  selectedDays.forEach((day) => {
    const detail = formatScheduleDetail(day);
    grouped.set(detail, [...(grouped.get(detail) ?? []), day.dateKey]);
  });
  const lines = [...grouped.entries()].map(
    ([detail, dateKeys]) =>
      `${formatSelectedDateGroup(dateKeys, includeYear)} · ${detail}`,
  );

  if (options.includeHeading === false) return lines.join('\n');
  return ['알람표 근무 일정', '', ...lines].join('\n');
}
