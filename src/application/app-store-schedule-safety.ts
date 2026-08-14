import type { AppData } from '../models/app-data';
import { markAlarmDisableSyncPending } from '../services/alarm-sync-policy';
import {
  analyzeActualAppDataScheduleSafety,
  type ActualAppDataScheduleSafetyResult,
  type AnalyzeActualAppDataScheduleSafetyOptions,
} from '../services/app-data-schedule-safety-service';

export type ScheduleSafetyEnforcementMode = 'ingress' | 'mutation';

export type EnforcedScheduleSafety = {
  alarmsDisabled: boolean;
  data: AppData | null;
  safety: ActualAppDataScheduleSafetyResult;
};

export type EnforceAppDataScheduleSafetyOptions =
  AnalyzeActualAppDataScheduleSafetyOptions & {
    mode?: ScheduleSafetyEnforcementMode;
  };

/**
 * 반복 순서뿐 아니라 날짜별 근무·시간·예외·알람 변경을 실제 날짜축으로 검사해요.
 * 지원하지 않는 이전 ID는 자료를 지우지 않되 네이티브 알람은 fail-closed로 막습니다.
 */
export function analyzeAppDataScheduleSafety(
  data: AppData,
  options: AnalyzeActualAppDataScheduleSafetyOptions = {},
): ActualAppDataScheduleSafetyResult {
  return analyzeActualAppDataScheduleSafety(data, options);
}

/**
 * 사용자 편집에서 겹치는 근무는 저장 전에 거절해요. 반면 load/import/restore 같은
 * ingress에서는 자료를 보존하고 근무 알람만 꺼서 손실 없이 안전하게 열 수 있어요.
 */
export function enforceAppDataScheduleSafety(
  data: AppData,
  options: EnforceAppDataScheduleSafetyOptions = {},
): EnforcedScheduleSafety {
  const { mode = 'mutation', ...analysisOptions } = options;
  const safety = analyzeAppDataScheduleSafety(data, analysisOptions);
  if (!safety.canSave && mode === 'mutation') {
    return { alarmsDisabled: false, data: null, safety };
  }
  if (safety.canEnableAlarms || !data.settings.notificationsEnabled) {
    return { alarmsDisabled: false, data, safety };
  }
  return {
    alarmsDisabled: true,
    safety,
    data: {
      ...data,
      settings: {
        ...data.settings,
        notificationsEnabled: false,
        ...markAlarmDisableSyncPending(data.settings),
      },
    },
  };
}
