import {
  getExpectedNativeScheduledAlarmCount,
  isAlarmPyoAlarmScheduleSynchronized,
  type AlarmAutoCheckStatus,
} from './alarm-sync-policy';
import type { AlarmPyoAlarmStatus } from './alarmpyo-alarm-service';

export type AlarmAccessAction =
  | 'none'
  | 'open-settings'
  | 'open-full-screen-settings'
  | 'open-dnd-settings'
  | 'open-battery-settings'
  | 'resync'
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

type AlarmAccessSummaryInput = {
  actualScheduledCount?: number;
  alarmAutoCheckStatus?: AlarmAutoCheckStatus;
  alarmStatus: AlarmPyoAlarmStatus | null;
  alarmStatusError: boolean;
  alarmSyncFailed?: boolean;
  notificationsEnabled: boolean;
  totalPlannedAlarmCount?: number;
  platformSupported: boolean;
};

function persistedSafetyNote({
  actualScheduledCount,
  alarmStatus,
  totalPlannedAlarmCount,
}: Pick<
  AlarmAccessSummaryInput,
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
export function resolveAlarmAccessSummary({
  actualScheduledCount,
  alarmAutoCheckStatus = 'idle',
  alarmStatus,
  alarmStatusError,
  alarmSyncFailed = false,
  notificationsEnabled,
  totalPlannedAlarmCount,
  platformSupported,
}: AlarmAccessSummaryInput): AlarmAccessSummary {
  if (!platformSupported) {
    return {
      action: 'none',
      canTest: false,
      description: '근무 알람은 안드로이드 휴대폰에서 사용할 수 있어요.',
      title: '안드로이드 전용 기능이에요',
      tone: 'neutral',
    };
  }

  if (!notificationsEnabled) {
    return {
      action: 'none',
      canTest: false,
      description: '스위치를 켜면 다음 근무에 맞춰 알람을 자동으로 예약해요.',
      title: '알람을 사용하지 않아요',
      tone: 'neutral',
    };
  }

  if (alarmStatusError) {
    return {
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
      action: 'none',
      canTest: false,
      description: '휴대폰의 알람 권한을 확인하고 있어요.',
      title: '알람 상태를 확인하고 있어요',
      tone: 'neutral',
    };
  }

  if (!alarmStatus.supported) {
    return {
      action: 'none',
      canTest: false,
      description: '이 휴대폰에서는 알람표 알람을 사용할 수 없어요.',
      title: '알람을 지원하지 않아요',
      tone: 'warning',
    };
  }

  if (alarmStatus.storageHealth === 'corrupt') {
    return {
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

  // 실제 시험 알람은 잠금 화면 표시가 필요해요. 예약 오류를 먼저 안내하더라도
  // 전체 화면 권한이 없으면 실행할 수 없는 시험 버튼은 활성화하지 않아요.
  const canTestAlarm = alarmStatus.fullScreenAllowed;

  if (alarmSyncFailed) {
    return {
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
    Date.now() >= alarmStatus.plannedThroughAt
  ) {
    return {
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
    Date.now() >= alarmStatus.planRefreshRecommendedAt
  ) {
    return {
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

  if (alarmStatus.doNotDisturbMaySilenceAlarm) {
    return {
      action: 'open-dnd-settings',
      actionLabel: '방해 금지 설정 확인하기',
      canTest: canTestAlarm,
      description:
        '현재 방해 금지 설정에서는 알람 소리가 차단될 수 있어요. 알람 허용 여부를 확인해 주세요.',
      title: '방해 금지에서 알람을 확인해 주세요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.fullScreenAllowed) {
    return {
      action: 'open-full-screen-settings',
      actionLabel: '전체 화면 알람 설정하기',
      canTest: false,
      description:
        '알람 예약과 소리는 준비됐어요. 잠금 화면과 시험 알람을 사용하려면 전체 화면 알람을 허용해 주세요.',
      title: '전체 화면 알람을 추가로 허용해 주세요',
      tone: 'warning',
    };
  }

  if (alarmStatus.alarmVolume <= 0) {
    return {
      action: 'none',
      canTest: true,
      description: '권한은 준비됐어요. 휴대폰의 알람 음량만 높여 주세요.',
      title: '알람 음량이 0이에요',
      tone: 'warning',
    };
  }

  if (!alarmStatus.batteryOptimizationIgnored) {
    return {
      action: 'open-battery-settings',
      actionLabel: '배터리 설정 열기',
      canTest: true,
      description:
        '앱을 오래 열지 않아도 안정적으로 울리도록 알람표의 배터리 사용을 제한하지 않음으로 설정해 주세요.',
      title: '배터리 사용 제한을 확인해 주세요',
      tone: 'warning',
    };
  }

  if (alarmAutoCheckStatus === 'checking') {
    return {
      action: 'none',
      canTest: true,
      description: '가까운 알람과 근무표가 일치하는지 확인하고 있어요.',
      title: '알람 예약을 점검하고 있어요',
      tone: 'neutral',
    };
  }

  if (alarmAutoCheckStatus === 'recovered') {
    return {
      action: 'none',
      canTest: true,
      description: '자동 점검에서 누락된 예약을 찾아 근무표에 맞춰 다시 등록했어요.',
      title: '누락된 알람을 복구했어요',
      tone: 'ready',
    };
  }

  if (alarmAutoCheckStatus === 'error') {
    return {
      action: 'resync',
      actionLabel: '다시 점검하기',
      canTest: true,
      description: '저장된 근무표는 그대로 있어요. 알람 예약만 다시 점검해 주세요.',
      title: '자동 점검을 마치지 못했어요',
      tone: 'warning',
    };
  }

  return {
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
