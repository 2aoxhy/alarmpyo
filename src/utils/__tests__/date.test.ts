import { describe, expect, it } from 'vitest';

import { buildCalendarGrid, formatAlarmCountdown } from '../date';

describe('월간 달력 격자', () => {
  it('일요일 시작 6주 격자를 유지하고 현재 월 날짜를 정확히 표시합니다', () => {
    const cells = buildCalendarGrid(2026, 6);

    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({
      dateKey: '2026-06-28',
      day: 28,
      inCurrentMonth: false,
    });
    expect(cells[3]).toEqual({
      dateKey: '2026-07-01',
      day: 1,
      inCurrentMonth: true,
    });
    expect(cells[33]).toEqual({
      dateKey: '2026-07-31',
      day: 31,
      inCurrentMonth: true,
    });
    expect(cells[41]).toEqual({
      dateKey: '2026-08-08',
      day: 8,
      inCurrentMonth: false,
    });
    expect(cells.filter((cell) => cell.inCurrentMonth)).toHaveLength(31);
  });
});

describe('알람 남은 시간', () => {
  const now = Date.UTC(2026, 6, 12, 12, 0, 0);

  it.each([
    [30_000, '1분 뒤 울림'],
    [59 * 60_000, '59분 뒤 울림'],
    [60 * 60_000, '1시간 뒤 울림'],
    [61 * 60_000, '1시간 1분 뒤 울림'],
    [(24 * 60 + 1) * 60_000, '1일 1분 뒤 울림'],
    [(2 * 24 * 60 + 3 * 60 + 15) * 60_000, '2일 3시간 15분 뒤 울림'],
    [2 * 24 * 60 * 60_000, '2일 뒤 울림'],
  ])('%i밀리초 뒤 알람을 %s으로 표시합니다', (offset, expected) => {
    expect(formatAlarmCountdown(now + offset, now)).toBe(expected);
  });

  it('현재 시각과 지난 시각은 곧 울림으로 표시합니다', () => {
    expect(formatAlarmCountdown(now, now)).toBe('곧 울림');
    expect(formatAlarmCountdown(now - 60_000, new Date(now))).toBe('곧 울림');
  });
});
