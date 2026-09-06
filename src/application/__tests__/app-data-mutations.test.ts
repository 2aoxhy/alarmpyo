import { describe, expect, it } from 'vitest';

import type { AppData, RotationPattern, ShiftType } from '@/models/app-data';
import {
  applyShiftTypePatch,
  arePatternExecutionsEqual,
  areRotationPatternsEqual,
  withAlarmRuntimeState,
} from '../app-data-mutations';

const rotation: RotationPattern = {
  anchorDate: '2026-08-09',
  name: '3조 2교대 (주주야야휴휴)',
  scheduleStartDate: '2026-08-09',
  shiftTypeIds: ['day', 'day', 'night', 'night', 'off', 'off'],
};

const shift: ShiftType = {
  alarmEnabled: true,
  alarmMinutesBefore: 120,
  color: '#00A88F',
  endMinutes: 18 * 60,
  endsNextDay: false,
  id: 'day',
  isOff: false,
  name: '주간',
  shortName: '주',
  softColor: '#DDF8F1',
  startMinutes: 7 * 60,
};

describe('app-data-mutations', () => {
  it('동일한 근무 패턴을 같은 값으로 판단해요', () => {
    expect(areRotationPatternsEqual(rotation, { ...rotation })).toBe(true);
    expect(
      areRotationPatternsEqual(rotation, {
        ...rotation,
        shiftTypeIds: [...rotation.shiftTypeIds].reverse(),
      }),
    ).toBe(false);
  });

  it('같은 배열이어도 평일 고정과 기준일 회전을 다른 실행으로 판단해요', () => {
    const weekday: RotationPattern = {
      anchorDate: '2026-08-09',
      kind: 'weekday',
      name: '주간 고정',
      shiftTypeIds: ['off', 'day', 'day', 'day', 'day', 'day', 'off'],
    };

    expect(
      arePatternExecutionsEqual(weekday, { ...weekday, kind: 'rotation' }),
    ).toBe(false);
    expect(arePatternExecutionsEqual(weekday, { ...weekday })).toBe(true);
  });

  it('종류가 없는 이전 사용자 순서는 rotation으로 정규화해요', () => {
    const legacyCustom: RotationPattern = {
      anchorDate: '2026-08-09',
      name: '사용자 순서',
      shiftTypeIds: ['day', 'day', 'night', 'off'],
    };

    expect(
      arePatternExecutionsEqual(legacyCustom, {
        ...legacyCustom,
        kind: 'rotation',
      }),
    ).toBe(true);
  });

  it('변경이 없으면 기존 근무 참조를 유지해요', () => {
    expect(applyShiftTypePatch(shift, { name: '주간' })).toBe(shift);
    expect(applyShiftTypePatch(shift, { name: '주간 근무' })).toEqual({
      ...shift,
      name: '주간 근무',
    });
  });

  it('알람 실행 상태만 불변 방식으로 갱신해요', () => {
    const data = {
      settings: {
        lastNotificationSyncAt: null,
        scheduledNotificationCount: 0,
      },
    } as AppData;

    expect(withAlarmRuntimeState(data, 0, null)).toBe(data);
    const updated = withAlarmRuntimeState(data, 3, '2026-08-09T00:00:00.000Z');
    expect(updated).not.toBe(data);
    expect(updated.settings.scheduledNotificationCount).toBe(3);
    expect(updated.settings.lastNotificationSyncAt).toBe(
      '2026-08-09T00:00:00.000Z',
    );
  });
});
