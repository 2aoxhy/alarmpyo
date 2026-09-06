import type { AppData } from '../../models/app-data';
import { selectCalendarProjectionData, type CalendarProjectionData } from '../../services/calendar-month-view-model';

export function selectCalendarStoreData(store: { data: AppData }): CalendarProjectionData {
  return selectCalendarProjectionData(store.data);
}

export function areCalendarStoreDataEqual(a: CalendarProjectionData, b: CalendarProjectionData): boolean {
  return a.alarmOverrides === b.alarmOverrides && a.dayExceptions === b.dayExceptions &&
    a.notes === b.notes && a.overrides === b.overrides && a.pattern === b.pattern &&
    a.payrollSettings === b.payrollSettings && a.shiftTypes === b.shiftTypes &&
    a.timeOverrides === b.timeOverrides;
}
