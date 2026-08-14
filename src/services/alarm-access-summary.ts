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
  | 'open-full-screen-settings'
  | 'open-dnd-settings'
  | 'open-battery-settings'
  | 'open-sleep-settings'
  | 'resync'
  | 'retry-sleep-reminders'
  | 'retry';
export type AlarmAccessTone = 'neutral' | 'ready' | 'warning';

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
  sleepReminderSyncFailed?: boolean;
  totalPlannedAlarmCount?: number;
  platformSupported: boolean;
};

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
    ? ` 최근 안전 점검에서 ${labels.join('·')}도 함께 확인이 필요했어요.`
    : '';
}

/**
 * 알람 화면에는 지금 필요한 조치 하나만 보여 줘요.
 * 네이티브 설정 화면도 정확한 알람 → 알림 → 전체 화면 순서로 열려요.
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
  sleepReminderSyncFailed = false,
  totalPlannedAlarmCount,
  platformSupported,
}: AlarmHealthStateInput): AlarmHealthState {
  if (!Number.isFinite(now)) {
    throw new RangeError('알람 상태 기준 시각이 올바르지 않아요.');
  }
  if (!platformSupported) {
    return {
      status: 'disabled',
      issueCode: 'platform-unsupported',
      action: 'none',
      canTest: false,
      description: '근무 알람은 안드로이드 휴대폰에서 사용할 수 있어요.',
      title: '안드로이드 전용 기능이에요',
      tone: 'neutral',
    };
  }

  if (!notificationsEnabled) {
    return {
      status: 'disabled',
      issueCode: 'notifications-disabled',
      action: 'none',
      canTest: false,
      description: '스위치를 켜면 다음 근무에 맞춰 알람을 자동으로 예약해요.',
      title: '알람을 사용하지 않아요',
      tone: 'neutral',
    };
  }

  if (alarmStatusError) {
    return {
      status: 'error',
      issueCode: 'status-unavailable',
      action: 'retry',
      actionLabel: '다시 확인하기',
      canTest: false,
      description: '저장된 근무표는 그대로 있어요. 알람 상태만 다시 확인해 주세요.',
      title: '상태를 확인하지 못했어요',
      tone: 'warning',
    };
  }

  if (!alarmStatus) {
    return {
      status: 'checking',
      issueCode: null,
      action: 'none',
      canTest: false,
      description: '휴대폰의 알람 권한을 확인하고 있어요.',
      title: '알람 상태를 확인하고 있어요',
      tone: 'neutral',
    };
  }

  if (!alarmStatus.supported) {
    return {
      status: 'error',
      issueCode: 'status-unavailable',
      action: 'none',
      canTest: false,
      description: '이 휴대폰에서는 알람표 알람을 사용할 수 없어요.',
      title: '알람을 지원하지 않아요',
      tone: 'warning',
    };
  }

  if (alarmStatus.storageHealth === 'corrupt') {
    return {
      status: 'action-required',
      issueCode: 'alarm-storage',
      action: 'resync',
      actionLabel: '알람 저장 정보 복구하기',
      canTest: false,
      description: '기기 안의 알람 예약 정보가 손상됐어요. 저장된 근무표로 안전하게 다시 만들어요.',
      title: '알람 저장 정보를 복구해야 해요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.exactAlarmAllowed) {
    return {
      status: 'action-required',
      issueCode: 'alarm-permissions',
      action: 'open-settings',
      actionLabel: '알람 권한 설정하기',
      canTest: false,
      description: '근무 시각에 맞춰 울리도록 알람 및 리마인더 권한을 허용해 주세요.',
      title: '정확한 알람을 허용해 주세요',
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
      action: 'open-settings',
      actionLabel: '알람 권한 설정하기',
      canTest: false,
      description:
        alarmStatus.triggerState === 'delivery-blocked'
          ? `예정된 알람은 유지 중이에요. 알람 화면과 소리가 전달되도록 알람표 알림 권한을 허용해 주세요.${safetyNote}`
          : `알람 화면과 소리가 전달되도록 알람표 알림 권한을 허용해 주세요.${safetyNote}`,
      title:
        alarmStatus.triggerState === 'delivery-blocked'
          ? '예약은 유지되고 알림 전달만 차단됐어요'
          : '알람 알림을 허용해 주세요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.fullScreenAllowed) {
    return {
      status: 'action-required',
      issueCode: 'alarm-permissions',
      action: 'open-full-screen-settings',
      actionLabel: '전체 화면 알람 설정하기',
      canTest: false,
      description:
        '잠금 화면과 시험 알람을 사용하려면 전체 화면 알람을 허용해 주세요.',
      title: '전체 화면 알람을 허용해 주세요',
      tone: 'warning',
    };
  }

  const canTestAlarm = true;

  if (alarmSyncFailed) {
    return {
      status: 'action-required',
      issueCode: 'alarm-schedule',
      action: 'resync',
      actionLabel: '다시 예약하기',
      canTest: canTestAlarm,
      description: '변경 내용은 저장됐어요. 알람 예약만 근무표에 맞춰 다시 시도해 주세요.',
      title: '알람을 다시 예약해야 해요',
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
      actionLabel: '다음 알람 다시 예약하기',
      canTest: canTestAlarm,
      description: '저장된 알람 계획의 유효 기간이 끝났어요. 근무표로 다시 예약해 주세요.',
      title: '알람 계획이 만료됐어요',
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
      actionLabel: '다음 알람 이어서 예약하기',
      canTest: canTestAlarm,
      description: '저장된 근무표로 다음 366일 알람 계획을 안전하게 이어서 예약해요.',
      title: '알람 계획을 갱신할 시기예요',
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
      actionLabel: '근무표에 맞춰 다시 예약하기',
      canTest: canTestAlarm,
      description:
        expectedScheduledCount === 0
          ? `예정된 근무는 없지만 알람 ${actualScheduledCount}개가 남아 있어요. 다시 예약해 주세요.`
          : `다음 알람 ${expectedScheduledCount}개 중 ${actualScheduledCount}개가 예약됐어요. 근무표에 맞춰 다시 예약해 주세요.`,
      title: '알람 예약이 근무표와 맞지 않아요',
      tone: 'warning',
    };
  }

  if (alarmAutoCheckStatus === 'error') {
    return {
      status: 'action-required',
      issueCode: 'alarm-schedule',
      action: 'resync',
      actionLabel: '다시 점검하기',
      canTest: true,
      description: '저장된 근무표는 그대로 있어요. 알람 예약만 다시 점검해 주세요.',
      title: '자동 점검을 마치지 못했어요',
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
        description: '현재 설치본에서는 수면 시작 알림 상태를 확인할 수 없어요.',
        title: '수면 알림을 지원하지 않아요',
        tone: 'warning',
      };
    }
    if (sleepReminderStatusError) {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-status',
        action: 'retry-sleep-reminders',
        actionLabel: '수면 알림 다시 확인하기',
        canTest: true,
        description: '근무 알람 예약은 그대로 있어요. 수면 알림 상태만 다시 확인해 주세요.',
        title: '수면 알림 상태를 확인하지 못했어요',
        tone: 'warning',
      };
    }
    if (!sleepReminderStatus) {
      return {
        status: 'checking',
        issueCode: null,
        action: 'none',
        canTest: true,
        description: '근무 알람에 이어 수면 시작 알림 상태를 확인하고 있어요.',
        title: '수면 알림을 확인하고 있어요',
        tone: 'neutral',
      };
    }
    if (!sleepReminderStatus.supported) {
      return {
        status: 'error',
        issueCode: 'sleep-reminder-status',
        action: 'none',
        canTest: true,
        description: '현재 설치본에서는 수면 시작 알림 상태를 확인할 수 없어요.',
        title: '수면 알림을 지원하지 않아요',
        tone: 'warning',
      };
    }
    if (sleepReminderStatus.storageHealth === 'corrupt') {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-storage',
        action: 'retry-sleep-reminders',
        actionLabel: '수면 알림 계획 복구하기',
        canTest: true,
        description: '기존 예약은 임의로 지우지 않았어요. 현재 일정으로 복구를 다시 시도해 주세요.',
        title: '수면 알림 계획을 복구해야 해요',
        tone: 'warning',
      };
    }
    if (!sleepReminderStatus.notificationsAllowed) {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-permissions',
        action: 'open-sleep-settings',
        actionLabel: '수면 알림 권한 설정하기',
        canTest: true,
        description: '참고 취침 시각에 알림을 받도록 일반 알림 권한을 허용해 주세요.',
        title: '수면 알림 권한을 허용해 주세요',
        tone: 'warning',
      };
    }
    if (sleepReminderSyncFailed) {
      return {
        status: 'action-required',
        issueCode: 'sleep-reminder-schedule',
        action: 'retry-sleep-reminders',
        actionLabel: '수면 알림 다시 갱신하기',
        canTest: true,
        description: '자료는 저장됐어요. 수면 알림 계획만 현재 일정에 맞춰 다시 갱신해 주세요.',
        title: '수면 알림을 다시 갱신해야 해요',
        tone: 'warning',
      };
    }
  }

  if (alarmStatus.doNotDisturbMaySilenceAlarm) {
    return {
      status: 'action-required',
      issueCode: 'do-not-disturb',
      action: 'open-dnd-settings',
      actionLabel: '방해 금지 설정 확인하기',
      canTest: canTestAlarm,
      description:
        '현재 방해 금지 설정에서는 알람 소리가 차단될 수 있어요. 알람 허용 여부를 확인해 주세요.',
      title: '방해 금지에서 알람을 확인해 주세요',
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
      description:
        '앱을 오래 열지 않아도 안정적으로 울리도록 알람표의 배터리 사용을 제한하지 않음으로 설정해 주세요.',
      title: '배터리 사용 제한을 확인해 주세요',
      tone: 'warning',
    };
  }

  if (alarmStatus.alarmVolume <= 0) {
    return {
      status: 'action-required',
      issueCode: 'alarm-volume',
      action: 'none',
      canTest: true,
      description: '권한은 준비됐어요. 휴대폰의 알람 음량만 높여 주세요.',
      title: '알람 음량이 0이에요',
      tone: 'warning',
    };
  }

  if (alarmAutoCheckStatus === 'checking') {
    return {
      status: 'checking',
      issueCode: null,
      action: 'none',
      canTest: true,
      description: '가까운 알람과 근무표가 일치하는지 확인하고 있어요.',
      title: '알람 예약을 점검하고 있어요',
      tone: 'neutral',
    };
  }

  if (alarmAutoCheckStatus === 'recovered') {
    return {
      status: 'ready',
      issueCode: null,
      action: 'none',
      canTest: true,
      description: '자동 점검에서 누락된 예약을 찾아 근무표에 맞춰 다시 등록했어요.',
      title: '누락된 알람을 복구했어요',
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
        ? '근무표와 가까운 알람이 일치해요. 누락되면 앱을 열 때 자동으로 복구해요.'
        : '전체 화면으로 울리고, 끄지 않으면 5분 뒤 한 번 더 울려요.',
    title:
      alarmAutoCheckStatus === 'ready'
        ? '자동 점검 완료'
        : '알람이 준비됐어요',
    tone: 'ready',
  };
}

/** @deprecated 새 화면은 상태·원인까지 포함한 resolveAlarmHealthState를 사용해요. */
export function resolveAlarmAccessSummary(
  input: AlarmHealthStateInput,
): AlarmAccessSummary {
  const { issueCode: _issueCode, status: _status, ...summary } =
    resolveAlarmHealthState(input);
  return summary;
}
