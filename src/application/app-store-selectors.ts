import type { AppData, ShiftType } from '../models/app-data';
import { resolveShiftFromAppData } from '../services/app-data-service';

export function selectShiftForDate(
  data: AppData,
  dateKey: string,
): ShiftType | null {
  return resolveShiftFromAppData(data, dateKey);
}

export function selectNoteForDate(data: AppData, dateKey: string): string {
  return data.notes[dateKey] ?? '';
}
