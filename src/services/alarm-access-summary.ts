import {
  getExpectedNativeScheduledAlarmCount,
  isAlarmPyoAlarmScheduleSynchronized,
  type AlarmAutoCheckStatus,
} from './alarm-sync-policy';
import type { AlarmPyoAlarmStatus } from './alarmpyo-alarm-service';
import type { AlarmPyoSafetyIssueCode } from './alarmpyo-safety-check';
import type { SleepReminderStatus } from './sleep-reminder-service';

export type AlarmAccessAction =
  | 'none'
  | 'open-settings'
  | 'open-exact-alarm-settings'
  | 'open-notification-settings'
  | 'open-full-screen-settings'
  | 'open-dnd-settings'
  | 'open-battery-settings'
  | 'open-sleep-settings'
  | 'resync'
  | 'retry-sleep-reminders'
  | 'retry';
export type AlarmAccessTone = 'neutral' | 'ready' | 'warning';

export type AlarmRequiredPermissionTarget =
  | 'exact-alarm'
  | 'alarm-notifications'
  | 'full-screen';

export type AlarmPermissionReadiness = {
  nextRequiredTarget: AlarmRequiredPermissionTarget | null;
  readyRequiredCount: number;
  requiredTotal: 3;
};

export type AlarmAccessSummary = {
  action: AlarmAccessAction;
  actionLabel?: string;
  canTest: boolean;
  description: string;
  title: string;
  tone: AlarmAccessTone;
};

export type AlarmHealthStatus =
  | 'disabled'
  | 'checking'
  | 'ready'
  | 'action-required'
  | 'error';

export type AlarmHealthIssueCode =
  | AlarmPyoSafetyIssueCode
  | 'platform-unsupported'
  | 'notifications-disabled'
  | 'sleep-reminder-status'
  | 'sleep-reminder-storage'
  | 'sleep-reminder-permissions'
  | 'sleep-reminder-schedule';

export type AlarmHealthState = AlarmAccessSummary & {
  status: AlarmHealthStatus;
  issueCode: AlarmHealthIssueCode | null;
};

export type AlarmHealthStateInput = {
  actualScheduledCount?: number;
  alarmAutoCheckStatus?: AlarmAutoCheckStatus;
  alarmStatus: AlarmPyoAlarmStatus | null;
  alarmStatusError: boolean;
  alarmSyncFailed?: boolean;
  notificationsEnabled: boolean;
  now?: number;
  sleepReminderEnabled?: boolean;
  sleepReminderStatus?: SleepReminderStatus | null;
  sleepReminderStatusError?: boolean;
  sleepReminderSupported?: boolean;
  sleepReminderSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  /** @deprecated Pass sleepReminderSyncStatus from the Store instead. */
  sleepReminderSyncFailed?: boolean;
  totalPlannedAlarmCount?: number;
  platformSupported: boolean;
};

const REQUIRED_PERMISSION_ORDER: readonly AlarmRequiredPermissionTarget[] = [
  'exact-alarm',
  'alarm-notifications',
  'full-screen',
];

/**
 * 화면과 네이티브 설정 이동이 같은 필수 권한 순서를 공유하도록 계산합니다.
 * 권장 안정성 항목은 알람 사용 자체를 막지 않으므로 준비 개수에 포함하지 않습니다.
 */
export function resolveAlarmPermissionReadiness(
  alarmStatus: AlarmPyoAlarmStatus | null,
): AlarmPermissionReadiness {
  const readyByTarget: Record<AlarmRequiredPermissionTarget, boolean> = {
    'exact-alarm': alarmStatus?.exactAlarmAllowed === true,
    'alarm-notifications': alarmStatus?.notificationsAllowed === true,
    'full-screen': alarmStatus?.fullScreenAllowed === true,
  };
  const readyRequiredCount = REQUIRED_PERMISSION_ORDER.filter(
    (target) => readyByTarget[target],
  ).length;

  return {
    nextRequiredTarget:
      REQUIRED_PERMISSION_ORDER.find((target) => !readyByTarget[target]) ?? null,
    readyRequiredCount,
    requiredTotal: 3,
  };
}

function persistedSafetyNote({
  actualScheduledCount,
  alarmStatus,
  totalPlannedAlarmCount,
}: Pick<
  AlarmHealthStateInput,
  'actualScheduledCount' | 'alarmStatus' | 'totalPlannedAlarmCount'
>): string {
  if (!alarmStatus?.alarmSafety) return '';
  const codes = new Set(alarmStatus.alarmSafety.issueCodes);
  const labels: string[] = [];
  if (codes.has('storage') && alarmStatus.storageHealth !== 'normal') {
    labels.push('알람 저장 정보');
  }
  if (
    codes.has('schedule') &&
    actualScheduledCount !== undefined &&
    totalPlannedAlarmCount !== undefined &&
    actualScheduledCount !== getExpectedNativeScheduledAlarmCount({
      exactAlarmAllowed: alarmStatus.exactAlarmAllowed,
      notificationsAllowed: alarmStatus.notificationsAllowed,
      plannedAlarmCount: totalPlannedAlarmCount,
    })
  ) {
    labels.push('알람 예약');
  }
  if (codes.has('do-not-disturb') && alarmStatus.doNotDisturbMaySilenceAlarm) {
    labels.push('방해 금지');
  }
  if (codes.has('battery-optimization') && !alarmStatus.batteryOptimizationIgnored) {
    labels.push('배터리 사용 제한');
  }
  if (codes.has('alarm-volume') && alarmStatus.alarmVolume <= 0) {
    labels.push('알람 음량');
  }
  return labels.length > 0
    ? ` 최근 안전 점검: ${labels.join('·')} 확인 필요.`
    : '';
}

/**
 * 알람 화면에는 지금 필요한 조치 하나만 표시합니다.
 * 네이티브 설정 화면도 정확한 알람 → 알림 → 전체 화면 순서로 열립니다.
 */
export function resolveAlarmHealthState({
  actualScheduledCount,
  alarmAutoCheckStatus = 'idle',
  alarmStatus,
  alarmStatusError,
  alarmSyncFailed = false,
  notificationsEnabled,
  now = Date.now(),
  sleepReminderEnabled = false,
  sleepReminderStatus = null,
  sleepReminderStatusError = false,
  sleepReminderSupported = false,
  sleepReminderSyncStatus,
  sleepReminderSyncFailed = false,
  totalPlannedAlarmCount,
  platformSupported,
}: AlarmHealthStateInput): AlarmHealthState {
  const resolvedSleepReminderSyncStatus =
    sleepReminderSyncStatus ?? (sleepReminderSyncFailed ? 'error' : 'idle');
  if (!Number.isFinite(now)) {
    throw new RangeError('알람 상태 기준 시각이 올바르지 않습니다.');
  }
  if (!platformSupported) {
    return {
      status: 'disabled',
      issueCode: 'platform-unsupported',
      action: 'none',
      canTest: false,
      description: '근무 알람은 Android에서 사용',
      title: 'Android 전용',
      tone: 'neutral',
    };
  }

  if (!notificationsEnabled) {
    return {
      status: 'disabled',
      issueCode: 'notifications-disabled',
      action: 'none',
      canTest: false,
      description: '켜면 다음 근무 알람 자동 예약',
      title: '근무 알람 꺼짐',
      tone: 'neutral',
    };
  }

  if (alarmStatusError) {
    return {
      status: 'error',
      issueCode: 'status-unavailable',
      action: 'retry',
      actionLabel: '다시 확인',
      canTest: false,
      description: '근무표 유지 · 알람 상태만 다시 확인',
      title: '상태 확인 실패',
      tone: 'warning',
    };
  }

  if (!alarmStatus) {
    return {
      status: 'checking',
      issueCode: null,
      action: 'none',
      canTest: false,
      description: '권한과 예약 상태 확인 중',
      title: '알람 확인 중',
      tone: 'neutral',
    };
  }

  if (!alarmStatus.supported) {
    return {
      status: 'error',
      issueCode: 'status-unavailable',
      action: 'none',
      canTest: false,
      description: '이 기기는 근무 알람을 지원하지 않음',
      title: '알람 미지원',
      tone: 'warning',
    };
  }

  if (alarmStatus.storageHealth === 'corrupt') {
    return {
      status: 'action-required',
      issueCode: 'alarm-storage',
      action: 'resync',
      actionLabel: '알람 정보 복구',
      canTest: false,
      description: '기기 예약 정보 손상 · 저장된 근무표로 다시 생성',
      title: '알람 정보 복구 필요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.exactAlarmAllowed) {
    return {
      status: 'action-required',
      issueCode: 'alarm-permissions',
      action: 'open-exact-alarm-settings',
      actionLabel: '정확한 알람 설정',
      canTest: false,
      description: '근무 시각 알람에 알람 및 리마인더 권한 필요',
      title: '정확한 알람 권한 필요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.notificationsAllowed) {
    const safetyNote = persistedSafetyNote({
      actualScheduledCount,
      alarmStatus,
      totalPlannedAlarmCount,
    });
    return {
      status: 'action-required',
      issueCode: 'alarm-permissions',
      action: 'open-notification-settings',
      actionLabel: '알림 설정 열기',
      canTest: false,
      description:
        alarmStatus.triggerState === 'delivery-blocked'
          ? `예약 유지 · 화면과 소리 전달에 알림 권한 필요.${safetyNote}`
          : `알람 화면과 소리 전달에 알림 권한 필요.${safetyNote}`,
      title:
        alarmStatus.triggerState === 'delivery-blocked'
          ? '예약 유지 · 알림 차단'
          : '알림 권한 필요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.fullScreenAllowed) {
    return {
      status: 'action-required',
      issueCode: 'alarm-permissions',
      action: 'open-full-screen-settings',
      actionLabel: '전체 화면 설정',
      canTest: false,
      description: '잠금 화면과 시험 알람에 전체 화면 권한 필요',
      title: '전체 화면 권한 필요',
      tone: 'warning',
    };
  }

  const canTestAlarm = true;

  if (alarmSyncFailed) {
    return {
      status: 'action-required',
      issueCode: 'alarm-schedule',
      action: 'resync',
      actionLabel: '다시 예약',
      canTest: canTestAlarm,
      description: '변경 내용 저장 완료 · 알람만 다시 예약',
      title: '알람 재예약 필요',
      tone: 'warning',
    };
  }

  if (
    alarmStatus.plannedThroughAt > 0 &&
    now >= alarmStatus.plannedThroughAt
  ) {
    return {
      status: 'action-required',
      issueCode: 'alarm-plan-expiry',
      action: 'resync',
      actionLabel: '다음 알람 다시 예약',
      canTest: canTestAlarm,
      description: '알람 계획 만료 · 근무표로 다시 예약',
      title: '알람 계획 만료',
      tone: 'warning',
    };
  }

  if (
    alarmStatus.planRefreshRecommendedAt > 0 &&
    now >= alarmStatus.planRefreshRecommendedAt
  ) {
    return {
      status: 'action-required',
      issueCode: 'alarm-plan-expiry',
      action: 'resync',
      actionLabel: '다음 알람 이어서 예약',
      canTest: canTestAlarm,
      description: '저장된 근무표로 다음 366일 예약',
      title: '알람 계획 갱신',
      tone: 'warning',
    };
  }

  const scheduleCountInput =
    totalPlannedAlarmCount !== undefined && actualScheduledCount !== undefined
      ? {
          actualScheduledCount,
          exactAlarmAllowed: alarmStatus.exactAlarmAllowed,
          notificationsAllowed: alarmStatus.notificationsAllowed,
          plannedAlarmCount: totalPlannedAlarmCount,
        }
      : null;

  if (
    scheduleCountInput &&
    !isAlarmPyoAlarmScheduleSynchronized(scheduleCountInput)
  ) {
    const expectedScheduledCount = getExpectedNativeScheduledAlarmCount(
      scheduleCountInput,
    );
    return {
      status: 'action-required',
      issueCode: 'alarm-schedule',
      action: 'resync',
      actionLabel: '다시 예약',
      canTest: canTestAlarm,
      description:
        expectedScheduledCount === 0
          ? `예정 근무 없음 · 남은 알람 ${actualScheduledCount}개 제거 필요`
          : `다음 알람 ${expectedScheduledCount}개 중 ${actualScheduledCount}개 예약 · 다시 예약 필요`,
      title: '알람 예약 불일치',
      tone: 'warning',
    };
  }

  if (alarmAutoCheckStatus === 'error') {
    return {
      status: 'action-required',
      issueCode: 'alarm-schedule',
      action: 'resync',
      actionLabel: '다시 점검',
      canTest: true,
      description: '근무표 유지 · 알람 예약만 다시 점검',
      title: '자동 점검 실패',
      tone: 'warning',
    };
  }

  if (sleepReminderEnabled) {
    if (!sleepReminderSupported) {
      return {
        status: 'error',
        issueCode: 'sleep-reminder-status',
        action: 'none',
        canTest: true,
        description: '이 설치본에서 수면 알림 상태 확인 불가',
        title: '수면 알림 미지원',
        tone: 'warning',
      };
    }
    if (sleepReminderStatusError) {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-status',
        action: 'retry-sleep-reminders',
        actionLabel: '수면 알림 다시 확인',
        canTest: true,
        description: '근무 알람 유지 · 수면 알림만 다시 확인',
        title: '수면 알림 확인 실패',
        tone: 'warning',
      };
    }
    if (!sleepReminderStatus) {
      return {
        status: 'checking',
        issueCode: null,
        action: 'none',
        canTest: true,
        description: '수면 알림 상태 확인 중',
        title: '수면 알림 확인 중',
        tone: 'neutral',
      };
    }
    if (!sleepReminderStatus.supported) {
      return {
        status: 'error',
        issueCode: 'sleep-reminder-status',
        action: 'none',
        canTest: true,
        description: '이 설치본에서 수면 알림 상태 확인 불가',
        title: '수면 알림 미지원',
        tone: 'warning',
      };
    }
    if (sleepReminderStatus.storageHealth === 'corrupt') {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-storage',
        action: 'retry-sleep-reminders',
        actionLabel: '수면 알림 복구',
        canTest: true,
        description: '기존 예약 유지 · 현재 일정으로 복구 재시도',
        title: '수면 알림 복구 필요',
        tone: 'warning',
      };
    }
    if (!sleepReminderStatus.notificationsAllowed) {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-permissions',
        action: 'open-sleep-settings',
        actionLabel: '수면 알림 권한 설정',
        canTest: true,
        description: '취침 시각 알림에 일반 알림 권한 필요',
        title: '수면 알림 권한 필요',
        tone: 'warning',
      };
    }
    if (resolvedSleepReminderSyncStatus === 'error') {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-schedule',
        action: 'retry-sleep-reminders',
        actionLabel: '수면 알림 다시 갱신',
        canTest: true,
        description: '현재 일정으로 수면 알림만 다시 갱신',
        title: '수면 알림 갱신 필요',
        tone: 'warning',
      };
    }
    if (resolvedSleepReminderSyncStatus === 'syncing') {
      return {
        status: 'checking',
        issueCode: null,
        action: 'none',
        canTest: true,
        description: '현재 근무표로 갱신 중',
        title: '수면 알림 갱신 중',
        tone: 'neutral',
      };
    }
  }

  if (alarmStatus.doNotDisturbMaySilenceAlarm) {
    return {
      status: 'action-required',
      issueCode: 'do-not-disturb',
      action: 'open-dnd-settings',
      actionLabel: '방해 금지 설정',
      canTest: canTestAlarm,
      description: '방해 금지로 알람 소리가 막힐 수 있음 · 알람 허용 여부 확인',
      title: '방해 금지 확인',
      tone: 'warning',
    };
  }

  if (!alarmStatus.batteryOptimizationIgnored) {
    return {
      status: 'action-required',
      issueCode: 'battery-optimization',
      action: 'open-battery-settings',
      actionLabel: '배터리 설정 열기',
      canTest: true,
      description: '배터리 최적화에서 알람표를 제한 없음으로 설정',
      title: '배터리 제한 확인',
      tone: 'warning',
    };
  }

  if (alarmStatus.alarmVolume <= 0) {
    return {
      status: 'action-required',
      issueCode: 'alarm-volume',
      action: 'none',
      canTest: true,
      description: '필수 권한 허용됨 · 휴대폰 알람 음량 조정 필요',
      title: '알람 음량 0',
      tone: 'warning',
    };
  }

  if (alarmAutoCheckStatus === 'checking') {
    return {
      status: 'checking',
      issueCode: null,
      action: 'none',
      canTest: true,
      description: '가까운 알람과 근무표 비교 중',
      title: '예약 확인 중',
      tone: 'neutral',
    };
  }

  if (alarmAutoCheckStatus === 'recovered') {
    return {
      status: 'ready',
      issueCode: null,
      action: 'none',
      canTest: true,
      description: '누락된 예약을 근무표에 맞춰 재등록',
      title: '누락 알람 복구 완료',
      tone: 'ready',
    };
  }

  return {
    status: 'ready',
    issueCode: null,
    action: 'none',
    canTest: true,
    description:
      alarmAutoCheckStatus === 'ready'
        ? '근무표와 예약 일치 · 누락 시 앱 실행 때 자동 복구'
        : '전체 화면 알람 · 미해제 시 5분 뒤 재알림',
    title:
      alarmAutoCheckStatus === 'ready'
        ? '자동 점검 완료'
        : '알람 사용 가능',
    tone: 'ready',
  };
}

/** @deprecated 새 화면은 상태·원인까지 포함한 resolveAlarmHealthState를 사용합니다. */
export function resolveAlarmAccessSummary(
  input: AlarmHealthStateInput,
): AlarmAccessSummary {
  const { issueCode: _issueCode, status: _status, ...summary } =
    resolveAlarmHealthState(input);
  return summary;
}
