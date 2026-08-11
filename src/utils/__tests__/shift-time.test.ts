import { describe, expect, it } from 'vitest';

import {
  calculateAlarmMinutes,
  calculateShiftDuration,
  formatTimeInput,
  formatTimeInputWhileTyping,
  normalizeTimeInput,
  parseTimeInput,
} from '../shift-time';

describe('근무 시간 입력', () => {
  it('한 자리 시각과 두 자리 시각을 분으로 바꿔요', () => {
    expect(parseTimeInput('8:05')).toBe(485);
    expect(parseTimeInput('20:30')).toBe(1230);
  });

  it('콜론 없이 입력한 시간도 인식하고 네 자리 입력은 즉시 정리해요', () => {
    expect(parseTimeInput('700')).toBe(420);
    expect(parseTimeInput('0700')).toBe(420);
    expect(parseTimeInput('1800')).toBe(1080);
    expect(normalizeTimeInput('700')).toBe('07:00');
    expect(formatTimeInputWhileTyping('0700')).toBe('07:00');
    expect(formatTimeInputWhileTyping('700')).toBe('700');
  });

  it('실제로 존재하지 않는 시각은 거부해요', () => {
    expect(parseTimeInput('24:00')).toBeNull();
    expect(parseTimeInput('09:60')).toBeNull();
    expect(parseTimeInput('2460')).toBeNull();
    expect(parseTimeInput('99')).toBeNull();
  });

  it('종료 시각이 빠르면 다음 날 종료로 자동 계산해요', () => {
    expect(calculateShiftDuration(20 * 60, 8 * 60)).toEqual({
      durationMinutes: 12 * 60,
      endsNextDay: true,
    });
  });

  it('같은 시작과 종료 시각은 저장하지 않아요', () => {
    expect(calculateShiftDuration(8 * 60, 8 * 60)).toBeNull();
  });

  it('시간 입력용 두 자리 문자열을 만들어요', () => {
    expect(formatTimeInput(8 * 60 + 5)).toBe('08:05');
  });

  it('근무 시작 전 알람 시각을 자정 경계까지 계산해요', () => {
    expect(calculateAlarmMinutes(7 * 60, 120)).toBe(5 * 60);
    expect(calculateAlarmMinutes(18 * 60, 120)).toBe(16 * 60);
    expect(calculateAlarmMinutes(60, 120)).toBe(23 * 60);
  });
});
