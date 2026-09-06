import type { AppData } from '../../models/app-data';

export const selectDayEditorData = (store: { data: AppData }) => store.data;

/** Other dates can change in the background without disturbing this draft. */
export function createDayEditorDataEquality(dateKey: string) {
  return (a: AppData, b: AppData): boolean =>
    a.pattern === b.pattern && a.shiftTypes === b.shiftTypes &&
    a.payrollSettings === b.payrollSettings &&
    a.settings.notificationsEnabled === b.settings.notificationsEnabled &&
    a.overrides[dateKey] === b.overrides[dateKey] &&
    a.timeOverrides[dateKey] === b.timeOverrides[dateKey] &&
    a.dayExceptions[dateKey] === b.dayExceptions[dateKey] &&
    a.alarmOverrides[dateKey] === b.alarmOverrides[dateKey] &&
    a.notes[dateKey] === b.notes[dateKey];
}
