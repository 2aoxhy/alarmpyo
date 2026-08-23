import { describe, expect, it } from 'vitest';

import type { AlarmPyoAlarmStatus } from '../../services/alarmpyo-alarm-service';

import {
  parseAlarmPermissionFocusTarget,
  resolveAlarmPermissionLaunchNotice,
  resolveAlarmPermissionReadinessViewModel,
  resolveAlarmPermissionReturnFocus,
} from './alarm-permission-readiness-model';

const readyStatus: AlarmPyoAlarmStatus = {
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
  scheduledCount: 0,
  widgetInstalled: false,
  widgetSnapshotGeneratedAt: 0,
  recentEvents: [],
};

describe('알람 준비 표시 모델', () => {
  it('필수 3개와 권장 안정성 항목을 분리하고 첫 필수 조치만 골라요', () => {
    const model = resolveAlarmPermissionReadinessViewModel({
      ...readyStatus,
      exactAlarmAllowed: false,
      notificationsAllowed: false,
      fullScreenAllowed: false,
      batteryOptimizationIgnored: false,
      doNotDisturbActive: true,
      doNotDisturbMaySilenceAlarm: true,
      alarmVolume: 0,
    });

    expect(model.summary).toBe('필수 권한 0/3');
    expect(model.nextRequiredTarget).toBe('exact-alarm');
    expect(model.required.map((item) => item.id)).toEqual([
      'exact-alarm',
      'alarm-notifications',
      'full-screen',
    ]);
    expect(model.recommended.map((item) => item.id)).toEqual([
      'battery-optimization',
      'do-not-disturb',
      'alarm-volume',
    ]);
  });

  it('권장 항목이 미완료여도 필수 준비 개수와 다음 필수 조치를 바꾸지 않아요', () => {
    const model = resolveAlarmPermissionReadinessViewModel({
      ...readyStatus,
      batteryOptimizationIgnored: false,
      alarmVolume: 0,
    });

    expect(model.summary).toBe('필수 권한 3/3');
    expect(model.nextRequiredTarget).toBeNull();
  });

  it('복귀 후 새 상태의 다음 필수 권한으로 초점을 이동해요', () => {
    expect(resolveAlarmPermissionReturnFocus({
      ...readyStatus,
      notificationsAllowed: false,
      fullScreenAllowed: false,
    }, 'exact-alarm')).toBe('alarm-notifications');
    expect(resolveAlarmPermissionReturnFocus(readyStatus, 'battery-optimization'))
      .toBe('battery-optimization');
  });

  it('지원하는 경로 target만 포커스 대상으로 받아요', () => {
    expect(parseAlarmPermissionFocusTarget('full-screen')).toBe('full-screen');
    expect(parseAlarmPermissionFocusTarget(['alarm-volume'])).toBe('alarm-volume');
    expect(parseAlarmPermissionFocusTarget('sleep-notifications')).toBeNull();
  });

  it('실제로 열린 대체 화면을 숨기지 않고 안내해요', () => {
    const notice = resolveAlarmPermissionLaunchNotice({
      opened: true,
      requestedTarget: 'full-screen',
      openedTarget: 'app-notifications',
      fallbackUsed: true,
    });

    expect(notice.tone).toBe('warning');
    expect(notice.title).toBe('대체 설정 화면이 열렸습니다');
    expect(notice.message).toContain('알람 알림 설정');
  });
});
