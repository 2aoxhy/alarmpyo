import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DayExceptionType, ShiftType } from '../../models/app-data';
import {
  buildWorkCalendarIcs,
  createWorkCalendarFileName,
  exportWorkCalendarFile,
} from '../calendar-export-service';
import {
  createDefaultAppData,
  resolveEffectiveDayFromAppData,
  type EffectiveDay,
} from '../app-data-service';

const fileSystem = vi.hoisted(() => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
  EncodingType: { UTF8: 'utf8' },
}));
const sharing = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => fileSystem);
vi.mock('expo-sharing', () => sharing);

const DAY: ShiftType = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#000',
  softColor: '#fff',
  startMinutes: 7 * 60,
  endMinutes: 18 * 60,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 120,
};
const NIGHT: ShiftType = {
  ...DAY,
  id: 'night',
  name: '야간',
  shortName: '야',
  startMinutes: 18 * 60,
  endMinutes: 7 * 60,
  endsNextDay: true,
};

function effectiveDay(
  dateKey: string,
  shift: ShiftType | null,
  dayException?: DayExceptionType,
  scheduleActive = true,
): EffectiveDay {
  return {
    dateKey,
    scheduleActive,
    scheduledShift: shift,
    shift,
    dayException: scheduleActive ? dayException : undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sharing.isAvailableAsync.mockResolvedValue(true);
  fileSystem.writeAsStringAsync.mockResolvedValue(undefined);
  fileSystem.deleteAsync.mockResolvedValue(undefined);
  sharing.shareAsync.mockResolvedValue(undefined);
});

describe('근무표 달력 내보내기', () => {
  it('회사 활동표의 30분 올림과 별개로 달력에는 실제 퇴근 시각을 기록합니다', () => {
    const actualDay = { ...DAY, endMinutes: 17 * 60 + 45 };
    const actualNight = { ...NIGHT, endMinutes: 6 * 60 + 45 };
    const contents = buildWorkCalendarIcs({
      year: 2026,
      month: 6,
      resolveDay: (dateKey) =>
        effectiveDay(
          dateKey,
          dateKey === '2026-07-16'
            ? actualDay
            : dateKey === '2026-07-17'
              ? actualNight
              : null,
        ),
    });

    expect(contents).toContain('DTEND;TZID=Asia/Seoul:20260716T174500');
    expect(contents).toContain('DTEND;TZID=Asia/Seoul:20260718T064500');
  });

  it('휴무를 제외하고 주간과 익일 종료 야간 일정을 만들어요', () => {
    const contents = buildWorkCalendarIcs({
      year: 2026,
      month: 6,
      includeNotes: true,
      now: new Date('2026-07-01T00:00:00.000Z'),
      resolveDay: (dateKey) => {
        const shift =
          dateKey === '2026-07-11' || dateKey === '2026-07-14'
            ? DAY
            : dateKey === '2026-07-12'
              ? NIGHT
              : null;
        const dayException =
          dateKey === '2026-07-11'
            ? 'training'
            : dateKey === '2026-07-13'
              ? 'leave'
              : dateKey === '2026-07-14'
                ? 'reserve'
                : undefined;
        return effectiveDay(dateKey, shift, dayException);
      },
      getNote: (dateKey) => (dateKey === '2026-07-11' ? '인수인계, 확인' : ''),
    });

    expect(contents).toContain('X-WR-TIMEZONE:Asia/Seoul');
    expect(contents).toContain('PRODID:-//AlarmPyo//Shift Calendar//KO');
    expect(contents).toContain('X-WR-CALNAME:알람표 2026년 7월 근무표');
    expect(contents).toContain('BEGIN:VTIMEZONE');
    expect(contents).toContain('DTSTART;TZID=Asia/Seoul:20260711T070000');
    expect(contents).toContain('DTEND;TZID=Asia/Seoul:20260711T180000');
    expect(contents).toContain('DTSTART;TZID=Asia/Seoul:20260712T180000');
    expect(contents).toContain('DTEND;TZID=Asia/Seoul:20260713T070000');
    const unfolded = contents.replace(/\r\n[ \t]/g, '');
    expect(unfolded).toContain('인수인계\\, 확인');
    expect(contents).toContain('SUMMARY:알람표 교육 · 주간');
    expect(contents).toContain('DTSTART;VALUE=DATE:20260713');
    expect(contents).toContain('SUMMARY:알람표 연차');
    expect(contents).toContain('SUMMARY:알람표 예비군 · 주간');
    expect(contents).toContain('UID:alarmpyo-20260711@alarmpyo.expo.app');
    expect(contents.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(contents).not.toContain('BEGIN:VALARM');
    expect(contents).not.toContain('METHOD:');
  });

  it('개인 메모는 기본 제외하고 긴 한글과 이모지를 UTF-8 줄 경계에 맞춰 접어요', () => {
    const getNote = vi.fn(() => `긴 메모🙂,확인;${'가나다라마바사'.repeat(30)}\r마지막`);
    const base = {
      year: 2026,
      month: 6,
      now: new Date('2026-07-01T00:00:00.000Z'),
      resolveDay: (dateKey: string) =>
        effectiveDay(dateKey, dateKey === '2026-07-11' ? DAY : null),
      getNote,
    };

    const withoutNotes = buildWorkCalendarIcs(base);
    expect(withoutNotes).not.toContain('긴 메모');
    expect(getNote).not.toHaveBeenCalled();

    const contents = buildWorkCalendarIcs({ ...base, includeNotes: true });
    const physicalLines = contents.split('\r\n').filter(Boolean);
    expect(physicalLines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(physicalLines.some((line) => line.startsWith(' '))).toBe(true);
    const unfolded = contents.replace(/\r\n[ \t]/g, '');
    expect(unfolded).toContain('긴 메모🙂\\,확인\\;');
    expect(unfolded).toContain('\\n마지막');
    expect(unfolded).not.toContain('\r마지막');
  });

  it('첫 근무일 이전의 근무와 예외 일정은 달력에 만들지 않아요', () => {
    const data = createDefaultAppData('2026-07-15');
    data.dayExceptions['2026-07-10'] = 'reserve';
    data.dayExceptions['2026-07-15'] = 'training';
    const contents = buildWorkCalendarIcs({
      year: 2026,
      month: 6,
      resolveDay: (dateKey) => resolveEffectiveDayFromAppData(data, dateKey),
    });

    expect(contents).not.toContain('20260710');
    expect(contents).toContain('DTSTART;TZID=Asia/Seoul:20260715T070000');
    expect(contents).toContain('SUMMARY:알람표 교육 · 주간');
  });

  it('임시 달력 파일을 공유한 뒤 정리해요', async () => {
    await expect(exportWorkCalendarFile('달력', 2026, 6)).resolves.toBe(
      'AlarmPyo-2026-07-근무표.ics',
    );
    expect(fileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/AlarmPyo-2026-07-근무표.ics',
      '달력',
      { encoding: 'utf8' },
    );
    expect(sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/AlarmPyo-2026-07-근무표.ics',
      expect.objectContaining({ mimeType: 'text/calendar' }),
    );
    expect(createWorkCalendarFileName(2026, 6)).toBe('AlarmPyo-2026-07-근무표.ics');
  });

  it('파일 생성과 공유 오류를 이해하기 쉬운 문구로 알려요', async () => {
    sharing.isAvailableAsync.mockResolvedValueOnce(false);
    await expect(exportWorkCalendarFile('달력', 2026, 6)).rejects.toThrow(
      '달력 파일 공유를 사용할 수 없어요.',
    );

    fileSystem.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(exportWorkCalendarFile('달력', 2026, 6)).rejects.toThrow(
      '휴대폰 저장 공간을 확인해 주세요.',
    );

    sharing.shareAsync.mockRejectedValueOnce(new Error('activity unavailable'));
    await expect(exportWorkCalendarFile('달력', 2026, 6)).rejects.toThrow(
      '달력 파일 공유 화면을 열지 못했어요.',
    );
  });
});
