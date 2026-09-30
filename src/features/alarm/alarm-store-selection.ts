import type { AppData } from '../../models/app-data';

export const selectAlarmSettingsData = (store: { data: AppData }) => store.data;

export function areAlarmSettingsDataEqual(a: AppData, b: AppData): boolean {
  return a.shiftTypes === b.shiftTypes && a.pattern === b.pattern &&
    a.overrides === b.overrides && a.timeOverrides === b.timeOverrides &&
    a.dayExceptions === b.dayExceptions && a.alarmOverrides === b.alarmOverrides &&
    a.settings.setupCompleted === b.settings.setupCompleted &&
    a.settings.notificationsEnabled === b.settings.notificationsEnabled &&
    a.settings.sleepReminderEnabled === b.settings.sleepReminderEnabled &&
    a.settings.scheduledNotificationCount === b.settings.scheduledNotificationCount &&
    a.settings.lastNotificationSyncAt === b.settings.lastNotificationSyncAt &&
    a.settings.workRoutineProfiles === b.settings.workRoutineProfiles;
}
