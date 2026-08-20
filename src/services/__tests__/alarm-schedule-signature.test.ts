import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../app-data-service';
import { getAlarmScheduleSignature } from '../alarm-schedule-signature';

describe('알람 일정 서명', () => {
  it('교육 추가와 삭제를 알람 재예약이 필요한 변경으로 판단합니다', () => {
    const original = createDefaultAppData('2026-07-11');
    const training = {
      ...original,
      dayExceptions: { ...original.dayExceptions, '2026-07-13': 'training' as const },
    };

    expect(getAlarmScheduleSignature(training)).not.toBe(
      getAlarmScheduleSignature(original),
    );
  });

  it('예약 결과 메타데이터만 바뀌면 근무 계획이 바뀐 것으로 보지 않습니다', () => {
    const original = createDefaultAppData('2026-07-11');
    const runtimeUpdated = {
      ...original,
      settings: {
        ...original.settings,
        scheduledNotificationCount: 3,
        lastNotificationSyncAt: new Date(2026, 6, 11, 12, 0).toISOString(),
      },
    };

    expect(getAlarmScheduleSignature(runtimeUpdated)).toBe(
      getAlarmScheduleSignature(original),
    );
  });

  it('개인 메모만 바뀌면 근무 알람을 다시 예약하지 않습니다', () => {
    const original = createDefaultAppData('2026-07-11');
    const noteChanged = {
      ...original,
      notes: {
        ...original.notes,
        '2026-07-13': '개인 메모',
      },
    };

    expect(getAlarmScheduleSignature(noteChanged)).toBe(
      getAlarmScheduleSignature(original),
    );
  });

  it('날짜별 알람을 바꾸면 근무 알람을 다시 예약해요', () => {
    const original = createDefaultAppData('2026-07-11');
    const changed = {
      ...original,
      alarmOverrides: {
        '2026-07-11': {
          mode: 'wake-time' as const,
          wakeMinutes: 5 * 60 + 10,
          wakeDayOffset: 0 as const,
        },
      },
    };

    expect(getAlarmScheduleSignature(changed)).not.toBe(
      getAlarmScheduleSignature(original),
    );
  });

  it('사용하지 않는 대체근무 알람 저장값만 바뀌면 다시 예약하지 않습니다', () => {
    const original = createDefaultAppData('2026-07-11');
    const legacyValueChanged = {
      ...original,
      shiftTypes: original.shiftTypes.map((shift) =>
        shift.id === 'substitute-day'
          ? { ...shift, alarmEnabled: !shift.alarmEnabled, alarmMinutesBefore: 1 }
          : shift,
      ),
    };
    const dayChanged = {
      ...original,
      shiftTypes: original.shiftTypes.map((shift) =>
        shift.id === 'day'
          ? { ...shift, alarmMinutesBefore: shift.alarmMinutesBefore + 1 }
          : shift,
      ),
    };

    expect(getAlarmScheduleSignature(legacyValueChanged)).toBe(
      getAlarmScheduleSignature(original),
    );
    expect(getAlarmScheduleSignature(dayChanged)).not.toBe(
      getAlarmScheduleSignature(original),
    );
  });
});
