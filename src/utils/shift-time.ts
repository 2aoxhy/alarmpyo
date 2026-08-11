export type ShiftDuration = {
  durationMinutes: number;
  endsNextDay: boolean;
};

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/) ?? trimmed.match(/^(\d{1,2})(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** 입력을 마친 시간값을 항상 07:00 형식으로 정리합니다. */
export function normalizeTimeInput(value: string): string {
  const minutes = parseTimeInput(value);
  return minutes === null ? value : formatTimeInput(minutes);
}

/** 콜론 없이 숫자 4개를 입력하면 즉시 07:00 형식으로 바꿉니다. */
export function formatTimeInputWhileTyping(value: string): string {
  if (!/^\d{4}$/.test(value.trim())) return value;
  return normalizeTimeInput(value);
}

export function formatTimeInput(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function calculateAlarmMinutes(
  startMinutes: number,
  alarmMinutesBefore: number,
): number {
  return ((startMinutes - alarmMinutesBefore) % 1440 + 1440) % 1440;
}

export function calculateShiftDuration(
  startMinutes: number,
  endMinutes: number,
): ShiftDuration | null {
  if (startMinutes === endMinutes) return null;
  const endsNextDay = endMinutes < startMinutes;
  return {
    durationMinutes: endsNextDay
      ? 1440 - startMinutes + endMinutes
      : endMinutes - startMinutes,
    endsNextDay,
  };
}
