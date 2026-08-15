import type { AppData, ShiftType } from '../models/app-data';
import { parseDateKey, toDateKey } from '../utils/date';
import {
  buildAlarmPyoAlarmPlan,
  type AlarmPyoAlarmPlan,
} from './alarm-planner';
import { getAlarmScheduleSignature } from './alarm-schedule-signature';

const MAX_DAILY_PROJECTIONS = 4;

type DailyProjectionEntry = {
  key: string;
  plans: AlarmPyoAlarmPlan[];
};

const dailyProjectionCache: DailyProjectionEntry[] = [];

export function getScheduleProjectionTimeZoneSignature(now: Date): string {
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    // 일부 구형 런타임에서는 IANA 시간대 이름을 제공하지 않습니다.
  }
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
  );
  const sampledOffsets: number[] = [];
  for (let days = 0; days <= 378; days += 14) {
    const sample = new Date(start);
    sample.setDate(start.getDate() + days);
    sampledOffsets.push(sample.getTimezoneOffset());
  }
  return `${timeZone}|${sampledOffsets.join(',')}`;
}

function getDailyProjectionKey(data: AppData, now: Date): string {
  return [
    toDateKey(now),
    getScheduleProjectionTimeZoneSignature(now),
    getAlarmScheduleSignature(data),
  ].join('|');
}

/**
 * Today, 알람 설정과 위젯이 같은 날짜의 366일 알람 투영을 공유합니다.
 * 현재 시각 필터는 소비자가 별도로 적용하므로 분 단위 갱신으로 재계산하지 않습니다.
 */
export function getCachedDailyAlarmProjection(
  data: AppData,
  resolveShift: (dateKey: string) => ShiftType | null,
  now: Date = new Date(),
): readonly AlarmPyoAlarmPlan[] {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('알람 투영 기준 시각이 올바르지 않습니다.');
  }
  const key = getDailyProjectionKey(data, now);
  const cachedIndex = dailyProjectionCache.findIndex((entry) => entry.key === key);
  if (cachedIndex >= 0) {
    const [cached] = dailyProjectionCache.splice(cachedIndex, 1);
    dailyProjectionCache.push(cached);
    return cached.plans;
  }

  const plans = buildAlarmPyoAlarmPlan(data, resolveShift, {
    now: parseDateKey(toDateKey(now)),
  });
  dailyProjectionCache.push({ key, plans });
  while (dailyProjectionCache.length > MAX_DAILY_PROJECTIONS) {
    dailyProjectionCache.shift();
  }
  return plans;
}

export function getCachedFutureAlarmProjection(
  data: AppData,
  resolveShift: (dateKey: string) => ShiftType | null,
  now: Date = new Date(),
): AlarmPyoAlarmPlan[] {
  const nowTimestamp = now.getTime();
  return getCachedDailyAlarmProjection(data, resolveShift, now).filter(
    (plan) => plan.alarmAt > nowTimestamp,
  );
}

export function clearScheduleProjectionCacheForTests(): void {
  dailyProjectionCache.length = 0;
}
