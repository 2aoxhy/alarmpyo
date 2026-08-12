import type { AlarmPyoAlarmPlan } from "../../services/alarm-planner";
import type { AlarmAutoCheckStatus } from "../../services/alarm-sync-policy";
import { isAlarmPyoAlarmPlanContentSynchronized } from "../../services/alarm-sync-policy";
import type { AlarmPyoAlarmStatus } from "../../services/alarmpyo-alarm-service";
import type { SleepReminderStatus } from "../../services/sleep-reminder-service";

export type AlarmStatusBannerTone = "neutral" | "success" | "warning";

export type SleepReminderStorageNotice = {
  actionLabel?: string;
  message: string;
  title: string;
  tone: "success" | "danger";
};

export function resolveSleepReminderStorageNotice({
  enabled,
  status,
}: {
  enabled: boolean;
  status: Pick<SleepReminderStatus, "storageHealth"> | null;
}): SleepReminderStorageNotice | null {
  if (status?.storageHealth === "recovered") {
    return {
      message: "직전 정상 계획으로 복구하고 예약 상태를 다시 확인했어요.",
      title: "수면 알림 계획을 복구했어요",
      tone: "success",
    };
  }
  if (status?.storageHealth !== "corrupt") return null;

  if (enabled) {
    return {
      actionLabel: "복구 다시 시도하기",
      message:
        "기존 예약은 임의로 지우지 않았어요. 현재 일정으로 복구를 다시 시도해 주세요.",
      title: "수면 알림 계획을 복구하지 못했어요",
      tone: "danger",
    };
  }
  return {
    actionLabel: "수면 알림을 켜고 복구하기",
    message:
      "기존 예약은 임의로 지우지 않았어요. 수면 시작 알림을 켜면 현재 일정으로 복구를 시도해요.",
    title: "수면 알림 계획을 복구하지 못했어요",
    tone: "danger",
  };
}

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
