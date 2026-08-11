import { describe, expect, it } from 'vitest';

import type { AlarmPyoAlarmStatus } from '../alarmpyo-alarm-service';
import {
  getAlarmPyoSafetyIssues,
  WIDGET_SNAPSHOT_MAX_AGE_MS,
} from '../alarmpyo-safety-check';

const ALARM = {
  dateKey: '2026-07-14',
  shiftTypeId: 'night',
  shiftName: '야간',
  alarmAt: new Date(2026, 6, 14, 16, 0).getTime(),
  startMinutes: 18 * 60,
  alarmMinutesBefore: 2 * 60,
};
const SCHEDULED_ALARMS = Array.from({ length: 3 }, (_, index) => ({
  ...ALARM,
  id: `alarm-${index + 1}`,
  alarmAt: ALARM.alarmAt + index * 24 * 60 * 60 * 1000,
}));
const NOW = new Date(2026, 6, 13, 12, 0).getTime();
const STATUS: AlarmPyoAlarmStatus = {
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
  alarmVolume: 5,
  plannedThroughAt: 0,
  planRefreshRecommendedAt: 0,
  planRefreshReminderPending: false,
  scheduledAlarms: SCHEDULED_ALARMS,
  scheduledCount: 3,
  widgetInstalled: false,
  widgetSnapshotGeneratedAt: 0,
  recentEvents: [],
};

function issues(
  patch: Partial<AlarmPyoAlarmStatus> = {},
  input: Partial<Parameters<typeof getAlarmPyoSafetyIssues>[0]> = {},
) {
  return getAlarmPyoSafetyIssues({
    notificationsEnabled: true,
    plannedAlarmCount: 30,
    status: { ...STATUS, ...patch },
    now: NOW,
    ...input,
  });
}

describe('ALARMPYO 자동 안전 점검', () => {
  it('권한·음량·다음 3개 예약이 정상이면 아무것도 표시하지 않아요', () => {
    expect(issues()).toEqual([]);
  });

  it('알람을 사용하지 않으면 권한·음량·예약 상태를 모두 경고하지 않아요', () => {
    expect(issues({
      exactAlarmAllowed: false,
      fullScreenAllowed: false,
      notificationsAllowed: false,
      alarmVolume: 0,
      scheduledAlarms: [],
      scheduledCount: 0,
    }, { notificationsEnabled: false })).toEqual([]);
    expect(getAlarmPyoSafetyIssues({
      notificationsEnabled: false,
      plannedAlarmCount: 0,
      status: null,
      statusError: true,
    })).toEqual([]);
  });

  it('방해 금지가 알람을 차단할 수 있으면 안전 점검에 표시해요', () => {
    expect(
      issues({ doNotDisturbActive: true, doNotDisturbMaySilenceAlarm: true }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'do-not-disturb', priority: 15 }),
      ]),
    );
  });

  it('배터리 최적화 예외가 아니면 알람을 차단하지 않는 별도 경고를 표시해요', () => {
    expect(issues({ batteryOptimizationIgnored: false })).toEqual([
      expect.objectContaining({
        code: 'battery-optimization',
        priority: 40,
      }),
    ]);
  });

  it('알람 계획 갱신 시각이 지나면 만료 전에 알려요', () => {
    expect(
      issues({
        plannedThroughAt: NOW + 10 * 24 * 60 * 60 * 1_000,
        planRefreshRecommendedAt: NOW - 1,
        planRefreshReminderPending: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'alarm-plan-expiry', priority: 35 }),
      ]),
    );
  });

  it('문제를 중요도 순서로 정리하고 부족한 권한을 한 항목으로 묶어요', () => {
    const result = issues({
      fullScreenAllowed: false,
      alarmVolume: 0,
      scheduledAlarms: SCHEDULED_ALARMS.slice(0, 2),
      scheduledCount: 2,
    });

    expect(result.map((issue) => issue.code)).toEqual([
      'alarm-permissions',
      'alarm-volume',
      'alarm-schedule',
    ]);
    expect(result[0]).toEqual({
      code: 'alarm-permissions',
      priority: 10,
      title: '알람 권한을 확인해 주세요',
      detail: '전체 화면 알람 권한이 꺼져 있어요.',
    });
    expect(result[2].detail).toBe('다음 알람 3개 중 2개만 예약됐어요.');
  });

  it('예약 권한이 없으면 정상적인 예약 0개를 별도 문제로 중복 안내하지 않아요', () => {
    const result = issues({
      exactAlarmAllowed: false,
      notificationsAllowed: false,
      scheduledAlarms: [],
      scheduledCount: 0,
    });
    expect(result.map((issue) => issue.code)).toEqual(['alarm-permissions']);
  });

  it('알림이 차단되면 저장된 안전 점검의 유효한 예약·저장 문제를 함께 합쳐요', () => {
    const result = issues({
      notificationsAllowed: false,
      storageHealth: 'corrupt',
      scheduledAlarms: SCHEDULED_ALARMS.slice(0, 1),
      scheduledCount: 1,
      alarmSafety: {
        nextCheckAt: 0,
        lastCheckedAt: NOW - 1_000,
        issueCodes: [
          'exact-alarm',
          'full-screen',
          'notifications',
          'do-not-disturb',
          'battery-optimization',
          'alarm-volume',
          'schedule',
          'storage',
        ],
        lastNotifiedAt: 0,
      },
    });

    expect(result.map((issue) => issue.code)).toEqual([
      'alarm-permissions',
      'do-not-disturb',
      'alarm-volume',
      'alarm-storage',
      'alarm-schedule',
      'battery-optimization',
    ]);
  });

  it('이미 해결된 저장 안전 이슈는 이전 기록만으로 다시 표시하지 않아요', () => {
    expect(issues({
      alarmSafety: {
        nextCheckAt: 0,
        lastCheckedAt: NOW - 1_000,
        issueCodes: ['storage'],
        lastNotifiedAt: 0,
      },
    })).toEqual([]);
  });

  it('계획이 2개뿐이면 실제 예약도 2개일 때 정상으로 판단해요', () => {
    expect(issues({
      scheduledAlarms: SCHEDULED_ALARMS.slice(0, 2),
      scheduledCount: 2,
    }, { plannedAlarmCount: 2 })).toEqual([]);
  });

  it('예약 개수와 목록이 다르거나 불필요한 예약이 남으면 다시 동기화하도록 안내해요', () => {
    expect(issues({ scheduledCount: 3, scheduledAlarms: SCHEDULED_ALARMS.slice(0, 2) }))
      .toContainEqual(expect.objectContaining({
        code: 'alarm-schedule',
        detail: '예약 정보가 서로 맞지 않아 다시 동기화해야 해요.',
      }));
    expect(issues({
      scheduledCount: 1,
      scheduledAlarms: SCHEDULED_ALARMS.slice(0, 1),
    }, { plannedAlarmCount: 0 })).toContainEqual(expect.objectContaining({
      code: 'alarm-schedule',
      detail: '예정된 근무는 없지만 알람 1개가 남아 있어요.',
    }));
  });

  it('상태 조회 실패와 지원되지 않는 설치본을 알람 사용 중에만 알려요', () => {
    expect(getAlarmPyoSafetyIssues({
      notificationsEnabled: true,
      plannedAlarmCount: 1,
      status: null,
      statusError: true,
      now: NOW,
    })).toEqual([{
      code: 'status-unavailable',
      priority: 5,
      title: '알람 상태를 확인할 수 없어요',
      detail: '알람 설정에서 권한을 확인한 뒤 다시 시도해 주세요.',
    }]);
    expect(issues({ supported: false })).toEqual([expect.objectContaining({
      code: 'status-unavailable',
      priority: 5,
    })]);
  });

  it('위젯 미설치는 정상이고 설치된 위젯의 비정상 스냅샷만 낮은 우선순위로 알려요', () => {
    expect(issues({
      widgetInstalled: false,
      widgetSnapshotGeneratedAt: 0,
    }, { notificationsEnabled: false })).toEqual([]);

    const missing = issues({
      widgetInstalled: true,
      widgetSnapshotGeneratedAt: 0,
    }, { notificationsEnabled: false });
    expect(missing).toEqual([{
      code: 'widget-snapshot',
      priority: 90,
      title: '홈 화면 위젯을 갱신해 주세요',
      detail: '알람표를 다시 열어 최신 근무 정보를 위젯에 반영해 주세요.',
    }]);

    expect(issues({
      widgetInstalled: true,
      widgetSnapshotGeneratedAt: NOW - WIDGET_SNAPSHOT_MAX_AGE_MS,
    }, { notificationsEnabled: false })).toEqual([]);
    expect(issues({
      widgetInstalled: true,
      widgetSnapshotGeneratedAt: NOW - WIDGET_SNAPSHOT_MAX_AGE_MS - 1,
    }, { notificationsEnabled: false })).toContainEqual(expect.objectContaining({
      code: 'widget-snapshot',
      priority: 90,
    }));
    expect(issues({
      widgetInstalled: true,
      widgetSnapshotGeneratedAt: NOW + 5 * 60 * 1000 + 1,
    }, { notificationsEnabled: false })).toContainEqual(expect.objectContaining({
      code: 'widget-snapshot',
      priority: 90,
    }));
  });
});
