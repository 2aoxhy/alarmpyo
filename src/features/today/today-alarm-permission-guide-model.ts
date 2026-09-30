import { resolveAlarmPermissionReadinessViewModel } from '../alarm/alarm-permission-readiness-model';
import type { AlarmPyoAlarmStatus } from '../../services/alarmpyo-alarm-service';
import type { AlarmRequiredPermissionTarget } from '../../services/alarm-access-summary';

export type TodayAlarmPermissionGuideViewModel = {
  actionLabel: string;
  message: string;
  progressLabel: string;
  target: AlarmRequiredPermissionTarget;
  title: string;
};

const PERMISSION_ACTION_COPY: Record<AlarmRequiredPermissionTarget, string> = {
  'exact-alarm': '정확한 시각에 울리도록 허용합니다.',
  'alarm-notifications': '알람 화면과 소리를 허용합니다.',
  'full-screen': '잠금 화면에서도 알람을 표시하도록 허용합니다.',
};

export function resolveTodayAlarmPermissionGuide(input: {
  alarmEnabled: boolean;
  platformSupported: boolean;
  status: AlarmPyoAlarmStatus | null;
}): TodayAlarmPermissionGuideViewModel | null {
  if (
    !input.alarmEnabled ||
    !input.platformSupported ||
    !input.status?.supported
  ) {
    return null;
  }

  const readiness = resolveAlarmPermissionReadinessViewModel(input.status);
  if (!readiness.nextRequiredTarget || !readiness.nextRequiredLabel) return null;

  return {
    actionLabel: '설정',
    message: `${readiness.summary} · ${PERMISSION_ACTION_COPY[readiness.nextRequiredTarget]}`,
    progressLabel: readiness.summary,
    target: readiness.nextRequiredTarget,
    title: `${readiness.nextRequiredLabel} 권한 필요`,
  };
}
