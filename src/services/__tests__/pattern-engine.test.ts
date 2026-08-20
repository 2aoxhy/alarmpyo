import { describe, expect, it } from 'vitest';

import {
  createDefaultAppData,
  resolveEffectiveDayFromAppData,
} from '../app-data-service';
import {
  applyScheduleOverrides,
  calculatePatternPosition,
  explainPatternDate,
  resolveAlarmSettingsForShift,
  resolveEffectiveDay,
} from '../pattern-engine';

describe('PatternEngine', () => {
  it('기준일 이전과 이후의 순번을 안정적인 양수 나머지로 계산합니다', () => {
    const pattern = {
      anchorDate: '2026-08-03',
      shiftTypeIds: ['day', 'night', 'off'],
    };
    expect(calculatePatternPosition(pattern, '2026-08-03')).toBe(0);
    expect(calculatePatternPosition(pattern, '2026-08-02')).toBe(2);
    expect(calculatePatternPosition(pattern, '2026-08-07')).toBe(1);
  });

  it('반복 순서, 직접 변경, 날짜별 시간을 한 번에 합성합니다', () => {
    const data = createDefaultAppData('2026-08-01');
    data.overrides['2026-08-01'] = 'night';
    data.timeOverrides['2026-08-01'] = {
      shiftTypeId: 'night',
      startMinutes: 20 * 60,
      endMinutes: 8 * 60,
      endsNextDay: true,
    };
    const shift = applyScheduleOverrides(data, '2026-08-01');
    const explanation = explainPatternDate(data, '2026-08-01');

    expect(shift).toMatchObject({
      id: 'night',
      startMinutes: 20 * 60,
      endMinutes: 8 * 60,
    });
    expect(explanation).toMatchObject({
      patternPosition: 0,
      patternShiftTypeId: 'day',
      overrideApplied: true,
      timeOverrideApplied: true,
      scheduledShiftTypeId: 'night',
      effectiveShiftTypeId: 'night',
      alarmPolicy: 'shift',
      alarmSourceShiftId: 'night',
    });
    expect(explanation).not.toHaveProperty('shift');
    expect(explanation).not.toHaveProperty('notes');
    expect(explanation).not.toHaveProperty('alarmMinutesBefore');
  });

  it('기존 AppData wrapper와 최종 일정 결과가 같습니다', () => {
    const data = createDefaultAppData('2026-08-01');
    data.dayExceptions['2026-08-01'] = 'training';
    expect(resolveEffectiveDay(data, '2026-08-01')).toEqual(
      resolveEffectiveDayFromAppData(data, '2026-08-01'),
    );
  });

  it('주대와 야대는 각각 주간과 야간의 알람 설정을 참조합니다', () => {
    const data = createDefaultAppData('2026-08-01');
    const day = data.shiftTypes.find((shift) => shift.id === 'day')!;
    const night = data.shiftTypes.find((shift) => shift.id === 'night')!;
    const substituteDay = data.shiftTypes.find((shift) => shift.id === 'substitute-day')!;
    const substituteNight = data.shiftTypes.find((shift) => shift.id === 'substitute-night')!;
    day.alarmEnabled = false;
    day.alarmMinutesBefore = 45;
    night.alarmEnabled = true;
    night.alarmMinutesBefore = 95;
    substituteDay.alarmEnabled = true;
    substituteDay.alarmMinutesBefore = 10;
    substituteNight.alarmEnabled = false;
    substituteNight.alarmMinutesBefore = 20;

    expect(resolveAlarmSettingsForShift(data.shiftTypes, substituteDay)).toEqual({
      sourceShiftId: 'day',
      alarmEnabled: false,
      alarmMinutesBefore: 45,
    });
    expect(resolveAlarmSettingsForShift(data.shiftTypes, substituteNight)).toEqual({
      sourceShiftId: 'night',
      alarmEnabled: true,
      alarmMinutesBefore: 95,
    });
  });
});
