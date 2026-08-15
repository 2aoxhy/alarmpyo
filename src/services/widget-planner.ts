import type {
  AppData,
  ShiftType,
  WidgetDisplayOptions,
} from '../models/app-data';
import { addDays, toDateKey } from '../utils/date';
import { getDayExceptionLabel } from '../utils/day-exception';
import {
  getScheduleStartDate,
  resolveEffectiveDayFromAppData,
} from './app-data-service';
import { buildAlarmPyoAlarmPlan } from './alarm-planner';
import { getCachedFutureAlarmProjection } from './schedule-projection-cache';

// 위젯은 한 번 설치하면 오래 열지 않을 수 있어 오늘부터 윤년 1년치를 보관해요.
// 자정을 넘긴 야간 근무 확인용 전날 한 건은 이 범위와 별도로 포함해요.
// 네이티브는 현재 상태의 다음 경계 한 건만 예약하므로 항목 수가 늘어도
// 백그라운드 타이머나 반복 작업은 늘어나지 않아요.
export const WIDGET_PLAN_HORIZON_DAYS = 366;

export type AlarmPyoWidgetEntry = {
  dateKey: string;
  shiftTypeId: string;
  shiftName: string;
  startMinutes: number | null;
  endMinutes: number | null;
  endsNextDay: boolean;
  isOff: boolean;
  isOverride: boolean;
  exceptionName: string | null;
};

export type AlarmPyoWidgetSnapshot = {
  version: 2;
  generatedAt: number;
  setupCompleted: boolean;
  displayOptions: WidgetDisplayOptions;
  alarms: AlarmPyoWidgetAlarm[];
  entries: AlarmPyoWidgetEntry[];
};

export type AlarmPyoWidgetAlarm = {
  alarmAt: number;
  shiftTypeId: string;
  shiftName: string;
};

export type BuildAlarmPyoWidgetSnapshotOptions = {
  now?: Date;
  horizonDays?: number;
};

function assertHorizonDays(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 366) {
    throw new RangeError('위젯 계산 일수는 1일부터 366일까지의 정수여야 합니다.');
  }
}

function isDateOverride(data: AppData, dateKey: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(data.overrides, dateKey) ||
    Object.prototype.hasOwnProperty.call(data.timeOverrides, dateKey) ||
    Object.prototype.hasOwnProperty.call(data.dayExceptions, dateKey) ||
    Object.prototype.hasOwnProperty.call(data.alarmOverrides, dateKey)
  );
}

function toWidgetEntry(
  data: AppData,
  dateKey: string,
  shift: ShiftType | null,
): AlarmPyoWidgetEntry {
  const effectiveDay = resolveEffectiveDayFromAppData(data, dateKey, {
    scheduledShift: shift,
  });
  const dayException = effectiveDay.dayException;
  const exceptionName = dayException ? getDayExceptionLabel(dayException) : null;
  const effectiveShift = effectiveDay.shift;
  if (!effectiveShift) {
    return {
      dateKey,
      shiftTypeId: dayException ? `exception-${dayException}` : 'off',
      shiftName: exceptionName ?? '휴무',
      startMinutes: null,
      endMinutes: null,
      endsNextDay: false,
      isOff: true,
      isOverride: isDateOverride(data, dateKey),
      exceptionName,
    };
  }

  return {
    dateKey,
    shiftTypeId: dayException ? `exception-${dayException}` : effectiveShift.id,
    shiftName:
      (exceptionName ?? effectiveShift.name.trim()) ||
      (effectiveShift.isOff ? '휴무' : '근무'),
    startMinutes: effectiveShift.startMinutes,
    endMinutes: effectiveShift.endMinutes,
    endsNextDay: effectiveShift.endsNextDay,
    isOff: effectiveShift.isOff,
    isOverride: isDateOverride(data, dateKey),
    exceptionName,
  };
}

/**
 * 네이티브 위젯이 앱을 열지 않고도 날짜와 시간대 변경에 대응할 수 있도록
 * 필요한 근무 정보만 작은 스냅샷으로 전달합니다.
 */
export function buildAlarmPyoWidgetSnapshot(
  data: AppData,
  resolveShift: (dateKey: string) => ShiftType | null,
  options: BuildAlarmPyoWidgetSnapshotOptions = {},
): AlarmPyoWidgetSnapshot {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('위젯 계산 기준 시각이 올바르지 않습니다.');
  }

  const horizonDays = options.horizonDays ?? WIDGET_PLAN_HORIZON_DAYS;
  assertHorizonDays(horizonDays);
  // 야간 근무가 자정을 넘겨 진행 중인 경우도 표시할 수 있도록 전날을 포함해요.
  // 다만 첫 근무일이 미래라면 그 날짜부터 요청한 전체 범위를 만들어요.
  const todayDateKey = toDateKey(now);
  const preferredFirstDateKey = addDays(todayDateKey, -1);
  const scheduleStartDate = getScheduleStartDate(data);
  const firstDateKey =
    scheduleStartDate > todayDateKey
      ? scheduleStartDate
      : preferredFirstDateKey < scheduleStartDate
        ? scheduleStartDate
        : preferredFirstDateKey;
  const includesPreviousDay = firstDateKey < todayDateKey;
  const entryCount = horizonDays + (includesPreviousDay ? 1 : 0);
  const alarmPlans = data.settings.widgetDisplayOptions.nextAlarm
    ? horizonDays === WIDGET_PLAN_HORIZON_DAYS
      ? getCachedFutureAlarmProjection(data, resolveShift, now)
      : buildAlarmPyoAlarmPlan(data, resolveShift, { now, horizonDays })
    : [];

  return {
    version: 2,
    generatedAt: now.getTime(),
    setupCompleted: data.settings.setupCompleted,
    displayOptions: { ...data.settings.widgetDisplayOptions },
    alarms: alarmPlans.map((alarm) => ({
      alarmAt: alarm.alarmAt,
      shiftTypeId: alarm.shiftTypeId,
      shiftName: alarm.shiftName,
    })),
    entries: Array.from({ length: entryCount }, (_, offset) => {
      const dateKey = addDays(firstDateKey, offset);
      return toWidgetEntry(data, dateKey, resolveShift(dateKey));
    }),
  };
}

export function serializeAlarmPyoWidgetSnapshot(snapshot: AlarmPyoWidgetSnapshot): string {
  return JSON.stringify(snapshot);
}
