import type { AppData } from '../../models/app-data';

// Existing draft/planner functions accept AppData. Keep their input contract,
// but subscribe only to the fields actually used by each settings screen.
export const selectSettingsData = (store: { data: AppData }) => store.data;

export function areSetupDataEqual(a: AppData, b: AppData): boolean {
  return a.pattern === b.pattern && a.shiftTypes === b.shiftTypes &&
    a.settings.notificationsEnabled === b.settings.notificationsEnabled;
}

export function areSettingsHomeDataEqual(a: AppData, b: AppData): boolean {
  return areSetupDataEqual(a, b) &&
    a.settings.scheduledNotificationCount === b.settings.scheduledNotificationCount;
}

export function areWorkSettingsHomeDataEqual(a: AppData, b: AppData): boolean {
  return areSettingsHomeDataEqual(a, b) && a.payrollSettings === b.payrollSettings &&
    a.settings.lastNotificationSyncAt === b.settings.lastNotificationSyncAt;
}

export function areShiftSettingsDataEqual(a: AppData, b: AppData): boolean {
  return a.pattern === b.pattern && a.shiftTypes === b.shiftTypes &&
    a.payrollSettings === b.payrollSettings &&
    a.settings.workRoutineProfiles === b.settings.workRoutineProfiles;
}

export function arePatternEditorDataEqual(a: AppData, b: AppData): boolean {
  return areSetupDataEqual(a, b) && a.overrides === b.overrides &&
    a.timeOverrides === b.timeOverrides && a.appliedPatternSource === b.appliedPatternSource;
}

export function areDisplaySettingsDataEqual(a: AppData, b: AppData): boolean {
  return a.shiftTypes === b.shiftTypes && a.pattern === b.pattern &&
    a.overrides === b.overrides && a.timeOverrides === b.timeOverrides &&
    a.dayExceptions === b.dayExceptions && a.alarmOverrides === b.alarmOverrides &&
    a.settings.setupCompleted === b.settings.setupCompleted &&
    a.settings.notificationsEnabled === b.settings.notificationsEnabled &&
    a.settings.widgetDisplayOptions === b.settings.widgetDisplayOptions;
}
