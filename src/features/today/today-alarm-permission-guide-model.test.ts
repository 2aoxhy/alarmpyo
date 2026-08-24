import { describe, expect, it } from 'vitest';

import type { AlarmPyoAlarmStatus } from '../../services/alarmpyo-alarm-service';
import { resolveTodayAlarmPermissionGuide } from './today-alarm-permission-guide-model';

function status(
  patch: Partial<AlarmPyoAlarmStatus> = {},
): AlarmPyoAlarmStatus {
  return {
    supported: true,
    enabled: true,
    triggerState: 'not-scheduled',
    storageHealth: 'normal',
    exactAlarmAllowed: false,
    fullScreenAllowed: false,
    notificationsAllowed: false,
    doNotDisturbActive: false,
    doNotDisturbMaySilenceAlarm: false,
    batteryOptimizationIgnored: true,
    alarmVolume: 5,
    plannedThroughAt: 0,
    planRefreshRecommendedAt: 0,
    planRefreshReminderPending: false,
    scheduledAlarms: [],
    scheduledCount: 0,
    widgetInstalled: false,
    widgetSnapshotGeneratedAt: 0,
    recentEvents: [],
    ...patch,
  };
}

describe('Today 알람 권한 안내', () => {
  it('필수 권한을 정해진 순서로 하나만 안내해요', () => {
    expect(
      resolveTodayAlarmPermissionGuide({
        alarmEnabled: true,
        platformSupported: true,
        status: status(),
      }),
    ).toMatchObject({
      progressLabel: '필수 권한 0/3',
      target: 'exact-alarm',
      title: '정확한 알람 권한 필요',
    });

    expect(
      resolveTodayAlarmPermissionGuide({
        alarmEnabled: true,
        platformSupported: true,
        status: status({ exactAlarmAllowed: true }),
      }),
    ).toMatchObject({ target: 'alarm-notifications' });
  });

  it('알람을 끄거나 필수 권한을 모두 준비하면 표시하지 않아요', () => {
    expect(
      resolveTodayAlarmPermissionGuide({
        alarmEnabled: false,
        platformSupported: true,
        status: status(),
      }),
    ).toBeNull();
    expect(
      resolveTodayAlarmPermissionGuide({
        alarmEnabled: true,
        platformSupported: true,
        status: status({
          exactAlarmAllowed: true,
          notificationsAllowed: true,
          fullScreenAllowed: true,
        }),
      }),
    ).toBeNull();
  });
});
