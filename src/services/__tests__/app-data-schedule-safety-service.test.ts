import { describe, expect, it } from 'vitest';

import type { AppData, ShiftType } from '../../models/app-data';
import {
  analyzeActualAppDataScheduleSafety,
  analyzeActualAppDataScheduleSafetyForDates,
} from '../app-data-schedule-safety-service';
import { createDefaultAppData } from '../app-data-service';

const NOW = new Date(2026, 7, 15, 12, 0, 0, 0);

function withShift(
  data: AppData,
  shiftTypeId: string,
  patch: Partial<ShiftType>,
): AppData {
  return {
    ...data,
    shiftTypes: data.shiftTypes.map((shift) =>
      shift.id === shiftTypeId ? { ...shift, ...patch } : shift,
    ),
  };
}

function withPattern(data: AppData, shiftTypeIds: string[], startDate = '2026-08-15'): AppData {
  return {
    ...data,
    pattern: {
      ...data.pattern,
      anchorDate: startDate,
      scheduleStartDate: startDate,
      shiftTypeIds,
    },
  };
}

function makeNightThenOffData(): AppData {
  let data = withPattern(createDefaultAppData('2026-08-15'), ['night', 'off', 'off']);
  data = withShift(data, 'night', {
    alarmEnabled: false,
    startMinutes: 18 * 60,
    endMinutes: 7 * 60,
    endsNextDay: true,
  });
  data = withShift(data, 'day', {
    alarmEnabled: true,
    alarmMinutesBefore: 60,
    startMinutes: 7 * 60,
    endMinutes: 18 * 60,
    endsNextDay: false,
  });
  return data;
}

describe('actual AppData schedule safety', () => {
  it('treats touching night/day boundaries as safe when their alarms are disabled', () => {
    let data = withPattern(createDefaultAppData('2026-08-15'), ['night', 'day']);
    data = withShift(data, 'night', {
      alarmEnabled: false,
      startMinutes: 18 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
    });
    data = withShift(data, 'day', {
      alarmEnabled: false,
      startMinutes: 7 * 60,
      endMinutes: 18 * 60,
      endsNextDay: false,
    });

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.window).toEqual({
      startDateKey: '2026-08-13',
      endDateKey: '2027-08-16',
    });
  });

  it('blocks alarm opt-in when next-day training alarm rings during the previous night shift', () => {
    const data = makeNightThenOffData();
    data.dayExceptions['2026-08-16'] = 'training';

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'alarm-during-previous-shift',
      dateKey: '2026-08-16',
      shiftTypeId: 'day',
      source: 'effective-day',
      previousDateKey: '2026-08-15',
      previousShiftTypeId: 'night',
    });
  });

  it('applies a direct day override before checking the previous overnight shift', () => {
    const data = makeNightThenOffData();
    data.overrides['2026-08-16'] = 'day';

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'alarm-during-previous-shift',
      dateKey: '2026-08-16',
      shiftTypeId: 'day',
      source: 'effective-day',
      previousDateKey: '2026-08-15',
      previousShiftTypeId: 'night',
    });
  });

  it('blocks saving when a date timeOverride moves the next shift into the previous night', () => {
    let data = withPattern(createDefaultAppData('2026-08-15'), ['night', 'day', 'off']);
    data = withShift(data, 'night', {
      alarmEnabled: false,
      startMinutes: 18 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
    });
    data = withShift(data, 'day', {
      alarmEnabled: false,
      startMinutes: 7 * 60,
      endMinutes: 18 * 60,
      endsNextDay: false,
    });
    data.timeOverrides['2026-08-16'] = {
      shiftTypeId: 'day',
      startMinutes: 6 * 60 + 30,
      endMinutes: 18 * 60,
      endsNextDay: false,
    };

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(false);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'work-overlap',
      dateKey: '2026-08-16',
      shiftTypeId: 'day',
      source: 'effective-day',
      previousDateKey: '2026-08-15',
      previousShiftTypeId: 'night',
    });
  });

  it('uses a per-day wake-time alarmOverride instead of the safe global lead time', () => {
    let data = withPattern(createDefaultAppData('2026-08-15'), ['night', 'day', 'off']);
    data = withShift(data, 'night', {
      alarmEnabled: false,
      startMinutes: 18 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
    });
    data = withShift(data, 'day', {
      alarmEnabled: true,
      alarmMinutesBefore: 30,
      startMinutes: 8 * 60,
      endMinutes: 18 * 60,
      endsNextDay: false,
    });
    data.alarmOverrides['2026-08-16'] = {
      mode: 'wake-time',
      wakeMinutes: 6 * 60 + 30,
      wakeDayOffset: 0,
    };

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'alarm-during-previous-shift',
      dateKey: '2026-08-16',
      shiftTypeId: 'day',
      source: 'effective-day',
      previousDateKey: '2026-08-15',
      previousShiftTypeId: 'night',
    });
  });

  it('preserves an active legacy ID but fails closed for native alarms', () => {
    const legacyShift: ShiftType = {
      ...createDefaultAppData('2026-08-15').shiftTypes.find((shift) => shift.id === 'evening')!,
      id: 'legacy-evening',
      name: '이전 사용자 근무',
    };
    let data = createDefaultAppData('2026-08-15');
    data = {
      ...withPattern(data, ['legacy-evening', 'off']),
      shiftTypes: [...data.shiftTypes, legacyShift],
    };

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.unsupportedShiftTypeIds).toEqual(['legacy-evening']);
    expect(result.issues).toContainEqual({
      code: 'unsupported-shift-type',
      dateKey: '2026-08-15',
      shiftTypeId: 'legacy-evening',
      source: 'pattern',
    });
  });

  it('ignores an unknown direct override before the schedule start date', () => {
    const data = withPattern(createDefaultAppData('2026-08-20'), ['day', 'off'], '2026-08-20');
    data.overrides['2026-08-19'] = 'legacy-unknown';

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(true);
    expect(result.unsupportedShiftTypeIds).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('checks one full cycle even when the schedule starts beyond the native horizon', () => {
    let data = withPattern(createDefaultAppData('2028-01-01'), ['night', 'day', 'off'], '2028-01-01');
    data = withShift(data, 'night', {
      alarmEnabled: false,
      startMinutes: 18 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
    });
    data = withShift(data, 'day', {
      alarmEnabled: true,
      alarmMinutesBefore: 60,
      startMinutes: 7 * 60,
      endMinutes: 18 * 60,
      endsNextDay: false,
    });

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'alarm-during-previous-shift',
      dateKey: '2028-01-02',
      shiftTypeId: 'day',
      source: 'effective-day',
      previousDateKey: '2028-01-01',
      previousShiftTypeId: 'night',
    });
  });

  it('checks far saveDays candidates with a focused actual-date neighborhood', () => {
    let data = withPattern(createDefaultAppData('2026-08-15'), ['off']);
    data = withShift(data, 'night', {
      alarmEnabled: false,
      startMinutes: 18 * 60,
      endMinutes: 7 * 60,
      endsNextDay: true,
    });
    data = withShift(data, 'day', {
      alarmEnabled: true,
      alarmMinutesBefore: 60,
      startMinutes: 7 * 60,
      endMinutes: 18 * 60,
      endsNextDay: false,
    });
    data.overrides['2030-01-01'] = 'night';
    data.overrides['2030-01-02'] = 'day';

    const result = analyzeActualAppDataScheduleSafetyForDates(
      data,
      ['2030-01-01', '2030-01-02'],
      { now: NOW },
    );

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'alarm-during-previous-shift',
      dateKey: '2030-01-02',
      shiftTypeId: 'day',
      source: 'effective-day',
      previousDateKey: '2030-01-01',
      previousShiftTypeId: 'night',
    });
  });

  it('fails saving before a malformed per-day work time reaches Date parsing', () => {
    const data = withPattern(createDefaultAppData('2026-08-15'), ['day', 'off']);
    data.timeOverrides['2026-08-15'] = {
      shiftTypeId: 'day',
      startMinutes: 7 * 60,
      endMinutes: 7 * 60,
      endsNextDay: false,
    };

    const result = analyzeActualAppDataScheduleSafety(data, { now: NOW });

    expect(result.canSave).toBe(false);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'invalid-shift-time',
      dateKey: '2026-08-15',
      shiftTypeId: 'day',
      source: 'time-override',
    });
  });
});
