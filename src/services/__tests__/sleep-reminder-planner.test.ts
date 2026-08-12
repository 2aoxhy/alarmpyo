import { describe, expect, it } from 'vitest';

import type { AppData } from '../../models/app-data';
import { addDays, dateAtMinutes, toDateKey } from '../../utils/date';
import {
  createDefaultAppData,
  resolveEffectiveDayFromAppData,
} from '../app-data-service';
import {
  buildSleepReminderPlans,
  getSleepReminderScheduleSignature,
  SLEEP_REMINDER_HORIZON_DAYS,
} from '../sleep-reminder-planner';

function appData(): AppData {
  const data = createDefaultAppData('2026-07-11');
  data.settings.setupCompleted = true;
  data.settings.sleepReminderEnabled = true;
  return data;
}

function at(dateKey: string, hours: number, minutes = 0): number {
  return dateAtMinutes(dateKey, hours * 60 + minutes).getTime();
}

function isDuringStoredWork(data: AppData, timestamp: number): boolean {
  const currentDateKey = toDateKey(new Date(timestamp));
  return [addDays(currentDateKey, -1), currentDateKey].some((shiftDate) => {
    const shift = resolveEffectiveDayFromAppData(data, shiftDate).shift;
    if (
      !shift ||
      shift.isOff ||
      shift.startMinutes === null ||
      shift.endMinutes === null
    ) {
      return false;
    }
    const startAt = dateAtMinutes(shiftDate, shift.startMinutes).getTime();
    const endAt = dateAtMinutes(
      shift.endsNextDay ? addDays(shiftDate, 1) : shiftDate,
      shift.endMinutes,
    ).getTime();
    return timestamp >= startAt && timestamp < endAt;
  });
}

describe('수면 시작 알림 계획', () => {
  it('기능이 꺼졌거나 첫 설정 전이면 계획을 만들지 않아요', () => {
    const disabled = appData();
    disabled.settings.sleepReminderEnabled = false;
    expect(
      buildSleepReminderPlans(disabled, { now: new Date(2026, 6, 10, 12) }),
    ).toEqual([]);

    const beforeSetup = appData();
    beforeSetup.settings.setupCompleted = false;
    expect(
      buildSleepReminderPlans(beforeSetup, { now: new Date(2026, 6, 10, 12) }),
    ).toEqual([]);
  });

  it('주간 기상 시각에 맞춘 목표 취침 시각을 계획해요', () => {
    const plans = buildSleepReminderPlans(appData(), {
      now: new Date(2026, 6, 10, 12),
      horizonDays: 2,
    });

    expect(plans[0]).toEqual({
      id: `sleep-reminder:sleep:main:2026-07-11:${at('2026-07-10', 20, 55)}`,
      reminderAt: at('2026-07-10', 20, 55),
      shiftDate: '2026-07-11',
      shiftName: '주간',
      title: '수면 시작 시간이에요',
      body: '주간 전환 수면 목표 시각이에요. 지금 주무세요.',
    });
  });

  it('14일 안의 목표 시각을 중복 없이 정렬하고 근무 중 시각은 제외해요', () => {
    const data = appData();
    const now = new Date(2026, 6, 10, 12);
    const plans = buildSleepReminderPlans(data, { now });
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + SLEEP_REMINDER_HORIZON_DAYS);

    expect(plans.length).toBeGreaterThan(3);
    expect(new Set(plans.map((plan) => plan.reminderAt)).size).toBe(plans.length);
    expect(plans.map((plan) => plan.reminderAt)).toEqual(
      [...plans.map((plan) => plan.reminderAt)].sort((left, right) => left - right),
    );
    plans.forEach((plan) => {
      expect(plan.reminderAt).toBeGreaterThan(now.getTime());
      expect(plan.reminderAt).toBeLessThan(cutoff.getTime());
      expect(isDuringStoredWork(data, plan.reminderAt)).toBe(false);
      expect(plan.id).toMatch(/^sleep-reminder:/);
      expect(plan.shiftDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(plan.shiftName.length).toBeGreaterThan(0);
    });
  });

  it('계산 시각과 일수 범위를 엄격하게 검사해요', () => {
    const data = appData();
    expect(() =>
      buildSleepReminderPlans(data, { now: new Date(Number.NaN) }),
    ).toThrow('수면 알림 계산 시각이 올바르지 않아요.');
    expect(() =>
      buildSleepReminderPlans(data, {
        now: new Date(2026, 6, 10, 12),
        horizonDays: 0,
      }),
    ).toThrow('수면 알림 계산 일수는 1일부터 14일까지의 정수여야 해요.');
    expect(() =>
      buildSleepReminderPlans(data, {
        now: new Date(2026, 6, 10, 12),
        horizonDays: 15,
      }),
    ).toThrow('수면 알림 계산 일수는 1일부터 14일까지의 정수여야 해요.');
  });

  it('메모와 테마 변경은 재예약하지 않고 근무와 루틴 변경은 재예약해요', () => {
    const data = appData();
    const signature = getSleepReminderScheduleSignature(data);

    expect(
      getSleepReminderScheduleSignature({
        ...data,
        notes: { '2026-07-11': '수면 계획과 무관한 메모' },
        settings: { ...data.settings, themeMode: 'dark' },
      }),
    ).toBe(signature);
    expect(
      getSleepReminderScheduleSignature({
        ...data,
        settings: {
          ...data.settings,
          workRoutineProfiles: {
            ...data.settings.workRoutineProfiles,
            day: {
              ...data.settings.workRoutineProfiles.day,
              departMinutesBefore: 65,
            },
          },
        },
      }),
    ).not.toBe(signature);
    expect(
      getSleepReminderScheduleSignature({
        ...data,
        overrides: { '2026-07-12': 'night' },
      }),
    ).not.toBe(signature);
    expect(
      getSleepReminderScheduleSignature({
        ...data,
        alarmOverrides: { '2026-07-11': { mode: 'disabled' } },
      }),
    ).not.toBe(signature);
  });

  it('기능이 꺼진 동안의 근무 변경은 불필요한 취소 요청을 반복하지 않아요', () => {
    const data = appData();
    data.settings.sleepReminderEnabled = false;

    expect(
      getSleepReminderScheduleSignature({
        ...data,
        overrides: { '2026-07-12': 'night' },
      }),
    ).toBe(getSleepReminderScheduleSignature(data));
  });
});
