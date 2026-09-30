import { describe, expect, it } from 'vitest';

import type { AlarmPyoAlarmStatus } from '../alarmpyo-alarm-service';
import {
  resolveAlarmAccessSummary,
  resolveAlarmHealthState,
  resolveAlarmPermissionReadiness,
} from '../alarm-access-summary';

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

function summary(overrides: Partial<AlarmPyoAlarmStatus> = {}) {
  return resolveAlarmAccessSummary({
    alarmStatus: { ...readyStatus, ...overrides },
    alarmStatusError: false,
    notificationsEnabled: true,
    platformSupported: true,
  });
}

describe('알람 권한 안내', () => {
  it('필수 권한만 0~3 준비 개수로 계산하고 네이티브 순서의 다음 조치를 골라요', () => {
    expect(resolveAlarmPermissionReadiness({
      ...readyStatus,
      exactAlarmAllowed: false,
      notificationsAllowed: false,
      fullScreenAllowed: false,
      batteryOptimizationIgnored: true,
    })).toEqual({
      nextRequiredTarget: 'exact-alarm',
      readyRequiredCount: 0,
      requiredTotal: 3,
    });

    expect(resolveAlarmPermissionReadiness({
      ...readyStatus,
      fullScreenAllowed: false,
      batteryOptimizationIgnored: false,
    })).toEqual({
      nextRequiredTarget: 'full-screen',
      readyRequiredCount: 2,
      requiredTotal: 3,
    });
    expect(resolveAlarmPermissionReadiness(readyStatus)).toEqual({
      nextRequiredTarget: null,
      readyRequiredCount: 3,
      requiredTotal: 3,
    });
  });

  it('알람을 끈 상태에서는 스위치를 켜는 방법만 안내해요', () => {
    const result = resolveAlarmAccessSummary({
      alarmStatus: readyStatus,
      alarmStatusError: false,
      notificationsEnabled: false,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'none',
      canTest: false,
      title: '근무 알람 꺼짐',
    });
  });

  it('누락된 권한 중 네이티브 설정 순서상 첫 조치만 보여 줘요', () => {
    expect(
      summary({
        exactAlarmAllowed: false,
        fullScreenAllowed: false,
        notificationsAllowed: false,
      }),
    ).toMatchObject({
      action: 'open-exact-alarm-settings',
      actionLabel: '정확한 알람 설정',
      title: '정확한 알람 권한 필요',
    });

    expect(summary({ fullScreenAllowed: false, notificationsAllowed: false })).toMatchObject({
      action: 'open-notification-settings',
      actionLabel: '알림 설정 열기',
      title: '알림 권한 필요',
    });
    expect(summary({ notificationsAllowed: false })).toMatchObject({
      action: 'open-notification-settings',
      actionLabel: '알림 설정 열기',
      title: '알림 권한 필요',
    });
    expect(summary({ fullScreenAllowed: false })).toMatchObject({
      action: 'open-full-screen-settings',
      actionLabel: '전체 화면 설정',
      canTest: false,
      title: '전체 화면 권한 필요',
    });
  });

  it('알림 권한이 꺼져도 예정된 예약이 유지된다는 점을 알려 줘요', () => {
    expect(summary({
      enabled: false,
      notificationsAllowed: false,
      triggerState: 'delivery-blocked',
      scheduledCount: 3,
    })).toMatchObject({
      action: 'open-notification-settings',
      canTest: false,
      title: '예약 유지 · 알림 차단',
    });
  });

  it('알림이 차단되면 백그라운드 안전 점검의 예약 문제도 함께 알려 줘요', () => {
    const result = resolveAlarmAccessSummary({
      actualScheduledCount: 1,
      alarmStatus: {
        ...readyStatus,
        enabled: false,
        notificationsAllowed: false,
        triggerState: 'delivery-blocked',
        scheduledCount: 1,
        alarmSafety: {
          nextCheckAt: 0,
          lastCheckedAt: Date.now() - 1_000,
          issueCodes: ['notifications', 'schedule'],
          lastNotifiedAt: 0,
        },
      },
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
      totalPlannedAlarmCount: 3,
    });

    expect(result.description).toContain('알림 권한 필요.');
    expect(result.description).toContain('알람 예약 확인 필요.');
  });

  it('알람 저장소가 손상되면 권한 안내보다 근무표 기반 복구를 먼저 제공해요', () => {
    expect(summary({
      storageHealth: 'corrupt',
      exactAlarmAllowed: false,
      notificationsAllowed: false,
    })).toMatchObject({
      action: 'resync',
      actionLabel: '알람 정보 복구',
      title: '알람 정보 복구 필요',
    });
  });

  it('예약을 고치기 전에 전체 화면 권한을 먼저 준비해요', () => {
    expect(
      resolveAlarmAccessSummary({
        alarmStatus: { ...readyStatus, fullScreenAllowed: false },
        alarmStatusError: false,
        alarmSyncFailed: true,
        notificationsEnabled: true,
        platformSupported: true,
      }),
    ).toMatchObject({
      action: 'open-full-screen-settings',
      canTest: false,
      title: '전체 화면 권한 필요',
    });

    expect(
      resolveAlarmAccessSummary({
        actualScheduledCount: 0,
        alarmStatus: { ...readyStatus, fullScreenAllowed: false },
        alarmStatusError: false,
        notificationsEnabled: true,
        totalPlannedAlarmCount: 3,
        platformSupported: true,
      }),
    ).toMatchObject({
      action: 'open-full-screen-settings',
      canTest: false,
      title: '전체 화면 권한 필요',
    });
  });

  it('권한 확인 실패에는 한 개의 재시도 동작만 제공해요', () => {
    const result = resolveAlarmAccessSummary({
      alarmStatus: null,
      alarmStatusError: true,
      notificationsEnabled: true,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'retry',
      actionLabel: '다시 확인',
      canTest: false,
    });
  });

  it('저장은 끝났지만 알람 동기화가 실패하면 알람만 다시 예약해요', () => {
    const result = resolveAlarmAccessSummary({
      alarmStatus: readyStatus,
      alarmStatusError: false,
      alarmSyncFailed: true,
      notificationsEnabled: true,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'resync',
      actionLabel: '다시 예약',
      canTest: true,
      title: '알람 재예약 필요',
    });
  });

  it('권한이 모두 준비되면 시험 알람을 사용할 수 있어요', () => {
    expect(summary()).toMatchObject({
      action: 'none',
      canTest: true,
      title: '알람 사용 가능',
      tone: 'ready',
    });
  });

  it('자동 점검이 끝나면 예약 일치 상태를 간결하게 알려 줘요', () => {
    const result = resolveAlarmAccessSummary({
      alarmAutoCheckStatus: 'ready',
      alarmStatus: readyStatus,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'none',
      title: '자동 점검 완료',
      tone: 'ready',
    });
    expect(result.description).toContain('누락 시 앱 실행 때 자동 복구');
  });

  it('누락된 알람을 자동 복구한 경우 결과를 한 번에 알려 줘요', () => {
    expect(resolveAlarmAccessSummary({
      alarmAutoCheckStatus: 'recovered',
      alarmStatus: readyStatus,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    })).toMatchObject({
      action: 'none',
      title: '누락 알람 복구 완료',
      tone: 'ready',
    });
  });

  it('자동 점검 실패에는 저장된 근무표를 건드리지 않고 재시도만 제공해요', () => {
    expect(resolveAlarmAccessSummary({
      alarmAutoCheckStatus: 'error',
      alarmStatus: readyStatus,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    })).toMatchObject({
      action: 'resync',
      actionLabel: '다시 점검',
      title: '자동 점검 실패',
      tone: 'warning',
    });
  });

  it('자동 점검 상태보다 필요한 알람 권한을 먼저 안내해요', () => {
    const result = resolveAlarmAccessSummary({
      alarmAutoCheckStatus: 'recovered',
      alarmStatus: { ...readyStatus, exactAlarmAllowed: false },
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'open-exact-alarm-settings',
      title: '정확한 알람 권한 필요',
    });
  });

  it('알람 음량이 0이어도 시험 기능은 유지하며 한 곳에서 알려 줘요', () => {
    expect(summary({ alarmVolume: 0 })).toMatchObject({
      action: 'none',
      canTest: true,
      title: '알람 음량 0',
      tone: 'warning',
    });
  });

  it('방해 금지가 알람을 막을 수 있으면 전용 설정을 안내해요', () => {
    expect(
      summary({
        doNotDisturbActive: true,
        doNotDisturbMaySilenceAlarm: true,
      }),
    ).toMatchObject({
      action: 'open-dnd-settings',
      actionLabel: '방해 금지 설정',
      canTest: true,
      tone: 'warning',
    });
  });

  it('배터리 제한이 있으면 알람 사용을 막지 않고 설정 이동을 안내해요', () => {
    expect(summary({ batteryOptimizationIgnored: false })).toMatchObject({
      action: 'open-battery-settings',
      actionLabel: '배터리 설정 열기',
      canTest: true,
      description: '배터리 최적화에서 알람표를 제한 없음으로 설정',
      title: '배터리 제한 확인',
      tone: 'warning',
    });
  });

  it('배터리 안내보다 실제 예약 오류를 먼저 해결하도록 안내해요', () => {
    const result = resolveAlarmAccessSummary({
      actualScheduledCount: 1,
      alarmStatus: {
        ...readyStatus,
        batteryOptimizationIgnored: false,
        scheduledCount: 1,
      },
      alarmStatusError: false,
      notificationsEnabled: true,
      totalPlannedAlarmCount: 3,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'resync',
      title: '알람 예약 불일치',
    });
  });

  it('계획 갱신 시각이 가까우면 다음 366일을 이어서 예약하도록 안내해요', () => {
    const now = Date.now();
    expect(
      summary({
        plannedThroughAt: now + 10 * 24 * 60 * 60 * 1_000,
        planRefreshRecommendedAt: now - 1,
        planRefreshReminderPending: false,
      }),
    ).toMatchObject({
      action: 'resync',
      actionLabel: '다음 알람 이어서 예약',
      title: '알람 계획 갱신',
    });
  });

  it('계획이 만료되면 준비됨 대신 즉시 다시 예약하도록 안내해요', () => {
    const now = Date.now();
    expect(
      summary({
        plannedThroughAt: now - 1,
        planRefreshRecommendedAt: now - 14 * 24 * 60 * 60 * 1_000,
        planRefreshReminderPending: false,
      }),
    ).toMatchObject({
      action: 'resync',
      actionLabel: '다음 알람 다시 예약',
      title: '알람 계획 만료',
      tone: 'warning',
    });
  });

  it('계획과 실제 예약 수가 다르면 다시 예약하는 동작을 제공해요', () => {
    const result = resolveAlarmAccessSummary({
      actualScheduledCount: 1,
      alarmStatus: { ...readyStatus, scheduledCount: 1 },
      alarmStatusError: false,
      notificationsEnabled: true,
      totalPlannedAlarmCount: 3,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'resync',
      actionLabel: '다시 예약',
      canTest: true,
      title: '알람 예약 불일치',
      tone: 'warning',
    });
    expect(result.description).toBe(
      '다음 알람 3개 중 1개 예약 · 다시 예약 필요',
    );
  });

  it('전체 계획이 많아도 네이티브 상한인 다음 3개가 예약되면 정상으로 판단해요', () => {
    const result = resolveAlarmAccessSummary({
      actualScheduledCount: 3,
      alarmStatus: { ...readyStatus, scheduledCount: 3 },
      alarmStatusError: false,
      notificationsEnabled: true,
      totalPlannedAlarmCount: 61,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'none',
      title: '알람 사용 가능',
      tone: 'ready',
    });
  });

  it('전체 계획이 61개여도 실제 예약이 2개면 다음 3개 기준으로 안내해요', () => {
    const result = resolveAlarmAccessSummary({
      actualScheduledCount: 2,
      alarmStatus: { ...readyStatus, scheduledCount: 2 },
      alarmStatusError: false,
      notificationsEnabled: true,
      totalPlannedAlarmCount: 61,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      action: 'resync',
      description:
        '다음 알람 3개 중 2개 예약 · 다시 예약 필요',
      tone: 'warning',
    });
  });
});

describe('통합 알람 상태', () => {
  it('확인 중·준비됨·확인 필요를 상호 배타적으로 계산해요', () => {
    expect(resolveAlarmHealthState({
      alarmStatus: null,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    })).toMatchObject({ status: 'checking', issueCode: null });

    expect(resolveAlarmHealthState({
      alarmStatus: readyStatus,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    })).toMatchObject({ status: 'ready', issueCode: null });

    expect(resolveAlarmHealthState({
      alarmStatus: { ...readyStatus, exactAlarmAllowed: false },
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
    })).toMatchObject({
      status: 'action-required',
      issueCode: 'alarm-permissions',
      action: 'open-exact-alarm-settings',
    });
  });

  it('저장 뒤 알람 실패는 준비됨과 동시에 표시하지 않고 한 조치만 제공해요', () => {
    const result = resolveAlarmHealthState({
      alarmStatus: readyStatus,
      alarmStatusError: false,
      alarmSyncFailed: true,
      notificationsEnabled: true,
      platformSupported: true,
    });

    expect(result).toMatchObject({
      status: 'action-required',
      issueCode: 'alarm-schedule',
      action: 'resync',
      actionLabel: '다시 예약',
    });
  });

  it('계획 만료 판단은 전달한 기준 시각을 사용해요', () => {
    expect(resolveAlarmHealthState({
      alarmStatus: {
        ...readyStatus,
        plannedThroughAt: 2_000,
        planRefreshRecommendedAt: 1_000,
      },
      alarmStatusError: false,
      notificationsEnabled: true,
      now: 2_001,
      platformSupported: true,
    })).toMatchObject({
      issueCode: 'alarm-plan-expiry',
      title: '알람 계획 만료',
    });
  });

  it('저장소→권한→예약→수면→방해 금지→배터리→음량 순서로 한 조치만 골라요', () => {
    const sleepCorrupt = {
      supported: true,
      enabled: true,
      notificationsAllowed: false,
      scheduledCount: 0,
      storageHealth: 'corrupt' as const,
    };
    const compoundStatus = {
      ...readyStatus,
      storageHealth: 'corrupt' as const,
      exactAlarmAllowed: false,
      fullScreenAllowed: false,
      notificationsAllowed: false,
      doNotDisturbMaySilenceAlarm: true,
      batteryOptimizationIgnored: false,
      alarmVolume: 0,
    };
    const input = {
      actualScheduledCount: 0,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
      sleepReminderEnabled: true,
      sleepReminderStatus: sleepCorrupt,
      sleepReminderSupported: true,
      totalPlannedAlarmCount: 3,
    } as const;

    expect(resolveAlarmHealthState({ ...input, alarmStatus: compoundStatus }).issueCode)
      .toBe('alarm-storage');
    expect(resolveAlarmHealthState({
      ...input,
      alarmStatus: { ...compoundStatus, storageHealth: 'normal' },
    }).issueCode).toBe('alarm-permissions');
    expect(resolveAlarmHealthState({
      ...input,
      alarmStatus: {
        ...compoundStatus,
        storageHealth: 'normal',
        exactAlarmAllowed: true,
        notificationsAllowed: true,
      },
    }).issueCode).toBe('alarm-permissions');
    expect(resolveAlarmHealthState({
      ...input,
      alarmStatus: {
        ...compoundStatus,
        storageHealth: 'normal',
        exactAlarmAllowed: true,
        fullScreenAllowed: true,
        notificationsAllowed: true,
      },
    }).issueCode).toBe('alarm-schedule');

    const synchronizedInput = {
      ...input,
      actualScheduledCount: 3,
      alarmStatus: {
        ...readyStatus,
        doNotDisturbMaySilenceAlarm: true,
        batteryOptimizationIgnored: false,
        alarmVolume: 0,
        scheduledCount: 3,
      },
    };
    expect(resolveAlarmHealthState(synchronizedInput).issueCode)
      .toBe('sleep-reminder-storage');
    expect(resolveAlarmHealthState({
      ...synchronizedInput,
      sleepReminderStatus: {
        ...sleepCorrupt,
        notificationsAllowed: true,
        storageHealth: 'normal',
      },
    }).issueCode).toBe('do-not-disturb');
    expect(resolveAlarmHealthState({
      ...synchronizedInput,
      alarmStatus: {
        ...synchronizedInput.alarmStatus,
        doNotDisturbMaySilenceAlarm: false,
      },
      sleepReminderStatus: {
        ...sleepCorrupt,
        notificationsAllowed: true,
        storageHealth: 'normal',
      },
    }).issueCode).toBe('battery-optimization');
    expect(resolveAlarmHealthState({
      ...synchronizedInput,
      alarmStatus: {
        ...synchronizedInput.alarmStatus,
        doNotDisturbMaySilenceAlarm: false,
        batteryOptimizationIgnored: true,
      },
      sleepReminderStatus: {
        ...sleepCorrupt,
        notificationsAllowed: true,
        storageHealth: 'normal',
      },
    }).issueCode).toBe('alarm-volume');
  });

  it('Store의 독립 수면 동기화 상태를 알람 건강 상태에 직접 반영해요', () => {
    const input = {
      alarmStatus: readyStatus,
      alarmStatusError: false,
      notificationsEnabled: true,
      platformSupported: true,
      sleepReminderEnabled: true,
      sleepReminderStatus: {
        supported: true,
        enabled: true,
        notificationsAllowed: true,
        scheduledCount: 2,
        storageHealth: 'normal' as const,
      },
      sleepReminderSupported: true,
    } as const;

    expect(resolveAlarmHealthState({
      ...input,
      sleepReminderSyncStatus: 'error',
    })).toMatchObject({
      status: 'action-required',
      issueCode: 'sleep-reminder-schedule',
      action: 'retry-sleep-reminders',
    });
    expect(resolveAlarmHealthState({
      ...input,
      sleepReminderSyncStatus: 'syncing',
    })).toMatchObject({ status: 'checking', issueCode: null });
    expect(resolveAlarmHealthState({
      ...input,
      sleepReminderSyncStatus: 'synced',
    })).toMatchObject({ status: 'ready', issueCode: null });
  });
});
