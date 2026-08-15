import { describe, expect, it } from "vitest";

import type { AlarmPyoAlarmPlan } from "../../services/alarm-planner";
import type { AlarmPyoAlarmStatus } from "../../services/alarmpyo-alarm-service";

import {
  resolveAlarmScheduleEmptyCopy,
  resolveAlarmStatusBannerTone,
  resolveSleepReminderStorageNotice,
  resolveVisibleAlarmAutoCheckStatus,
} from "./alarm-settings-view-model";

const alarm: AlarmPyoAlarmPlan = {
  id: "day-1",
  dateKey: "2026-08-10",
  shiftTypeId: "day",
  shiftName: "주간",
  alarmAt: Date.UTC(2026, 7, 9, 20, 10),
  startMinutes: 7 * 60,
  alarmMinutesBefore: 110,
};

function readyStatus(
  scheduledAlarms: AlarmPyoAlarmPlan[] = [alarm],
): AlarmPyoAlarmStatus {
  return {
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
    scheduledAlarms,
    scheduledCount: scheduledAlarms.length,
    widgetInstalled: false,
    widgetSnapshotGeneratedAt: 0,
    recentEvents: [],
  };
}

describe("알람 설정 화면 상태", () => {
  it("실제 예약 내용이 근무표와 같으면 이전 점검 오류를 준비 상태로 정리해요", () => {
    expect(
      resolveVisibleAlarmAutoCheckStatus({
        alarmStatus: readyStatus(),
        notificationsEnabled: true,
        plannedAlarms: [alarm],
        status: "error",
      }),
    ).toBe("ready");
  });

  it("예약 내용이 다르면 점검 오류를 그대로 안내해요", () => {
    expect(
      resolveVisibleAlarmAutoCheckStatus({
        alarmStatus: readyStatus([{ ...alarm, alarmAt: alarm.alarmAt + 60_000 }]),
        notificationsEnabled: true,
        plannedAlarms: [alarm],
        status: "error",
      }),
    ).toBe("error");
  });

  it("권한이 준비되지 않은 상태를 완료로 바꾸지 않아요", () => {
    expect(
      resolveVisibleAlarmAutoCheckStatus({
        alarmStatus: { ...readyStatus(), exactAlarmAllowed: false },
        notificationsEnabled: true,
        plannedAlarms: [alarm],
        status: "error",
      }),
    ).toBe("error");
  });

  it("상태 배너의 의미와 빈 예약 안내를 간결하게 유지해요", () => {
    expect(resolveAlarmStatusBannerTone("ready")).toBe("success");
    expect(resolveAlarmStatusBannerTone("warning")).toBe("warning");
    expect(
      resolveAlarmScheduleEmptyCopy({
        notificationsEnabled: false,
        plannedAlarmCount: 3,
      }),
    ).toContain("알람을 켜면");
    expect(
      resolveAlarmScheduleEmptyCopy({
        notificationsEnabled: true,
        plannedAlarmCount: 0,
      }),
    ).toContain("예정된 근무");
  });

  it("수면 알림 저장소 복구와 손상 상태를 다음 행동과 함께 안내해요", () => {
    expect(
      resolveSleepReminderStorageNotice({
        enabled: true,
        status: { storageHealth: "normal" },
      }),
    ).toBeNull();
    expect(
      resolveSleepReminderStorageNotice({
        enabled: true,
        status: { storageHealth: "recovered" },
      }),
    ).toEqual({
      message: "직전 정상 계획으로 복구하고 예약 상태를 다시 확인했습니다.",
      title: "수면 알림 계획을 복구했습니다",
      tone: "success",
    });
    expect(
      resolveSleepReminderStorageNotice({
        enabled: true,
        status: { storageHealth: "corrupt" },
      }),
    ).toMatchObject({
      actionLabel: "복구 다시 시도하기",
      tone: "danger",
    });
    expect(
      resolveSleepReminderStorageNotice({
        enabled: false,
        status: { storageHealth: "corrupt" },
      }),
    ).toMatchObject({
      actionLabel: "수면 알림을 켜고 복구하기",
      message: expect.stringContaining("수면 시작 알림을 켜면"),
      tone: "danger",
    });
  });
});
