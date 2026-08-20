import type { AppData } from '../models/app-data';
import { resolveAlarmSettingsForShift } from './pattern-engine';

const BUILT_IN_WIDGET_SHIFT_IDS = new Set([
  'day',
  'evening',
  'night',
  'off',
  'substitute-day',
  'substitute-night',
]);

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
    shiftTypes: data.shiftTypes.map((shift) => {
      const alarmSettings = resolveAlarmSettingsForShift(data.shiftTypes, shift);
      return {
        id: shift.id,
        name: shift.name,
        startMinutes: shift.startMinutes,
        endMinutes: shift.endMinutes,
        endsNextDay: shift.endsNextDay,
        isOff: shift.isOff,
        ...(!shift.isOff && !BUILT_IN_WIDGET_SHIFT_IDS.has(shift.id)
          ? { color: shift.color }
          : {}),
        ...(includesNextAlarm
          ? {
              alarmEnabled: alarmSettings.alarmEnabled,
              alarmMinutesBefore: alarmSettings.alarmMinutesBefore,
            }
          : {}),
      };
    }),
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
