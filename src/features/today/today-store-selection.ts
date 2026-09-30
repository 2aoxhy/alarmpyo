import type { AppData } from '../../models/app-data';
import type { AppStore } from '../../application/app-store-contract';

export const selectTodayData = (store: { data: AppData }) => store.data;
export const selectTodayReady = (store: { ready: boolean }) => store.ready;

/** Only inputs read by Today/sleep/routine/alarm projections belong here. */
export function areTodayDataEqual(a: AppData, b: AppData): boolean {
  return a.version === b.version && a.shiftTypes === b.shiftTypes && a.pattern === b.pattern &&
    a.overrides === b.overrides && a.timeOverrides === b.timeOverrides &&
    a.dayExceptions === b.dayExceptions && a.alarmOverrides === b.alarmOverrides &&
    a.settings.setupCompleted === b.settings.setupCompleted &&
    a.settings.notificationsEnabled === b.settings.notificationsEnabled &&
    a.settings.sleepReminderEnabled === b.settings.sleepReminderEnabled &&
    a.settings.scheduledNotificationCount === b.settings.scheduledNotificationCount &&
    a.settings.lastNotificationSyncAt === b.settings.lastNotificationSyncAt &&
    a.settings.workRoutineProfiles === b.settings.workRoutineProfiles;
}

export function selectTodayStatus(store: AppStore) {
  return {
    alarmAutoCheckState: store.alarmAutoCheckState,
    alarmSyncStatus: store.alarmSyncStatus,
    sleepReminderSyncStatus: store.sleepReminderSyncStatus,
    sleepReminderSyncRevision: store.sleepReminderSyncRevision,
  };
}

export function areTodayStatusEqual(a: ReturnType<typeof selectTodayStatus>, b: ReturnType<typeof selectTodayStatus>) {
  return a.alarmAutoCheckState === b.alarmAutoCheckState && a.alarmSyncStatus === b.alarmSyncStatus &&
    a.sleepReminderSyncStatus === b.sleepReminderSyncStatus &&
    a.sleepReminderSyncRevision === b.sleepReminderSyncRevision;
}
