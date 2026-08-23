import {
  resolveAlarmPermissionReadiness,
  type AlarmRequiredPermissionTarget,
} from '../../services/alarm-access-summary';
import type {
  AlarmPyoAlarmStatus,
  AlarmPyoPermissionSettingsDestination,
  AlarmPyoPermissionSettingsLaunchResult,
  AlarmPyoPermissionSettingsTarget,
} from '../../services/alarmpyo-alarm-service';

export type AlarmPermissionReadinessItemId =
  | AlarmRequiredPermissionTarget
  | 'battery-optimization'
  | 'do-not-disturb'
  | 'alarm-volume';

export type AlarmPermissionReadinessItem = {
  description: string;
  id: AlarmPermissionReadinessItemId;
  label: string;
  ready: boolean;
  target: AlarmPyoPermissionSettingsTarget | null;
};

export type AlarmPermissionReadinessViewModel = {
  nextRequiredLabel: string | null;
  nextRequiredTarget: AlarmRequiredPermissionTarget | null;
  readyRequiredCount: number;
  recommended: readonly AlarmPermissionReadinessItem[];
  required: readonly AlarmPermissionReadinessItem[];
  requiredTotal: 3;
  summary: string;
};

export type AlarmPermissionLaunchNotice = {
  message: string;
  title: string;
  tone: 'neutral' | 'warning';
};

const REQUIRED_LABELS: Record<AlarmRequiredPermissionTarget, string> = {
  'exact-alarm': '정확한 알람',
  'alarm-notifications': '알림',
  'full-screen': '전체 화면 알람',
};

export function resolveAlarmPermissionReadinessViewModel(
  status: AlarmPyoAlarmStatus,
): AlarmPermissionReadinessViewModel {
  const readiness = resolveAlarmPermissionReadiness(status);
  const required: readonly AlarmPermissionReadinessItem[] = [
    {
      id: 'exact-alarm',
      label: REQUIRED_LABELS['exact-alarm'],
      description: status.exactAlarmAllowed
        ? '허용됨'
        : '정확한 시각에 울리도록 허용',
      ready: status.exactAlarmAllowed,
      target: 'exact-alarm',
    },
    {
      id: 'alarm-notifications',
      label: REQUIRED_LABELS['alarm-notifications'],
      description: status.notificationsAllowed
        ? '허용됨'
        : '알람 화면과 소리 허용',
      ready: status.notificationsAllowed,
      target: 'alarm-notifications',
    },
    {
      id: 'full-screen',
      label: REQUIRED_LABELS['full-screen'],
      description: status.fullScreenAllowed
        ? '허용됨'
        : '잠금 화면 알람 허용',
      ready: status.fullScreenAllowed,
      target: 'full-screen',
    },
  ];
  const recommended: readonly AlarmPermissionReadinessItem[] = [
    {
      id: 'battery-optimization',
      label: '배터리 제한',
      description: status.batteryOptimizationIgnored
        ? '제한 없음'
        : '알람표를 제한 없음으로 설정',
      ready: status.batteryOptimizationIgnored,
      target: 'battery-optimization',
    },
    {
      id: 'do-not-disturb',
      label: '방해 금지',
      description: status.doNotDisturbMaySilenceAlarm
        ? '알람 소리가 차단될 수 있음'
        : status.doNotDisturbActive
          ? '알람 소리 허용됨'
          : '사용 안 함',
      ready: !status.doNotDisturbMaySilenceAlarm,
      target: 'do-not-disturb',
    },
    {
      id: 'alarm-volume',
      label: '알람 음량',
      description:
        status.alarmVolume > 0
          ? `현재 ${status.alarmVolume} · 휴대폰 음량 버튼으로 조절`
          : '현재 0 · 휴대폰 음량 버튼으로 조절',
      ready: status.alarmVolume > 0,
      target: null,
    },
  ];

  return {
    nextRequiredLabel: readiness.nextRequiredTarget
      ? REQUIRED_LABELS[readiness.nextRequiredTarget]
      : null,
    nextRequiredTarget: readiness.nextRequiredTarget,
    readyRequiredCount: readiness.readyRequiredCount,
    recommended,
    required,
    requiredTotal: readiness.requiredTotal,
    summary: `필수 권한 ${readiness.readyRequiredCount}/${readiness.requiredTotal}`,
  };
}

export function parseAlarmPermissionFocusTarget(
  value: string | string[] | undefined,
): AlarmPermissionReadinessItemId | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  switch (normalized) {
    case 'exact-alarm':
    case 'alarm-notifications':
    case 'full-screen':
    case 'battery-optimization':
    case 'do-not-disturb':
    case 'alarm-volume':
      return normalized;
    default:
      return null;
  }
}

export function resolveAlarmPermissionReturnFocus(
  status: AlarmPyoAlarmStatus | null,
  requestedTarget: AlarmPyoPermissionSettingsTarget,
): AlarmPermissionReadinessItemId {
  if (status) {
    const nextRequired = resolveAlarmPermissionReadiness(status).nextRequiredTarget;
    if (nextRequired) return nextRequired;
  }
  switch (requestedTarget) {
    case 'exact-alarm':
    case 'alarm-notifications':
    case 'full-screen':
    case 'battery-optimization':
    case 'do-not-disturb':
      return requestedTarget;
    case 'sleep-notifications':
    case 'app-details':
      return 'alarm-notifications';
  }
}

function destinationLabel(
  destination: AlarmPyoPermissionSettingsDestination | null,
): string {
  switch (destination) {
    case 'exact-alarm':
      return '정확한 알람 설정';
    case 'app-notifications':
    case 'alarm-channel':
      return '알람 알림 설정';
    case 'sleep-channel':
      return '수면 알림 설정';
    case 'full-screen':
      return '전체 화면 알람 설정';
    case 'do-not-disturb':
      return '방해 금지 설정';
    case 'sound':
      return '소리 설정';
    case 'battery-optimization':
      return '배터리 최적화 앱 목록';
    case 'app-details':
      return '알람표 앱 정보';
    case 'application-settings':
      return '앱 설정 목록';
    case 'system-settings':
      return '휴대폰 설정';
    case null:
      return '휴대폰 설정';
  }
}

export function resolveAlarmPermissionLaunchNotice(
  result: AlarmPyoPermissionSettingsLaunchResult,
): AlarmPermissionLaunchNotice {
  const openedLabel = destinationLabel(result.openedTarget);
  if (result.fallbackUsed) {
    const message =
      result.requestedTarget === 'battery-optimization'
        ? `${openedLabel}이 열렸습니다. 전용 목록이 아니면 배터리에서 알람표의 백그라운드 사용을 제한하지 않음으로 설정해야 합니다.`
        : result.requestedTarget === 'full-screen'
          ? `${openedLabel}이 열렸습니다. 전체 화면 알람 전용 항목이 없으면 알림 또는 특별 접근 권한에서 알람표를 확인해야 합니다.`
          : `${openedLabel}이 열렸습니다. 전용 화면을 열 수 없어 대신 열린 화면에서 알람표 항목을 확인해야 합니다.`;
    return {
      message,
      title: '대체 설정 화면이 열렸습니다',
      tone: 'warning',
    };
  }

  const message =
    result.requestedTarget === 'battery-optimization'
      ? `${openedLabel}에서 알람표를 찾아 제한 없음으로 설정한 뒤 앱으로 돌아오면 상태를 다시 확인합니다. Samsung에서는 배터리의 백그라운드 사용 제한도 함께 확인해야 합니다.`
      : result.requestedTarget === 'do-not-disturb'
        ? `${openedLabel}에서 알람 소리가 허용되는지 확인한 뒤 앱으로 돌아오면 상태를 다시 확인합니다.`
        : `${openedLabel}에서 알람표를 허용한 뒤 앱으로 돌아오면 상태를 다시 확인합니다.`;
  return {
    message,
    title: `${openedLabel} 안내`,
    tone: 'neutral',
  };
}
