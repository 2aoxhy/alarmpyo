import { describe, expect, it } from 'vitest';

import type { ShiftType } from '../../../models/app-data';
import {
  areDayAlarmOverridesEqual,
  calculateWakeLeadMinutes,
  createDayAlarmDraft,
  formatDayAlarmOverrideSummary,
  getDefaultWakeTime,
  resolveDayAlarmDraft,
} from '../day-alarm-settings-model';

const shift: ShiftType = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#00A58A',
  softColor: '#DDF8F2',
  startMinutes: 7 * 60,
  endMinutes: 18 * 60,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 110,
};

describe('하루 알람 설정 모델', () => {
  it('기본 알람을 근무일의 당일 기상 시각으로 표시해요', () => {
    expect(getDefaultWakeTime(shift)).toEqual({
      wakeMinutes: 5 * 60 + 10,
      wakeDayOffset: 0,
    });
    expect(formatDayAlarmOverrideSummary(null, shift)).toBe(
      '당일 05:10 · 기본 설정',
    );
  });

  it('자정 전 알람은 전날로 명확하게 표시해요', () => {
    const earlyShift = { ...shift, startMinutes: 60, alarmMinutesBefore: 120 };
    expect(getDefaultWakeTime(earlyShift)).toEqual({
      wakeMinutes: 23 * 60,
      wakeDayOffset: -1,
    });
    expect(formatDayAlarmOverrideSummary(null, earlyShift)).toBe(
      '전날 23:00 · 기본 설정',
    );
  });

  it('저장된 날짜별 설정을 편집 초깃값으로 변환해요', () => {
    expect(
      createDayAlarmDraft(
        { mode: 'wake-time', wakeMinutes: 4 * 60 + 40, wakeDayOffset: 0 },
        shift,
      ),
    ).toEqual({ mode: 'wake-time', wakeTime: '04:40', wakeDayOffset: 0 });
    expect(
      formatDayAlarmOverrideSummary(
        { mode: 'wake-time', wakeMinutes: 23 * 60, wakeDayOffset: -1 },
        shift,
      ),
    ).toBe('전날 23:00 · 이날만 설정');
  });

  it('근무 시작 뒤이거나 24시간보다 이른 기상 시각을 거절해요', () => {
    expect(calculateWakeLeadMinutes(7 * 60, 8 * 60, 0)).toBeNull();
    expect(calculateWakeLeadMinutes(7 * 60, 6 * 60, -1)).toBeNull();
    expect(calculateWakeLeadMinutes(7 * 60, 7 * 60, -1)).toBe(1440);
  });

  it('입력한 기상 시각을 날짜별 알람 예외로 변환해요', () => {
    expect(
      resolveDayAlarmDraft(
        { mode: 'wake-time', wakeTime: '0510', wakeDayOffset: 0 },
        shift.startMinutes,
      ),
    ).toEqual({
      valid: true,
      override: { mode: 'wake-time', wakeMinutes: 310, wakeDayOffset: 0 },
      leadMinutes: 110,
    });
    expect(
      resolveDayAlarmDraft(
        { mode: 'wake-time', wakeTime: '08:00', wakeDayOffset: 0 },
        shift.startMinutes,
      ),
    ).toEqual({
      valid: false,
      message: '기상 시각은 근무 시작 전 24시간 안으로 지정해야 합니다.',
    });
  });

  it('기본값과 같은 값이어도 날짜별 설정 여부를 구분해요', () => {
    expect(areDayAlarmOverridesEqual(null, undefined)).toBe(true);
    expect(
      areDayAlarmOverridesEqual(null, {
        mode: 'wake-time',
        wakeMinutes: 310,
        wakeDayOffset: 0,
      }),
    ).toBe(false);
    expect(
      areDayAlarmOverridesEqual(
        { mode: 'disabled' },
        { mode: 'disabled' },
      ),
    ).toBe(true);
  });
});
