import type { AlarmPyoAlarmPlan } from "../../services/alarm-planner";
import type { AlarmAutoCheckStatus } from "../../services/alarm-sync-policy";
import { isAlarmPyoAlarmPlanContentSynchronized } from "../../services/alarm-sync-policy";
import type { AlarmPyoAlarmStatus } from "../../services/alarmpyo-alarm-service";

export type AlarmStatusBannerTone = "neutral" | "success" | "warning";

/**
 * 자동 점검 오류는 예약 내용이 실제로 어긋난 동안에만 화면에 남겨요.
 * 앱 복귀 과정에서 이미 복구된 예약을 이전 오류 상태가 계속 가리지 않게 해요.
 */
export function resolveVisibleAlarmAutoCheckStatus({
  alarmStatus,
  notificationsEnabled,
  plannedAlarms,
  status,
}: {
  alarmStatus: AlarmPyoAlarmStatus | null;
  notificationsEnabled: boolean;
  plannedAlarms: readonly AlarmPyoAlarmPlan[];
  status: AlarmAutoCheckStatus;
}): AlarmAutoCheckStatus {
  if (
    status !== "error" ||
    !notificationsEnabled ||
    !alarmStatus?.supported ||
    !alarmStatus.exactAlarmAllowed ||
    !alarmStatus.notificationsAllowed
  ) {
    return status;
  }

  return isAlarmPyoAlarmPlanContentSynchronized({
    actualScheduledAlarms: alarmStatus.scheduledAlarms,
    exactAlarmAllowed: alarmStatus.exactAlarmAllowed,
    notificationsAllowed: alarmStatus.notificationsAllowed,
    plannedAlarms,
  })
    ? "ready"
    : status;
}

export function resolveAlarmStatusBannerTone(
  tone: "neutral" | "ready" | "warning",
): AlarmStatusBannerTone {
  if (tone === "ready") return "success";
  if (tone === "warning") return "warning";
  return "neutral";
}

export function resolveAlarmScheduleEmptyCopy({
  notificationsEnabled,
  plannedAlarmCount,
}: {
  notificationsEnabled: boolean;
  plannedAlarmCount: number;
}): string {
  if (!notificationsEnabled) {
    return "근무 알람을 켜면 다음 근무부터 자동으로 예약해요.";
  }
  if (plannedAlarmCount === 0) {
    return "예정된 근무가 생기면 알람을 자동으로 예약해요.";
  }
  return "알람 권한을 확인하거나 근무표에 맞춰 다시 예약해 주세요.";
}
