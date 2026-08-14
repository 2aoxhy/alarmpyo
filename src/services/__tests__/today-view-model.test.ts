import { describe, expect, it } from 'vitest';

import type { AppData, ShiftType } from '../../models/app-data';
import {
  buildTodayAlarmPlanSummary,
  buildTodayViewModel,
} from '../today-view-model';
import { createDefaultWorkRoutineProfiles } from '../work-routine-settings';

const dayShift: ShiftType = {
  id: 'day',
  name: '주간',
  shortName: '주',
  color: '#00a58c',
  softColor: '#d9f7ef',
  startMinutes: 7 * 60,
  endMinutes: 18 * 60,
  endsNextDay: false,
  isOff: false,
  alarmEnabled: true,
  alarmMinutesBefore: 120,
};

const offShift: ShiftType = {
  id: 'off',
  name: '휴무',
  shortName: '휴',
  color: '#667085',
  softColor: '#eef1f5',
  startMinutes: null,
  endMinutes: null,
  endsNextDay: false,
  isOff: true,
  alarmEnabled: false,
  alarmMinutesBefore: 0,
};

const data: AppData = {
  version: 20,
  shiftTypes: [dayShift, offShift],
  pattern: {
    name: '시험 근무표',
    anchorDate: '2026-07-30',
    scheduleStartDate: '2026-07-30',
    shiftTypeIds: ['day', 'off'],
  },
  overrides: {},
  timeOverrides: {},
  dayExceptions: {},
  alarmOverrides: {},
  notes: {},
  scheduleChangeHistory: [],
  settings: {
    notificationsEnabled: false,
    sleepReminderEnabled: false,
    scheduledNotificationCount: 0,
    lastNotificationSyncAt: null,
    setupCompleted: true,
    themeMode: 'system',
    workRoutineProfiles: createDefaultWorkRoutineProfiles(),
    widgetDisplayOptions: {
      todayShift: true,
      nextShift: true,
      nextAlarm: false,
    },
  },
};

describe('오늘 화면 계산 모델', () => {
  it('근무 전 상태와 다음 근무 정보를 한 번에 계산해요', () => {
    const resolveShift = (dateKey: string) =>
      dateKey === '2026-07-31' ? offShift : dayShift;
    const alarmPlanSummary = buildTodayAlarmPlanSummary({
      data,
      now: new Date(2026, 6, 30),
      resolveShift,
    });
    const model = buildTodayViewModel({
      data,
      now: new Date(2026, 6, 30, 5, 0),
      resolveShift,
      alarmPlanSummary,
      alarmStatus: null,
      alarmStatusError: false,
      alarmPlatformSupported: true,
      compactHome: false,
    });

    expect(model.homeState).toBe('before');
    expect(model.heroTitle).toBe('오늘은 주간 근무');
    expect(model.footerLabel).toBe('근무 시작까지');
    expect(model.upcomingWorkDays).toHaveLength(3);
    expect(model.alarmStateLabel).toBe('근무 알람을 사용하지 않아요');
  });

  it('분 단위 파생 계산은 366일 알람 계획을 다시 탐색하지 않아요', () => {
    const enabledData: AppData = {
      ...data,
      settings: { ...data.settings, notificationsEnabled: true },
    };
    let resolveCount = 0;
    const resolveShift = () => {
      resolveCount += 1;
      return dayShift;
    };
    const alarmPlanSummary = buildTodayAlarmPlanSummary({
      data: enabledData,
      now: new Date(2026, 6, 30),
      resolveShift,
    });

    expect(resolveCount).toBeGreaterThan(300);
    resolveCount = 0;

    for (const minute of [0, 1]) {
      buildTodayViewModel({
        data: enabledData,
        now: new Date(2026, 6, 30, 5, minute),
        resolveShift,
        alarmPlanSummary,
        alarmStatus: null,
        alarmStatusError: false,
        alarmPlatformSupported: true,
        compactHome: false,
      });
    }

    expect(resolveCount).toBeLessThan(30);
  });

  it('수면 알림 손상이 있으면 예약 수가 맞아도 준비됨과 동시에 표시하지 않아요', () => {
    const enabledData: AppData = {
      ...data,
      settings: {
        ...data.settings,
        notificationsEnabled: true,
        sleepReminderEnabled: true,
      },
    };
    const model = buildTodayViewModel({
      data: enabledData,
      now: new Date(2026, 6, 30, 5, 0),
      resolveShift: () => dayShift,
      alarmPlanSummary: { plannedAlarmCount: 3 },
      alarmStatus: {
        supported: true,
        enabled: true,
        triggerState: 'scheduled',
        storageHealth: 'normal',
        exactAlarmAllowed: true,
        fullScreenAllowed: true,
        notificationsAllowed: true,
        doNotDisturbActive: false,
        doNotDisturbMaySilenceAlarm: false,
        batteryOptimizationIgnored: true,
        alarmVolume: 4,
        plannedThroughAt: 0,
        planRefreshRecommendedAt: 0,
        planRefreshReminderPending: false,
        scheduledAlarms: [],
        scheduledCount: 3,
        widgetInstalled: false,
        widgetSnapshotGeneratedAt: 0,
        recentEvents: [],
      },
      alarmStatusError: false,
      alarmPlatformSupported: true,
      compactHome: false,
      sleepReminderStatus: {
        supported: true,
        enabled: true,
        notificationsAllowed: true,
        scheduledCount: 0,
        storageHealth: 'corrupt',
      },
      sleepReminderSupported: true,
    });

    expect(model.alarmHealthState).toMatchObject({
      status: 'action-required',
      issueCode: 'sleep-reminder-storage',
      action: 'retry-sleep-reminders',
    });
    expect(model.alarmsReady).toBe(false);
    expect(model.alarmSummaryLabel).toContain('수면 알림 계획을 복구해야 해요');
  });
});
