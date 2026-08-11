import type { AppData } from '../models/app-data';

/** 위젯 스냅샷의 일정·다음 알람·표시 선택을 바꿀 수 있는 입력만 직렬화해요. */
export function getWidgetScheduleSignature(data: AppData): string {
  const includesNextAlarm = data.settings.widgetDisplayOptions.nextAlarm;
  const orderedAlarmOverrides = Object.entries(data.alarmOverrides).sort(
    ([leftDate], [rightDate]) =>
      leftDate < rightDate ? -1 : leftDate > rightDate ? 1 : 0,
  );
  return JSON.stringify({
    dayExceptions: data.dayExceptions,
    overrides: data.overrides,
    pattern: {
      anchorDate: data.pattern.anchorDate,
      scheduleStartDate: data.pattern.scheduleStartDate,
      shiftTypeIds: data.pattern.shiftTypeIds,
    },
    shiftTypes: data.shiftTypes.map((shift) => ({
      id: shift.id,
      name: shift.name,
      startMinutes: shift.startMinutes,
      endMinutes: shift.endMinutes,
      endsNextDay: shift.endsNextDay,
      isOff: shift.isOff,
      ...(includesNextAlarm
        ? {
            alarmEnabled: shift.alarmEnabled,
            alarmMinutesBefore: shift.alarmMinutesBefore,
          }
        : {}),
    })),
    timeOverrides: data.timeOverrides,
    alarmOverrides: includesNextAlarm
      ? orderedAlarmOverrides.map(([dateKey, override]) =>
          override.mode === 'disabled'
            ? [dateKey, override.mode]
            : [
                dateKey,
                override.mode,
                override.wakeMinutes,
                override.wakeDayOffset,
              ],
        )
      : orderedAlarmOverrides.map(([dateKey]) => dateKey),
    notificationsEnabled:
      includesNextAlarm && data.settings.notificationsEnabled,
    setupCompleted: data.settings.setupCompleted,
    widgetDisplayOptions: data.settings.widgetDisplayOptions,
  });
}
