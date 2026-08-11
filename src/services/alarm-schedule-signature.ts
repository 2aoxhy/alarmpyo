import type { AppData } from '../models/app-data';

/** 실제 예약 결과가 달라질 수 있는 입력만 안정적인 문자열로 만들어요. */
export function getAlarmScheduleSignature(data: AppData): string {
  return JSON.stringify({
    shiftTypes: data.shiftTypes,
    pattern: data.pattern,
    overrides: data.overrides,
    timeOverrides: data.timeOverrides,
    dayExceptions: data.dayExceptions,
    alarmOverrides: data.alarmOverrides,
    setupCompleted: data.settings.setupCompleted,
    alarmsEnabled: data.settings.notificationsEnabled,
  });
}
