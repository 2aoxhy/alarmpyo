import { describe, expect, it } from "vitest";

import type { AlarmPyoAlarmPlan } from "../../services/alarm-planner";
import type { AlarmPyoAlarmStatus } from "../../services/alarmpyo-alarm-service";

import {
  resolveAlarmScheduleEmptyCopy,
  resolveAlarmStatusBannerTone,
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
});
