import type { AppData, ShiftType } from '../models/app-data';
import { addDays, dateAtMinutes, toDateKey } from '../utils/date';
import { resolveEffectiveDayFromAppData } from './app-data-service';
import {
  buildSleepTimingGuidance,
  type SleepTimingWindow,
} from './sleep-timing-planner';

export const SLEEP_REMINDER_HORIZON_DAYS = 14;

const SLEEP_GUIDANCE_SAMPLE_HORIZON_DAYS = 4;
const SLEEP_GUIDANCE_ADDITIONAL_LIMIT = 10;

export type SleepReminderPlan = {
  id: string;
  reminderAt: number;
  shiftDate: string;
  shiftName: string;
  title: string;
  body: string;
};

export type BuildSleepReminderPlansOptions = {
  now?: Date;
  horizonDays?: number;
};

/** 수면 계획에 영향을 주는 값만 묶어 불필요한 네이티브 재예약을 피하게 해요. */
export function getSleepReminderScheduleSignature(data: AppData): string {
  const availability = {
    enabled: data.settings.sleepReminderEnabled,
    setupCompleted: data.settings.setupCompleted,
  };
  if (!availability.enabled || !availability.setupCompleted) {
    return JSON.stringify(availability);
  }
  return JSON.stringify({
    ...availability,
    shiftTypes: data.shiftTypes,
    pattern: data.pattern,
    overrides: data.overrides,
    timeOverrides: data.timeOverrides,
    dayExceptions: data.dayExceptions,
    alarmOverrides: data.alarmOverrides,
    workRoutineProfiles: data.settings.workRoutineProfiles,
  });
}

function isValidShiftMinute(value: number | null): value is number {
  return Number.isInteger(value) && value !== null && value >= 0 && value < 24 * 60;
}

function workIntervalForShift(
  shiftDate: string,
  shift: ShiftType,
): { startAt: number; endAt: number } | null {
  if (
    shift.isOff ||
    !isValidShiftMinute(shift.startMinutes) ||
    !isValidShiftMinute(shift.endMinutes)
  ) {
    return null;
  }

  return {
    startAt: dateAtMinutes(shiftDate, shift.startMinutes).getTime(),
    endAt: dateAtMinutes(
      shift.endsNextDay ? addDays(shiftDate, 1) : shiftDate,
      shift.endMinutes,
    ).getTime(),
  };
}

function isDuringWork(data: AppData, timestamp: number): boolean {
  const currentDateKey = toDateKey(new Date(timestamp));
  return [addDays(currentDateKey, -1), currentDateKey].some((shiftDate) => {
    const effectiveDay = resolveEffectiveDayFromAppData(data, shiftDate);
    if (!effectiveDay.scheduleActive || !effectiveDay.shift) return false;
    const interval = workIntervalForShift(shiftDate, effectiveDay.shift);
    return interval !== null && timestamp >= interval.startAt && timestamp < interval.endAt;
  });
}

function resolveReminderContext(
  data: AppData,
  window: SleepTimingWindow,
): Pick<SleepReminderPlan, 'shiftDate' | 'shiftName'> {
  const sleepDate = toDateKey(new Date(window.startAt));
  const shiftDate = window.relatedDateKey ?? addDays(sleepDate, 1);
  const effectiveDay = resolveEffectiveDayFromAppData(data, shiftDate);
  return {
    shiftDate,
    shiftName:
      window.shiftName ??
      effectiveDay.shift?.name ??
      (effectiveDay.scheduleActive ? '휴무' : '일반 수면'),
  };
}

function createReminderPlan(
  data: AppData,
  window: SleepTimingWindow,
): SleepReminderPlan {
  const context = resolveReminderContext(data, window);
  return {
    id: `sleep-reminder:${window.id}`,
    reminderAt: window.startAt,
    ...context,
    title: '수면 시작 시간이에요',
    body: `${window.title} 목표 시각이에요. 지금 주무세요.`,
  };
}

function reminderSpecificity(window: SleepTimingWindow): number {
  return (window.relatedDateKey ? 2 : 0) + (window.shiftName ? 1 : 0);
}

function collectSleepTimingWindows(
  data: AppData,
  now: Date,
  horizonDays: number,
): SleepTimingWindow[] {
  const today = toDateKey(now);
  const unique = new Map<string, SleepTimingWindow>();

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const reference =
      offset === 0
        ? now
        : dateAtMinutes(addDays(today, offset), 0);
    const guidance = buildSleepTimingGuidance(data, {
      now: reference,
      horizonDays: SLEEP_GUIDANCE_SAMPLE_HORIZON_DAYS,
      additionalLimit: SLEEP_GUIDANCE_ADDITIONAL_LIMIT,
    });
    [guidance.primary, ...guidance.additional].forEach((window) => {
      unique.set(window.id, window);
    });
  }

  return [...unique.values()];
}

/**
 * 수면 가이드의 목표 취침 시각을 일반 알림 예약 계획으로 변환해요.
 * 실제 예약과 권한 처리는 네이티브 계층에서 담당해요.
 */
export function buildSleepReminderPlans(
  data: AppData,
  options: BuildSleepReminderPlansOptions = {},
): SleepReminderPlan[] {
  if (!data.settings.sleepReminderEnabled || !data.settings.setupCompleted) return [];

  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('수면 알림 계산 시각이 올바르지 않아요.');
  }

  const horizonDays = options.horizonDays ?? SLEEP_REMINDER_HORIZON_DAYS;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 14) {
    throw new RangeError('수면 알림 계산 일수는 1일부터 14일까지의 정수여야 해요.');
  }

  const startsAfter = now.getTime();
  const endsBefore = new Date(now);
  endsBefore.setDate(endsBefore.getDate() + horizonDays);
  const candidates = collectSleepTimingWindows(data, now, horizonDays)
    .filter(
      (window) =>
        window.startAt > startsAfter &&
        window.startAt < endsBefore.getTime() &&
        !isDuringWork(data, window.startAt),
    )
    .sort((left, right) => {
      if (left.startAt !== right.startAt) return left.startAt - right.startAt;
      return reminderSpecificity(right) - reminderSpecificity(left);
    });

  const byReminderAt = new Map<number, SleepReminderPlan>();
  candidates.forEach((window) => {
    if (!byReminderAt.has(window.startAt)) {
      byReminderAt.set(window.startAt, createReminderPlan(data, window));
    }
  });

  return [...byReminderAt.values()].sort((left, right) => {
    if (left.reminderAt !== right.reminderAt) {
      return left.reminderAt - right.reminderAt;
    }
    return left.id.localeCompare(right.id);
  });
}
