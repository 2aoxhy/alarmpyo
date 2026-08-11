const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  const [laterYear, laterMonth, laterDay] = later.split('-').map(Number);
  const [earlierYear, earlierMonth, earlierDay] = earlier.split('-').map(Number);
  return Math.round(
    (Date.UTC(laterYear, laterMonth - 1, laterDay) -
      Date.UTC(earlierYear, earlierMonth - 1, earlierDay)) /
      DAY_IN_MS,
  );
}

export function dateAtMinutes(dateKey: string, minutes: number): Date {
  const date = parseDateKey(dateKey);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '시간 없음';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, '0')}`;
}

export function formatCompactTime(minutes: number | null): string {
  if (minutes === null) return '—';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatKoreanDate(dateKey: string, includeYear = false): string {
  const date = parseDateKey(dateKey);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const prefix = includeYear ? `${date.getFullYear()}년 ` : '';
  return `${prefix}${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year}년 ${month + 1}월`;
}

export type CalendarCell = {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
};

export function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1, 12);
  const sundayBasedWeekday = first.getDay();
  const start = new Date(year, month, 1 - sundayBasedWeekday, 12);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      dateKey: toDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
    };
  });
}

export function moveMonth(year: number, month: number, amount: number) {
  const date = new Date(year, month + amount, 1, 12);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

export function formatAlarmCountdown(alarmAt: number, now: Date | number): string {
  const nowTimestamp = now instanceof Date ? now.getTime() : now;
  const remainingMinutes = Math.ceil((alarmAt - nowTimestamp) / 60_000);
  if (remainingMinutes <= 0) return '곧 울림';

  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  return `${parts.join(' ')} 뒤 울림`;
}
