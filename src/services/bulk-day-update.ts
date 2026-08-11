import type { AppData, DayExceptionType } from '../models/app-data';
import { isScheduleDate } from './app-data-service';
import { isValidDateKey } from '../utils/date';
import { DAY_EXCEPTION_TYPES } from '../utils/day-exception';

export type BulkDayChange =
  | { kind: 'pattern' }
  | { kind: 'shift'; shiftTypeId: string }
  | { kind: 'exception'; dayException: DayExceptionType | null };

const MAX_BULK_DATES = 366;

function uniqueDateKeys(dateKeys: readonly string[]): string[] {
  return [...new Set(dateKeys)].sort();
}

export function applyBulkDayChange(
  data: AppData,
  dateKeys: readonly string[],
  change: BulkDayChange,
): AppData | null {
  const dates = uniqueDateKeys(dateKeys);
  if (
    dates.length === 0 ||
    dates.length > MAX_BULK_DATES ||
    dates.some(
      (dateKey) =>
        !isValidDateKey(dateKey) || !isScheduleDate(data, dateKey),
    )
  ) {
    return null;
  }

  if (
    change.kind === 'shift' &&
    !data.shiftTypes.some((shift) => shift.id === change.shiftTypeId)
  ) {
    return null;
  }
  if (
    change.kind === 'exception' &&
    change.dayException !== null &&
    !DAY_EXCEPTION_TYPES.includes(change.dayException)
  ) {
    return null;
  }

  const overrides = { ...data.overrides };
  const timeOverrides = { ...data.timeOverrides };
  const dayExceptions = { ...data.dayExceptions };
  let changed = false;

  for (const dateKey of dates) {
    if (change.kind === 'pattern') {
      if (Object.prototype.hasOwnProperty.call(overrides, dateKey)) {
        delete overrides[dateKey];
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(timeOverrides, dateKey)) {
        delete timeOverrides[dateKey];
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(dayExceptions, dateKey)) {
        delete dayExceptions[dateKey];
        changed = true;
      }
      continue;
    }

    if (change.kind === 'shift') {
      if (overrides[dateKey] !== change.shiftTypeId) {
        overrides[dateKey] = change.shiftTypeId;
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(timeOverrides, dateKey)) {
        delete timeOverrides[dateKey];
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(dayExceptions, dateKey)) {
        delete dayExceptions[dateKey];
        changed = true;
      }
      continue;
    }

    if (change.dayException === null) {
      if (Object.prototype.hasOwnProperty.call(dayExceptions, dateKey)) {
        delete dayExceptions[dateKey];
        changed = true;
      }
    } else if (dayExceptions[dateKey] !== change.dayException) {
      dayExceptions[dateKey] = change.dayException;
      changed = true;
    }
  }

  return changed
    ? { ...data, overrides, timeOverrides, dayExceptions }
    : data;
}
