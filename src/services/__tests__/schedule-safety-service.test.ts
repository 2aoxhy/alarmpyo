import { describe, expect, it } from 'vitest';

import { analyzeScheduleSafety, type ScheduleSafetyShift } from '../schedule-safety-service';

const shift = (
  startMinutes: number,
  endMinutes: number,
  alarmMinutesBefore = 110,
): ScheduleSafetyShift => ({
  alarmEnabled: true,
  alarmMinutesBefore,
  endMinutes,
  startMinutes,
});

describe('schedule safety', () => {
  it('allows a rotation with enough rest between work and the next alarm', () => {
    const result = analyzeScheduleSafety({
      sequence: ['day', 'day', 'night', 'night', 'off', 'off'],
      shifts: {
        day: shift(7 * 60, 19 * 60),
        evening: shift(15 * 60, 23 * 60),
        night: shift(19 * 60, 7 * 60),
      },
    });

    expect(result).toEqual({ canEnableAlarms: true, canSave: true, issues: [] });
  });

  it('blocks alarm opt-in when the two-team cycle alarm fires during the previous night shift', () => {
    const result = analyzeScheduleSafety({
      sequence: ['day', 'night'],
      shifts: {
        day: shift(7 * 60, 19 * 60),
        evening: shift(15 * 60, 23 * 60),
        night: shift(19 * 60, 7 * 60),
      },
    });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'alarm-during-previous-shift',
      previousSequenceIndex: 1,
      previousShiftTypeId: 'night',
      sequenceIndex: 0,
      shiftTypeId: 'day',
    });
  });

  it('checks the three-shift cycle boundary instead of only same-day pairs', () => {
    const result = analyzeScheduleSafety({
      sequence: ['day', 'evening', 'night'],
      shifts: {
        day: shift(7 * 60, 15 * 60),
        evening: shift(15 * 60, 23 * 60),
        night: shift(23 * 60, 7 * 60),
      },
    });

    expect(result.canSave).toBe(true);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'alarm-during-previous-shift')).toBe(true);
  });

  it('blocks saving when an overnight shift overlaps the next work interval', () => {
    const result = analyzeScheduleSafety({
      sequence: ['night', 'day', 'off'],
      shifts: {
        day: shift(6 * 60 + 45, 17 * 60 + 45),
        evening: shift(15 * 60, 23 * 60),
        night: shift(18 * 60, 7 * 60),
      },
    });

    expect(result.canSave).toBe(false);
    expect(result.canEnableAlarms).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'work-overlap',
      previousSequenceIndex: 0,
      previousShiftTypeId: 'night',
      sequenceIndex: 1,
      shiftTypeId: 'day',
    });
  });

  it('reports the earlier interval that extends furthest across the next start', () => {
    const result = analyzeScheduleSafety({
      sequence: ['night', 'day', 'off'],
      shifts: {
        day: shift(6 * 60, 18 * 60),
        evening: shift(15 * 60, 23 * 60),
        night: shift(18 * 60, 7 * 60),
      },
    });

    expect(result.issues).toContainEqual({
      code: 'work-overlap',
      previousSequenceIndex: 0,
      previousShiftTypeId: 'night',
      sequenceIndex: 1,
      shiftTypeId: 'day',
    });
  });

  it('treats touching work intervals as non-overlapping when alarms are disabled', () => {
    const disabledAlarm = (startMinutes: number, endMinutes: number): ScheduleSafetyShift => ({
      ...shift(startMinutes, endMinutes),
      alarmEnabled: false,
    });
    const result = analyzeScheduleSafety({
      sequence: ['day', 'night'],
      shifts: {
        day: disabledAlarm(7 * 60, 19 * 60),
        evening: disabledAlarm(15 * 60, 23 * 60),
        night: disabledAlarm(19 * 60, 7 * 60),
      },
    });

    expect(result).toEqual({ canEnableAlarms: true, canSave: true, issues: [] });
  });

  it('rejects missing and zero-length active shift times', () => {
    const result = analyzeScheduleSafety({
      sequence: ['day', 'off'],
      shifts: {
        day: shift(420, 420),
        evening: shift(900, 1380),
        night: shift(1380, 420),
      },
    });

    expect(result.canSave).toBe(false);
    expect(result.issues).toEqual([
      { code: 'invalid-shift-time', sequenceIndex: 0, shiftTypeId: 'day' },
    ]);
  });
});
