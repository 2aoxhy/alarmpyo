import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../app-data-service';
import { getWidgetScheduleSignature } from '../widget-schedule-signature';

describe('위젯 일정 서명', () => {
  it('날짜별 알람을 바꾸면 위젯의 다음 알람을 즉시 다시 계산해요', () => {
    const original = createDefaultAppData('2026-07-11');
    const changed = {
      ...original,
      alarmOverrides: {
        ...original.alarmOverrides,
        '2026-07-11': {
          mode: 'wake-time' as const,
          wakeMinutes: 5 * 60 + 10,
          wakeDayOffset: 0 as const,
        },
      },
    };

    expect(getWidgetScheduleSignature(changed)).not.toBe(
      getWidgetScheduleSignature(original),
    );
  });

  it('개인 메모와 네이티브 예약 결과만 바뀌면 위젯 일정을 다시 계산하지 않아요', () => {
    const original = createDefaultAppData('2026-07-11');
    const runtimeOnly = {
      ...original,
      notes: { '2026-07-11': '위젯과 무관한 메모' },
      settings: {
        ...original.settings,
        scheduledNotificationCount: 4,
        lastNotificationSyncAt: '2026-07-11T00:00:00.000Z',
      },
    };

    expect(getWidgetScheduleSignature(runtimeOnly)).toBe(
      getWidgetScheduleSignature(original),
    );
  });

  it('위젯 스냅샷에 쓰지 않는 표시 메타데이터와 설정은 무시해요', () => {
    const original = createDefaultAppData('2026-07-11');
    const irrelevant = {
      ...original,
      pattern: { ...original.pattern, name: '화면에만 쓰는 근무 방식 이름' },
      shiftTypes: original.shiftTypes.map((shift) => ({
        ...shift,
        shortName: `${shift.shortName}표시`,
        color: '#000000',
        softColor: '#ffffff',
      })),
      settings: {
        ...original.settings,
        sleepReminderEnabled: !original.settings.sleepReminderEnabled,
        themeMode: 'dark' as const,
        workRoutineProfiles: {
          day: {
            departMinutesBefore: 95,
            arriveMinutesBefore: 45,
            handoverMinutesBefore: 15,
          },
          evening: {
            departMinutesBefore: 90,
            arriveMinutesBefore: 40,
            handoverMinutesBefore: 10,
          },
          night: {
            departMinutesBefore: 90,
            arriveMinutesBefore: 40,
            handoverMinutesBefore: 10,
          },
        },
      },
    };

    expect(getWidgetScheduleSignature(irrelevant)).toBe(
      getWidgetScheduleSignature(original),
    );
  });

  it('다음 알람을 숨기면 알람 값은 무시하되 날짜별 변경 표시에 쓰는 키는 반영해요', () => {
    const original = createDefaultAppData('2026-07-11');
    const hiddenAlarm = {
      ...original,
      alarmOverrides: { '2026-07-11': { mode: 'disabled' as const } },
      settings: {
        ...original.settings,
        widgetDisplayOptions: {
          ...original.settings.widgetDisplayOptions,
          nextAlarm: false,
        },
      },
    };
    const changedValues = {
      ...hiddenAlarm,
      shiftTypes: hiddenAlarm.shiftTypes.map((shift) => ({
        ...shift,
        alarmEnabled: !shift.alarmEnabled,
        alarmMinutesBefore: shift.isOff ? 0 : shift.alarmMinutesBefore + 5,
      })),
      alarmOverrides: {
        '2026-07-11': {
          mode: 'wake-time' as const,
          wakeMinutes: 5 * 60 + 10,
          wakeDayOffset: 0 as const,
        },
      },
      settings: {
        ...hiddenAlarm.settings,
        notificationsEnabled: !hiddenAlarm.settings.notificationsEnabled,
      },
    };

    expect(getWidgetScheduleSignature(changedValues)).toBe(
      getWidgetScheduleSignature(hiddenAlarm),
    );
    expect(
      getWidgetScheduleSignature({
        ...changedValues,
        alarmOverrides: {
          ...changedValues.alarmOverrides,
          '2026-07-12': { mode: 'disabled' as const },
        },
      }),
    ).not.toBe(getWidgetScheduleSignature(hiddenAlarm));
  });

  it('다음 알람을 표시하면 알람 값 변경을 서명에 반영해요', () => {
    const original = createDefaultAppData('2026-07-11');
    const visibleAlarm = {
      ...original,
      alarmOverrides: { '2026-07-11': { mode: 'disabled' as const } },
      settings: {
        ...original.settings,
        widgetDisplayOptions: {
          ...original.settings.widgetDisplayOptions,
          nextAlarm: true,
        },
      },
    };
    const changed = {
      ...visibleAlarm,
      alarmOverrides: {
        '2026-07-11': {
          mode: 'wake-time' as const,
          wakeMinutes: 5 * 60 + 10,
          wakeDayOffset: 0 as const,
        },
      },
    };

    expect(getWidgetScheduleSignature(changed)).not.toBe(
      getWidgetScheduleSignature(visibleAlarm),
    );
  });

  it('같은 날짜별 알람을 다른 순서로 저장해도 다시 동기화하지 않아요', () => {
    const original = createDefaultAppData('2026-07-11');
    const first = {
      ...original,
      alarmOverrides: {
        '2026-07-11': { mode: 'disabled' as const },
        '2026-07-12': {
          mode: 'wake-time' as const,
          wakeMinutes: 5 * 60 + 10,
          wakeDayOffset: 0 as const,
        },
      },
    };
    const reordered = {
      ...first,
      alarmOverrides: {
        '2026-07-12': first.alarmOverrides['2026-07-12'],
        '2026-07-11': first.alarmOverrides['2026-07-11'],
      },
    };

    expect(getWidgetScheduleSignature(reordered)).toBe(
      getWidgetScheduleSignature(first),
    );
  });
});
