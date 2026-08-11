import { describe, expect, it } from 'vitest';

import {
  DAY_SHIFT_END_MINUTES,
  DAY_SHIFT_START_MINUTES,
  NIGHT_SHIFT_END_MINUTES,
  NIGHT_SHIFT_START_MINUTES,
} from '../../constants/shift-schedule';
import {
  createDefaultShiftTypes,
  createDefaultWorkShift,
} from '../app-data-defaults';

describe('app-data-defaults', () => {
  it('운영 중인 기본 근무 종류와 시간을 그대로 만들어요', () => {
    const shifts = createDefaultShiftTypes();
    expect(shifts.map((shift) => shift.id)).toEqual([
      'day',
      'night',
      'substitute-day',
      'substitute-night',
      'off',
    ]);
    expect(createDefaultWorkShift('day')).toMatchObject({
      startMinutes: DAY_SHIFT_START_MINUTES,
      endMinutes: DAY_SHIFT_END_MINUTES,
      endsNextDay: false,
    });
    expect(createDefaultWorkShift('night')).toMatchObject({
      startMinutes: NIGHT_SHIFT_START_MINUTES,
      endMinutes: NIGHT_SHIFT_END_MINUTES,
      endsNextDay: true,
    });
  });

  it('호출할 때마다 독립된 근무 객체를 반환해요', () => {
    const first = createDefaultShiftTypes();
    const second = createDefaultShiftTypes();
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});
