import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { DayExceptionType, ShiftType } from '../models/app-data';
import { addDays, formatCompactTime, toDateKey } from '../utils/date';
import { getDayExceptionLabel } from '../utils/day-exception';
import type { ResolveEffectiveDay } from './app-data-service';

export type WorkCalendarExportInput = {
  year: number;
  month: number;
  /** 첫 근무일 여부와 날짜 예외까지 반영한 최종 일정을 반환해요. */
  resolveDay: ResolveEffectiveDay;
  getNote?: (dateKey: string) => string;
  includeNotes?: boolean;
  now?: Date;
};

const CALENDAR_TIME_ZONE = 'Asia/Seoul';
const CALENDAR_UID_DOMAIN = 'alarmpyo.expo.app';
const ICS_LINE_LIMIT_BYTES = 75;

function assertMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new RangeError('내보낼 연도가 올바르지 않아요.');
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError('내보낼 월이 올바르지 않아요.');
  }
}

function compactDate(dateKey: string): string {
  return dateKey.replaceAll('-', '');
}

function compactDateTime(dateKey: string, minutes: number): string {
  return `${compactDate(dateKey)}T${formatCompactTime(minutes).replace(':', '')}00`;
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function foldIcsContentLine(line: string): string[] {
  if (!line) return [''];
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  let limit = ICS_LINE_LIMIT_BYTES;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (chunk && chunkBytes + characterBytes > limit) {
      folded.push(folded.length === 0 ? chunk : ` ${chunk}`);
      chunk = character;
      chunkBytes = characterBytes;
      limit = ICS_LINE_LIMIT_BYTES - 1;
    } else {
      chunk += character;
      chunkBytes += characterBytes;
    }
  }
  folded.push(folded.length === 0 ? chunk : ` ${chunk}`);
  return folded;
}

function calendarUid(dateKey: string): string {
  return `alarmpyo-${compactDate(dateKey)}@${CALENDAR_UID_DOMAIN}`;
}

function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function eventLines(
  dateKey: string,
  shift: ShiftType,
  note: string,
  createdAt: Date,
  dayException?: DayExceptionType,
): string[] {
  if (shift.startMinutes === null || shift.endMinutes === null || shift.isOff) return [];
  const endDateKey =
    shift.endsNextDay || shift.endMinutes <= shift.startMinutes
      ? addDays(dateKey, 1)
      : dateKey;
  const exceptionLabel = dayException ? getDayExceptionLabel(dayException) : null;
  const descriptionParts = [
    exceptionLabel ? `예외 일정: ${exceptionLabel}` : '',
    `${shift.name} ${formatCompactTime(shift.startMinutes)}~${formatCompactTime(shift.endMinutes)}`,
    note.trim(),
  ].filter(Boolean);
  const title = exceptionLabel
    ? shift.name === exceptionLabel
      ? exceptionLabel
      : `${exceptionLabel} · ${shift.name}`
    : shift.name;

  return [
    'BEGIN:VEVENT',
    `UID:${calendarUid(dateKey)}`,
    `DTSTAMP:${utcStamp(createdAt)}`,
    `DTSTART;TZID=${CALENDAR_TIME_ZONE}:${compactDateTime(dateKey, shift.startMinutes)}`,
    `DTEND;TZID=${CALENDAR_TIME_ZONE}:${compactDateTime(endDateKey, shift.endMinutes)}`,
    `SUMMARY:${escapeIcsText(`알람표 ${title}`)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];
}

function allDayExceptionLines(
  dateKey: string,
  dayException: DayExceptionType,
  note: string,
  createdAt: Date,
): string[] {
  const label = getDayExceptionLabel(dayException);
  const description = [label, note.trim()].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${calendarUid(dateKey)}`,
    `DTSTAMP:${utcStamp(createdAt)}`,
    `DTSTART;VALUE=DATE:${compactDate(dateKey)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(dateKey, 1))}`,
    `SUMMARY:${escapeIcsText(`알람표 ${label}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/** 휴무는 제외하고 선택한 달의 실제 근무만 표준 iCalendar 파일로 만들어요. */
export function buildWorkCalendarIcs({
  year,
  month,
  resolveDay,
  getNote = () => '',
  includeNotes = false,
  now = new Date(),
}: WorkCalendarExportInput): string {
  assertMonth(year, month);
  if (Number.isNaN(now.getTime())) throw new RangeError('파일 생성 시각이 올바르지 않아요.');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AlarmPyo//Shift Calendar//KO',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(`알람표 ${year}년 ${month + 1}월 근무표`)}`,
    `X-WR-TIMEZONE:${CALENDAR_TIME_ZONE}`,
    'BEGIN:VTIMEZONE',
    `TZID:${CALENDAR_TIME_ZONE}`,
    `X-LIC-LOCATION:${CALENDAR_TIME_ZONE}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(new Date(year, month, day, 12));
    const effectiveDay = resolveDay(dateKey);
    if (!effectiveDay.scheduleActive) continue;
    const shift = effectiveDay.shift;
    const dayException = effectiveDay.dayException;
    const note = includeNotes ? getNote(dateKey) : '';
    if (!shift || shift.isOff) {
      if (dayException) {
        lines.push(...allDayExceptionLines(dateKey, dayException, note, now));
      }
      continue;
    }
    lines.push(...eventLines(dateKey, shift, note, now, dayException));
  }
  lines.push('END:VCALENDAR');
  return `${lines.flatMap(foldIcsContentLine).join('\r\n')}\r\n`;
}

export function createWorkCalendarFileName(year: number, month: number): string {
  assertMonth(year, month);
  return `AlarmPyo-${year}-${String(month + 1).padStart(2, '0')}-근무표.ics`;
}

export async function exportWorkCalendarFile(
  contents: string,
  year: number,
  month: number,
): Promise<string> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('달력 파일을 만들 수 있는 저장 공간이 없어요.');
  }
  let sharingAvailable = false;
  try {
    sharingAvailable = await Sharing.isAvailableAsync();
  } catch {
    throw new Error('파일 공유 기능을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!sharingAvailable) {
    throw new Error('이 휴대폰에서는 달력 파일 공유를 사용할 수 없어요.');
  }

  const fileName = createWorkCalendarFileName(year, month);
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    throw new Error('달력 파일을 만들지 못했어요. 휴대폰 저장 공간을 확인해 주세요.');
  }
  try {
    await Sharing.shareAsync(uri, {
      dialogTitle: '알람표 달력 파일 공유·저장',
      mimeType: 'text/calendar',
      UTI: 'public.calendar-event',
    });
  } catch {
    throw new Error('달력 파일 공유 화면을 열지 못했어요. 공유할 앱을 확인해 주세요.');
  }
  return fileName;
}
